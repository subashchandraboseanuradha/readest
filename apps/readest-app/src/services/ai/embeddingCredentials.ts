/**
 * Resolve where book-indexing embeddings should go.
 * Chat can stay on Cerebras; embeddings can use OpenRouter (or the same host).
 */

import type { AISettings } from './types';
import { OPENROUTER_DEFAULTS, EMBEDDING_VIA_OPENROUTER } from './constants';

/** Hosts that offer chat but no usable /embeddings for RAG. */
export const CHAT_ONLY_EMBED_HOSTS = [
  'api.cerebras.ai',
  'api.perplexity.ai',
  'api.groq.com',
  'api.x.ai',
] as const;

export function hostFromBaseUrl(baseUrl: string): string {
  try {
    return new URL(baseUrl.trim() || OPENROUTER_DEFAULTS.baseUrl).host.toLowerCase();
  } catch {
    return '';
  }
}

export function isChatOnlyEmbedHost(baseUrl: string): boolean {
  const host = hostFromBaseUrl(baseUrl);
  return CHAT_ONLY_EMBED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export function isChatOnlyEmbeddingEndpoint(settings: AISettings): boolean {
  if (settings.provider !== 'openrouter') return false;
  return isChatOnlyEmbedHost(settings.openrouterBaseUrl || OPENROUTER_DEFAULTS.baseUrl);
}

export type ResolvedEmbeddingCredentials = {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** true when using a dedicated OpenRouter (or other) embed key separate from chat */
  separateFromChat: boolean;
  /** true when no embed API is configured and caller should use BM25-only */
  bm25Only: boolean;
};

/**
 * Pick credentials for embeddings.
 *
 * Priority:
 *  1. Explicit embeddingApiKey (+ optional embeddingBaseUrl) — e.g. OpenRouter while chat is Cerebras
 *  2. Same chat OpenAI-compatible host, if it supports embeddings
 *  3. BM25-only (no second API) when chat host is chat-only and no embed key is set
 */
export function resolveEmbeddingCredentials(settings: AISettings): ResolvedEmbeddingCredentials {
  const chatKey = (settings.openrouterApiKey || '').trim();
  const chatBase = (settings.openrouterBaseUrl || OPENROUTER_DEFAULTS.baseUrl)
    .trim()
    .replace(/\/+$/, '');
  const model = (
    settings.openrouterEmbeddingModel || OPENROUTER_DEFAULTS.embeddingModel
  ).trim();
  const embedKey = (settings.embeddingApiKey || '').trim();
  const embedBase = (settings.embeddingBaseUrl || EMBEDDING_VIA_OPENROUTER.baseUrl)
    .trim()
    .replace(/\/+$/, '');

  if (embedKey) {
    return {
      apiKey: embedKey,
      baseUrl: embedBase || OPENROUTER_DEFAULTS.baseUrl,
      model,
      separateFromChat: true,
      bm25Only: false,
    };
  }

  if (settings.provider === 'openrouter' && chatKey && !isChatOnlyEmbedHost(chatBase)) {
    return {
      apiKey: chatKey,
      baseUrl: chatBase,
      model,
      separateFromChat: false,
      bm25Only: false,
    };
  }

  // Cerebras / Groq / … with no separate OpenRouter embed key → local keyword index
  if (settings.provider === 'openrouter' && isChatOnlyEmbedHost(chatBase)) {
    return {
      apiKey: '',
      baseUrl: '',
      model: 'bm25-only',
      separateFromChat: false,
      bm25Only: true,
    };
  }

  // AI Gateway path uses gateway key elsewhere; here return empty for openrouter helper
  return {
    apiKey: chatKey,
    baseUrl: chatBase || OPENROUTER_DEFAULTS.baseUrl,
    model,
    separateFromChat: false,
    bm25Only: !chatKey,
  };
}
