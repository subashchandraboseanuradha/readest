import { NextResponse } from 'next/server';
import { embed, embedMany, createGateway } from 'ai';
import { validateUserAndToken } from '@/utils/access';
import { OPENROUTER_DEFAULTS } from '@/services/ai/constants';

const looksLikeOpenRouterKey = (key: string) => key.trim().startsWith('sk-or-');

/**
 * OpenRouter (and other OpenAI-compatible) embeddings via direct REST.
 * Vercel `createGateway` rejects sk-or-… keys, so we never send those there.
 */
async function embedViaOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  modelId: string,
  texts: string[],
  single: boolean,
): Promise<Response> {
  const url = `${baseUrl.replace(/\/+$/, '')}/embeddings`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://readest.com',
      'X-Title': 'Readest',
    },
    body: JSON.stringify({
      model: modelId,
      input: texts.length === 1 ? texts[0] : texts,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    return NextResponse.json(
      {
        error: `Embedding failed (${res.status}): ${errBody.slice(0, 280) || res.statusText}`,
      },
      { status: 500 },
    );
  }

  const data = (await res.json()) as {
    data?: { embedding: number[]; index: number }[];
  };
  const rows = Array.isArray(data.data) ? data.data : [];
  const sorted = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const embeddings = sorted.map((r) => r.embedding).filter(Boolean);

  if (single) {
    return NextResponse.json({ embedding: embeddings[0] });
  }
  return NextResponse.json({ embeddings });
}

export async function POST(req: Request): Promise<Response> {
  try {
    const {
      texts,
      single,
      apiKey,
      model: bodyModel,
      baseUrl: bodyBaseUrl,
    } = await req.json();

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json({ error: 'Texts array required' }, { status: 400 });
    }

    // BYOK: client may send its own key (Settings → AI) without a
    // Readest login. Server-default AI_GATEWAY_API_KEY still requires auth so
    // anonymous callers cannot burn shared quota.
    const clientKey = typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : '';
    if (!clientKey) {
      const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
      if (!user || !token) {
        return NextResponse.json(
          {
            error:
              'Not authenticated. Sign in, or add your own AI Gateway / OpenRouter API key in Settings → AI.',
          },
          { status: 403 },
        );
      }
    }

    const gatewayApiKey = clientKey || process.env['AI_GATEWAY_API_KEY'];
    if (!gatewayApiKey) {
      return NextResponse.json(
        {
          error:
            'API key required. Add an AI Gateway or OpenRouter key in Settings → AI, or sign in.',
        },
        { status: 401 },
      );
    }

    const embedModelId =
      (typeof bodyModel === 'string' && bodyModel.trim()) ||
      process.env['AI_GATEWAY_EMBEDDING_MODEL'] ||
      OPENROUTER_DEFAULTS.embeddingModel;

    const explicitBase =
      typeof bodyBaseUrl === 'string' && bodyBaseUrl.trim()
        ? bodyBaseUrl.trim().replace(/\/+$/, '')
        : '';

    // OpenRouter keys, or any BYOK with an explicit OpenAI-compatible base URL:
    // use REST embeddings with Bearer (never createGateway for sk-or-…).
    if (looksLikeOpenRouterKey(gatewayApiKey) || explicitBase) {
      const normalized = embedModelId.includes('/')
        ? embedModelId
        : looksLikeOpenRouterKey(gatewayApiKey) || explicitBase.includes('openrouter')
          ? `openai/${embedModelId}`
          : embedModelId;
      const base =
        explicitBase ||
        (looksLikeOpenRouterKey(gatewayApiKey)
          ? OPENROUTER_DEFAULTS.baseUrl
          : OPENROUTER_DEFAULTS.baseUrl);
      return embedViaOpenAICompatible(
        base,
        gatewayApiKey.trim(),
        normalized,
        texts,
        !!single,
      );
    }

    const gateway = createGateway({ apiKey: gatewayApiKey });
    const model = gateway.embeddingModel(embedModelId);

    if (single) {
      const { embedding } = await embed({ model, value: texts[0] });
      return NextResponse.json({ embedding });
    } else {
      const { embeddings } = await embedMany({ model, values: texts });
      return NextResponse.json({ embeddings });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const friendly = /invalid api key|authentication failed|missing authentication/i.test(
      errorMessage,
    )
      ? `${errorMessage} — Check Settings → AI: use an OpenRouter sk-or-… key with OpenRouter base URL for indexing, or a Vercel AI Gateway key for the AI Gateway provider.`
      : errorMessage;
    return NextResponse.json({ error: `Embedding failed: ${friendly}` }, { status: 500 });
  }
}
