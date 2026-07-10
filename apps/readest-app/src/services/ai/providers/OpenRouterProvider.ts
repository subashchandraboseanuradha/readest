import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel, EmbeddingModel } from 'ai';
import type { AIProvider, AISettings, AIProviderName } from '../types';
import { aiLogger } from '../logger';
import { AI_TIMEOUTS } from '../utils/retry';
import { getAIFetch } from '../utils/httpFetch';
import { createProxiedEmbeddingModel } from './ProxiedGatewayEmbedding';
import { resolveEmbeddingCredentials } from '../embeddingCredentials';

import { OPENROUTER_DEFAULTS } from '../constants';

const DEFAULT_BASE_URL = OPENROUTER_DEFAULTS.baseUrl;
const DEFAULT_MODEL = OPENROUTER_DEFAULTS.chatModel;
const DEFAULT_EMBEDDING_MODEL = OPENROUTER_DEFAULTS.embeddingModel;

/**
 * Provider for any OpenAI-compatible /v1/chat/completions endpoint, with
 * OpenRouter as the default. Users supply their own API key and base URL.
 *
 * Distinct from `AIGatewayProvider` (which is bound to Vercel AI Gateway's
 * proprietary protocol) — this one targets the OpenAI REST schema and so
 * works with OpenRouter, Together, Groq, vLLM, LiteLLM, OpenAI itself, etc.
 *
 * Transport: every outbound HTTP call from this provider is routed through
 * {@link getAIFetch} so that in the Tauri app it goes via the Rust
 * `@tauri-apps/plugin-http` transport (no CORS preflight, no Android
 * cleartext block, behaves like `curl`). In a pure web build it falls
 * back to `window.fetch` and the upstream must serve correct CORS headers.
 */
export class OpenRouterProvider implements AIProvider {
  id: AIProviderName = 'openrouter';
  name = 'OpenRouter (Custom)';
  requiresAuth = true;

  private settings: AISettings;
  private client: ReturnType<typeof createOpenAICompatible>;
  private baseUrl: string;
  private apiKey: string;
  private httpFetch: typeof fetch;

  constructor(settings: AISettings) {
    this.settings = settings;
    const key = (settings.openrouterApiKey || '').trim();
    if (!key) {
      throw new Error('OpenRouter API key required');
    }
    this.apiKey = key;
    this.baseUrl = (settings.openrouterBaseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.httpFetch = getAIFetch();
    // Set Authorization both via apiKey and headers — some SDK/path combos
    // drop one of them; OpenRouter returns "Missing Authentication header".
    this.client = createOpenAICompatible({
      name: 'openrouter',
      baseURL: this.baseUrl,
      apiKey: this.apiKey,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        // OpenRouter app attribution (ignored by other OpenAI-compatible hosts).
        'HTTP-Referer': 'https://readest.com',
        'X-Title': 'Readest',
      },
      // Route chat completions through our environment-aware fetch so
      // streaming bypasses the renderer's CORS sandbox in Tauri.
      fetch: this.httpFetch,
    });
    aiLogger.provider.init('openrouter', settings.openrouterModel || DEFAULT_MODEL);
  }

  getModel(): LanguageModel {
    const modelId = this.settings.openrouterModel || DEFAULT_MODEL;
    return this.client.chatModel(modelId);
  }

  getEmbeddingModel(): EmbeddingModel {
    const creds = resolveEmbeddingCredentials(this.settings);

    if (creds.bm25Only) {
      throw new Error(
        'This chat host has no embeddings API. Add an OpenRouter key under “Book indexing (embeddings)” in Settings → AI, or Index will use local keyword search only.',
      );
    }

    if (!creds.apiKey) {
      throw new Error(
        'No embedding API key. For Cerebras chat, paste an OpenRouter sk-or-… key under Book indexing (embeddings), model openai/text-embedding-3-small. Not Vercel.',
      );
    }

    const modelId = (creds.model || DEFAULT_EMBEDDING_MODEL).trim();
    // OpenRouter expects provider/model ids (e.g. openai/text-embedding-3-small)
    const normalized =
      creds.baseUrl.includes('openrouter.ai') && !modelId.includes('/')
        ? `openai/${modelId}`
        : modelId.includes('/')
          ? modelId
          : modelId;

    // Prefer explicit BYOK POST (Bearer always present).
    if (typeof window !== 'undefined' || creds.separateFromChat) {
      return createProxiedEmbeddingModel({
        apiKey: creds.apiKey,
        model: normalized,
        baseUrl: creds.baseUrl,
      });
    }

    // Same host as chat — reuse SDK client
    return this.client.textEmbeddingModel(normalized);
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const modelId = this.settings.openrouterModel || DEFAULT_MODEL;
      aiLogger.provider.init('openrouter', `healthCheck starting with model: ${modelId}`);
      // OpenAI-compatible servers all expose /models for listing; using it
      // as a lightweight check (no token spend, fast).
      const response = await this.httpFetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(AI_TIMEOUTS.HEALTH_CHECK),
      });
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      aiLogger.provider.init('openrouter', 'healthCheck success');
      return true;
    } catch (e) {
      aiLogger.provider.error('openrouter', `healthCheck failed: ${(e as Error).message}`);
      return false;
    }
  }
}

/**
 * Lightweight model entry returned by an OpenAI-compatible `/models`
 * endpoint. Only the fields we actually consume are typed; the upstream
 * response is allowed to carry arbitrary extras (OpenRouter for example
 * returns pricing, context length, modality, etc).
 */
export interface OpenRouterModelInfo {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
}

/**
 * Fetch the list of models exposed by an OpenAI-compatible endpoint.
 * Used by the settings UI to populate a model picker.
 *
 * Goes through {@link getAIFetch} so that in Tauri the request hits the
 * Rust HTTP transport rather than the renderer, avoiding CORS preflight
 * and Android cleartext restrictions.
 */
export async function fetchOpenRouterModels(
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<OpenRouterModelInfo[]> {
  const trimmed = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const url = `${trimmed}/models`;
  const httpFetch = getAIFetch();
  const response = await httpFetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }
  const json = (await response.json()) as { data?: OpenRouterModelInfo[] };
  return Array.isArray(json.data) ? json.data : [];
}
