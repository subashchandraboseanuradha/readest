import type { EmbeddingModel } from 'ai';
import { getAIFetch } from '../utils/httpFetch';
import { getAccessToken } from '@/utils/access';
import { OPENROUTER_DEFAULTS } from '../constants';

interface ProxiedEmbeddingOptions {
  apiKey: string;
  model?: string;
  /**
   * OpenAI-compatible base URL (no trailing slash).
   * Prefer always passing this explicitly. If omitted:
   *  - sk-or-… → OpenRouter
   *  - otherwise → OpenRouter still (not Vercel), unless caller set Vercel intentionally.
   */
  baseUrl?: string;
}

/** Only use when provider is explicitly AI Gateway. */
const VERCEL_GATEWAY_BASE = 'https://ai-gateway.vercel.sh/v1';

function buildEmbedAuthHint(
  apiKey: string,
  baseUrl: string,
  errBody: string,
  status: number,
): string {
  const host = (() => {
    try {
      return new URL(baseUrl).host;
    } catch {
      return baseUrl || 'unknown host';
    }
  })();
  const detail = errBody ? ` Upstream (${status}): ${errBody.slice(0, 160)}` : ` HTTP ${status}.`;

  if (host.includes('cerebras')) {
    return (
      `Embedding failed at Cerebras.${detail} ` +
      `Cerebras is chat-only. Keep your Cerebras key for chat. For book Index either: ` +
      `(1) leave embeddings empty → free local keyword search, or ` +
      `(2) add an OpenRouter sk-or-… key under “Book indexing (embeddings)” with model openai/text-embedding-3-small. Not Vercel.`
    );
  }
  if (apiKey.startsWith('sk-or-') || host.includes('openrouter')) {
    return (
      `Embedding authentication failed at OpenRouter.${detail} ` +
      `Check your OpenRouter key (must start with sk-or-) at https://openrouter.ai/keys ` +
      `and base URL https://openrouter.ai/api/v1. Suggested model: openai/text-embedding-3-small.`
    );
  }
  if (host.includes('openai.com')) {
    return (
      `Embedding authentication failed at OpenAI.${detail} ` +
      `Use a valid OpenAI API key with base https://api.openai.com/v1.`
    );
  }
  if (host.includes('ai-gateway.vercel') || host.includes('vercel')) {
    return (
      `Embedding authentication failed at Vercel AI Gateway.${detail} ` +
      `Only use AI Gateway if you chose that provider on purpose. ` +
      `For Cerebras chat + OpenRouter embeddings, set Provider to OpenAI-compatible → Cerebras, ` +
      `and put sk-or-… under Book indexing (embeddings) — not under AI Gateway.`
    );
  }
  return (
    `Embedding authentication failed at ${host}.${detail} ` +
    `API key must match this base URL. Chat-only hosts (Cerebras, Groq): use OpenRouter for embeddings or local keyword Index.`
  );
}

/**
 * Browser-safe embedding model (BYOK). Does not require Readest login.
 *
 * 1. Direct POST `{baseUrl}/embeddings` with Bearer key
 * 2. Fallback POST `/api/ai/embed` with the same key (CORS)
 */
export function createProxiedEmbeddingModel(options: ProxiedEmbeddingOptions): EmbeddingModel {
  const apiKey = options.apiKey?.trim() || '';
  const isOpenRouterKey = apiKey.startsWith('sk-or-');
  let modelId = options.model || OPENROUTER_DEFAULTS.embeddingModel;
  if ((isOpenRouterKey || (options.baseUrl || '').includes('openrouter')) && modelId && !modelId.includes('/')) {
    modelId = `openai/${modelId}`;
  }

  // Never silently default a random/Cerebras key to Vercel — that produced the
  // confusing "Create a Vercel AI Gateway key" error. Prefer OpenRouter default
  // when base is omitted; only use Vercel if explicitly requested.
  const explicitBase = (options.baseUrl || '').trim().replace(/\/+$/, '');
  const baseUrl =
    explicitBase ||
    (isOpenRouterKey ? OPENROUTER_DEFAULTS.baseUrl : OPENROUTER_DEFAULTS.baseUrl);

  return {
    specificationVersion: 'v3',
    modelId,
    provider: 'openai-compatible-proxied',
    maxEmbeddingsPerCall: 100,
    supportsParallelCalls: false,

    async doEmbed({ values }: { values: string[] }) {
      if (!apiKey) {
        throw new Error(
          'No embedding API key. For Cerebras chat, either Index with local keywords (no embed key), or add OpenRouter sk-or-… under Settings → AI → Book indexing (embeddings).',
        );
      }

      const httpFetch = getAIFetch();

      try {
        const direct = await httpFetch(`${baseUrl}/embeddings`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'HTTP-Referer': 'https://readest.com',
            'X-Title': 'Readest',
          },
          body: JSON.stringify({
            model: modelId,
            input: values.length === 1 ? values[0] : values,
          }),
        });

        if (direct.ok) {
          const data = (await direct.json()) as {
            data?: { embedding: number[]; index: number }[];
          };
          const rows = Array.isArray(data.data) ? data.data : [];
          const sorted = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
          const embeddings = sorted.map((r) => r.embedding).filter(Boolean);
          if (embeddings.length === values.length) {
            return { embeddings, warnings: [] as const };
          }
        } else {
          const errBody = await direct.text().catch(() => '');
          if (
            direct.status === 401 ||
            direct.status === 403 ||
            /invalid api key|authentication failed|missing authentication/i.test(errBody)
          ) {
            throw new Error(buildEmbedAuthHint(apiKey, baseUrl, errBody, direct.status));
          }
          // Non-auth failure: still try proxy, then surface
          throw new Error(
            `Embedding failed (${direct.status}) at ${baseUrl}: ${errBody.slice(0, 200) || direct.statusText}`,
          );
        }
      } catch (e) {
        if (
          e instanceof Error &&
          (/authentication failed|Embedding failed|No embedding API key|chat-only|Cerebras|OpenRouter/i.test(
            e.message,
          ))
        ) {
          // Don't fall through to Vercel proxy with the wrong key
          throw e;
        }
        // Network/CORS only → app proxy
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        const token = await getAccessToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch {
        /* BYOK does not require login */
      }

      const response = await fetch('/api/ai/embed', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          texts: values,
          single: values.length === 1,
          apiKey,
          model: modelId,
          baseUrl,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        const msg = error.error || `Embedding failed: ${response.status}`;
        if (msg === 'Not authenticated' || response.status === 403) {
          throw new Error(
            'Embedding auth failed. Save your OpenRouter or OpenAI-compatible embedding key in Settings → AI (login not required for your own key).',
          );
        }
        throw new Error(msg);
      }

      const data = await response.json();

      if (values.length === 1 && data.embedding) {
        return { embeddings: [data.embedding], warnings: [] as const };
      }

      return { embeddings: data.embeddings, warnings: [] as const };
    },
  } as EmbeddingModel;
}

/** @deprecated Prefer OPENROUTER_DEFAULTS; kept for AI Gateway explicit path only */
export const VERCEL_AI_GATEWAY_EMBED_BASE = VERCEL_GATEWAY_BASE;
