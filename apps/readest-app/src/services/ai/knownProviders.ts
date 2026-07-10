/**
 * Static catalog of known AI endpoints / backends.
 *
 * No remote “add provider” API — entries are hardcoded from each provider’s
 * public docs (base URL, key page, sensible default models). Users pick a
 * known entry in Settings; we fill base URL + recommended models locally.
 *
 * Runtime wiring still maps to {@link AIProviderName}:
 *  - `openrouter` → any OpenAI-compatible HTTP API (OpenRouter, OpenAI, Groq, …)
 *  - `ai-gateway` → Vercel AI Gateway
 *  - `ollama` → local Ollama
 */

import type { AIProviderName, AISettings } from './types';
import { OPENROUTER_DEFAULTS } from './constants';

/** Stable ids for catalog entries (not the same as runtime AIProviderName). */
export type KnownProviderId =
  | 'openrouter'
  | 'openai'
  | 'groq'
  | 'together'
  | 'deepseek'
  | 'fireworks'
  | 'mistral'
  | 'cerebras'
  | 'sambanova'
  | 'perplexity'
  | 'xai'
  | 'nvidia'
  | 'github-models'
  | 'cloudflare'
  | 'ollama'
  | 'ai-gateway'
  | 'custom';

export type KnownProviderKind = 'openai-compatible' | 'ollama' | 'ai-gateway' | 'custom';

export type KnownModelPreset = {
  id: string;
  label: string;
};

export interface KnownProvider {
  id: KnownProviderId;
  /** UI label */
  name: string;
  kind: KnownProviderKind;
  /** Maps to AISettings.provider when this entry is applied */
  runtimeProvider: AIProviderName;
  /** Short help text for Settings */
  description: string;
  /** Official product site */
  websiteUrl?: string;
  /** Inference / API docs (OpenAI-compatible setup, models, etc.) */
  docsUrl?: string;
  /** Where to create an API key */
  keysUrl?: string;
  /** OpenAI-compatible base URL (no trailing slash), if applicable */
  baseUrl?: string;
  /**
   * Optional key prefixes used for auto-detect (e.g. sk-or-).
   * Matching is case-sensitive prefix on the trimmed key.
   */
  apiKeyPrefixes?: readonly string[];
  defaultChatModel?: string;
  defaultEmbeddingModel?: string;
  defaultImageModel?: string;
  /** Quick picks for chat model dropdown when live /models is empty */
  chatModelPresets?: readonly KnownModelPreset[];
  /** GET {baseUrl}/models is supported (OpenAI-compatible) */
  supportsModelsList: boolean;
  requiresApiKey: boolean;
  /** Highlight as the default cloud recommendation */
  recommended?: boolean;
}

/** Cerebras Inference public models (https://inference-docs.cerebras.ai/models/overview). */
export const CEREBRAS_CHAT_PRESETS: readonly KnownModelPreset[] = [
  { id: 'gpt-oss-120b', label: 'GPT OSS 120B (production)' },
  { id: 'gemma-4-31b', label: 'Gemma 4 31B (preview)' },
  { id: 'zai-glm-4.7', label: 'Z.ai GLM 4.7 (preview)' },
] as const;

/**
 * All known providers. Order is intentional: recommended cloud first,
 * then popular OpenAI-compatible hosts, then local / gateway / custom.
 */
export const KNOWN_PROVIDERS: readonly KnownProvider[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    kind: 'openai-compatible',
    runtimeProvider: 'openrouter',
    description:
      'One key for many models (chat, embeddings, image). Best default for Readest cloud BYOK.',
    websiteUrl: 'https://openrouter.ai',
    keysUrl: 'https://openrouter.ai/keys',
    baseUrl: OPENROUTER_DEFAULTS.baseUrl,
    apiKeyPrefixes: ['sk-or-'],
    defaultChatModel: OPENROUTER_DEFAULTS.chatModel,
    defaultEmbeddingModel: OPENROUTER_DEFAULTS.embeddingModel,
    defaultImageModel: OPENROUTER_DEFAULTS.imageModel,
    supportsModelsList: true,
    requiresApiKey: true,
    recommended: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'openai-compatible',
    runtimeProvider: 'openrouter',
    description: 'Official OpenAI API (chat, embeddings, images).',
    websiteUrl: 'https://platform.openai.com',
    keysUrl: 'https://platform.openai.com/api-keys',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyPrefixes: ['sk-'],
    defaultChatModel: 'gpt-4o-mini',
    defaultEmbeddingModel: 'text-embedding-3-small',
    defaultImageModel: 'gpt-image-1',
    supportsModelsList: true,
    requiresApiKey: true,
  },
  {
    id: 'groq',
    name: 'Groq',
    kind: 'openai-compatible',
    runtimeProvider: 'openrouter',
    description: 'Fast OpenAI-compatible inference.',
    websiteUrl: 'https://groq.com',
    keysUrl: 'https://console.groq.com/keys',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyPrefixes: ['gsk_'],
    defaultChatModel: 'llama-3.3-70b-versatile',
    defaultEmbeddingModel: undefined,
    supportsModelsList: true,
    requiresApiKey: true,
  },
  {
    id: 'together',
    name: 'Together AI',
    kind: 'openai-compatible',
    runtimeProvider: 'openrouter',
    description: 'Open-source models via OpenAI-compatible API.',
    websiteUrl: 'https://www.together.ai',
    keysUrl: 'https://api.together.xyz/settings/api-keys',
    baseUrl: 'https://api.together.xyz/v1',
    defaultChatModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    defaultEmbeddingModel: 'togethercomputer/m2-bert-80M-8k-retrieval',
    supportsModelsList: true,
    requiresApiKey: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'openai-compatible',
    runtimeProvider: 'openrouter',
    description: 'DeepSeek chat models (OpenAI-compatible).',
    websiteUrl: 'https://www.deepseek.com',
    keysUrl: 'https://platform.deepseek.com/api_keys',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultChatModel: 'deepseek-chat',
    supportsModelsList: true,
    requiresApiKey: true,
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    kind: 'openai-compatible',
    runtimeProvider: 'openrouter',
    description: 'Fast open models (OpenAI-compatible).',
    websiteUrl: 'https://fireworks.ai',
    keysUrl: 'https://fireworks.ai/account/api-keys',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    defaultChatModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    supportsModelsList: true,
    requiresApiKey: true,
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    kind: 'openai-compatible',
    runtimeProvider: 'openrouter',
    description: 'Mistral models via OpenAI-compatible API.',
    websiteUrl: 'https://mistral.ai',
    keysUrl: 'https://console.mistral.ai/api-keys',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultChatModel: 'mistral-small-latest',
    defaultEmbeddingModel: 'mistral-embed',
    supportsModelsList: true,
    requiresApiKey: true,
  },
  {
    id: 'cerebras',
    name: 'Cerebras Inference',
    kind: 'openai-compatible',
    runtimeProvider: 'openrouter',
    description:
      'Ultra-fast OpenAI-compatible chat (https://api.cerebras.ai/v1). Production: gpt-oss-120b. Chat uses your Cerebras key; for book embeddings + Illustrate paste an OpenRouter sk-or-… key under Book indexing (Cerebras cannot generate images).',
    websiteUrl: 'https://www.cerebras.ai',
    docsUrl: 'https://inference-docs.cerebras.ai/',
    keysUrl: 'https://cloud.cerebras.ai',
    baseUrl: 'https://api.cerebras.ai/v1',
    // Docs use CEREBRAS_API_KEY; keys are opaque (no stable public prefix).
    defaultChatModel: 'gpt-oss-120b',
    chatModelPresets: CEREBRAS_CHAT_PRESETS,
    // Cerebras is chat-only; Illustrate uses OpenRouter with this model when dual-keyed.
    defaultImageModel: OPENROUTER_DEFAULTS.imageModel,
    // List models: GET https://api.cerebras.ai/v1/models
    supportsModelsList: true,
    requiresApiKey: true,
  },
  {
    id: 'sambanova',
    name: 'SambaNova',
    kind: 'openai-compatible',
    runtimeProvider: 'openrouter',
    description: 'SambaNova Cloud OpenAI-compatible API.',
    websiteUrl: 'https://sambanova.ai',
    keysUrl: 'https://cloud.sambanova.ai',
    baseUrl: 'https://api.sambanova.ai/v1',
    defaultChatModel: 'Meta-Llama-3.3-70B-Instruct',
    supportsModelsList: true,
    requiresApiKey: true,
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    kind: 'openai-compatible',
    runtimeProvider: 'openrouter',
    description: 'Perplexity chat (OpenAI-compatible).',
    websiteUrl: 'https://www.perplexity.ai',
    keysUrl: 'https://www.perplexity.ai/settings/api',
    baseUrl: 'https://api.perplexity.ai',
    defaultChatModel: 'sonar',
    supportsModelsList: false,
    requiresApiKey: true,
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    kind: 'openai-compatible',
    runtimeProvider: 'openrouter',
    description: 'xAI Grok models (OpenAI-compatible).',
    websiteUrl: 'https://x.ai',
    keysUrl: 'https://console.x.ai',
    baseUrl: 'https://api.x.ai/v1',
    defaultChatModel: 'grok-3-mini',
    supportsModelsList: true,
    requiresApiKey: true,
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    kind: 'openai-compatible',
    runtimeProvider: 'openrouter',
    description: 'NVIDIA integrate API (OpenAI-compatible).',
    websiteUrl: 'https://build.nvidia.com',
    keysUrl: 'https://build.nvidia.com',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultChatModel: 'meta/llama-3.1-8b-instruct',
    supportsModelsList: true,
    requiresApiKey: true,
  },
  {
    id: 'github-models',
    name: 'GitHub Models',
    kind: 'openai-compatible',
    runtimeProvider: 'openrouter',
    description: 'GitHub Models marketplace (OpenAI-compatible).',
    websiteUrl: 'https://github.com/marketplace/models',
    keysUrl: 'https://github.com/settings/tokens',
    baseUrl: 'https://models.inference.ai.azure.com',
    defaultChatModel: 'gpt-4o-mini',
    defaultEmbeddingModel: 'text-embedding-3-small',
    supportsModelsList: true,
    requiresApiKey: true,
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare Workers AI',
    kind: 'openai-compatible',
    runtimeProvider: 'openrouter',
    description:
      'Workers AI OpenAI-compatible gateway. Replace {account_id} in the base URL with your account id.',
    websiteUrl: 'https://developers.cloudflare.com/workers-ai',
    keysUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1',
    defaultChatModel: '@cf/meta/llama-3.1-8b-instruct',
    supportsModelsList: false,
    requiresApiKey: true,
  },
  {
    id: 'ai-gateway',
    name: 'Vercel AI Gateway',
    kind: 'ai-gateway',
    runtimeProvider: 'ai-gateway',
    description: 'Vercel AI Gateway multi-model routing (use a Vercel key, not sk-or-).',
    websiteUrl: 'https://vercel.com/docs/ai-gateway',
    keysUrl: 'https://vercel.com/account/ai',
    baseUrl: 'https://ai-gateway.vercel.sh/v1',
    apiKeyPrefixes: ['vck_'],
    defaultChatModel: 'google/gemini-2.5-flash-lite',
    defaultEmbeddingModel: 'openai/text-embedding-3-small',
    defaultImageModel: OPENROUTER_DEFAULTS.imageModel,
    supportsModelsList: false,
    requiresApiKey: true,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    kind: 'ollama',
    runtimeProvider: 'ollama',
    description: 'Fully local models via Ollama. No cloud API key.',
    websiteUrl: 'https://ollama.com',
    baseUrl: 'http://127.0.0.1:11434',
    defaultChatModel: 'llama3.2',
    defaultEmbeddingModel: 'nomic-embed-text',
    supportsModelsList: true,
    requiresApiKey: false,
  },
  {
    id: 'custom',
    name: 'Custom OpenAI-compatible',
    kind: 'custom',
    runtimeProvider: 'openrouter',
    description:
      'Any other OpenAI-compatible server (vLLM, LiteLLM, LocalAI, LM Studio, etc.). Set base URL yourself.',
    baseUrl: '',
    supportsModelsList: true,
    requiresApiKey: true,
  },
] as const;

const byId = new Map<KnownProviderId, KnownProvider>(
  KNOWN_PROVIDERS.map((p) => [p.id, p]),
);

/** All catalog entries (immutable). */
export function getKnownProviders(): readonly KnownProvider[] {
  return KNOWN_PROVIDERS;
}

/** Lookup by catalog id. */
export function getKnownProvider(id: KnownProviderId): KnownProvider | undefined {
  return byId.get(id);
}

/** OpenAI-compatible presets (including OpenRouter + custom). */
export function getOpenAICompatibleProviders(): readonly KnownProvider[] {
  return KNOWN_PROVIDERS.filter(
    (p) => p.kind === 'openai-compatible' || p.kind === 'custom',
  );
}

/** Runtime providers shown as top-level choices (one entry per AIProviderName). */
export function getRuntimeProviderChoices(): readonly KnownProvider[] {
  const preferred: KnownProviderId[] = ['openrouter', 'ai-gateway', 'ollama'];
  return preferred
    .map((id) => byId.get(id))
    .filter((p): p is KnownProvider => !!p);
}

/**
 * Match a pasted API key to a known provider via key prefix.
 * Longer / more specific prefixes win (e.g. sk-or- before sk-).
 */
export function detectKnownProviderFromApiKey(apiKey: string): KnownProvider | undefined {
  const key = apiKey.trim();
  if (!key) return undefined;

  let best: KnownProvider | undefined;
  let bestLen = -1;

  for (const p of KNOWN_PROVIDERS) {
    for (const prefix of p.apiKeyPrefixes ?? []) {
      if (prefix && key.startsWith(prefix) && prefix.length > bestLen) {
        // sk- alone is too broad if sk-or- also matches — prefer longer.
        best = p;
        bestLen = prefix.length;
      }
    }
  }
  return best;
}

/**
 * Match base URL host to a known OpenAI-compatible provider.
 * Ignores trailing slashes; host comparison is case-insensitive.
 */
export function detectKnownProviderFromBaseUrl(baseUrl: string): KnownProvider | undefined {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) return undefined;

  // Exact base URL match first (after normalize)
  for (const p of KNOWN_PROVIDERS) {
    if (!p.baseUrl || p.id === 'custom' || p.id === 'cloudflare') continue;
    if (normalizeBaseUrl(p.baseUrl) === normalized) return p;
  }

  // Host-based fallback
  let host: string;
  try {
    host = new URL(normalized).host.toLowerCase();
  } catch {
    return undefined;
  }

  for (const p of KNOWN_PROVIDERS) {
    if (!p.baseUrl || p.id === 'custom') continue;
    try {
      const catalogHost = new URL(p.baseUrl.replace('{account_id}', 'x')).host.toLowerCase();
      if (catalogHost === host) return p;
    } catch {
      /* skip bad catalog URL */
    }
  }
  return undefined;
}

export function normalizeBaseUrl(url: string): string {
  return (url || '').trim().replace(/\/+$/, '');
}

export type ApplyKnownProviderOptions = {
  /** When true, always overwrite model fields with catalog defaults (if set). */
  forceModels?: boolean;
};

/**
 * Build a partial AISettings patch for the selected known provider.
 * Does not touch API keys (user still pastes those).
 */
export function applyKnownProviderToSettings(
  knownId: KnownProviderId,
  current: AISettings,
  options: ApplyKnownProviderOptions = {},
): Partial<AISettings> {
  const known = getKnownProvider(knownId);
  if (!known) {
    throw new Error(`Unknown known provider id: ${knownId}`);
  }

  const force = !!options.forceModels;
  const patch: Partial<AISettings> = {
    provider: known.runtimeProvider,
  };

  switch (known.runtimeProvider) {
    case 'ollama': {
      if (known.baseUrl) {
        patch.ollamaBaseUrl = known.baseUrl;
      }
      if (force || !current.ollamaModel) {
        if (known.defaultChatModel) patch.ollamaModel = known.defaultChatModel;
      }
      if (force || !current.ollamaEmbeddingModel) {
        if (known.defaultEmbeddingModel) {
          patch.ollamaEmbeddingModel = known.defaultEmbeddingModel;
        }
      }
      break;
    }
    case 'ai-gateway': {
      if (force || !current.aiGatewayModel) {
        if (known.defaultChatModel) patch.aiGatewayModel = known.defaultChatModel;
      }
      if (force || !current.aiGatewayEmbeddingModel) {
        if (known.defaultEmbeddingModel) {
          patch.aiGatewayEmbeddingModel = known.defaultEmbeddingModel;
        }
      }
      if (force || !current.imageGenerationModel) {
        if (known.defaultImageModel) patch.imageGenerationModel = known.defaultImageModel;
      }
      break;
    }
    case 'openrouter': {
      // custom may have empty baseUrl — leave existing URL unless catalog has one
      if (known.baseUrl) {
        patch.openrouterBaseUrl = known.baseUrl;
      } else if (known.id === 'custom' && force) {
        // keep whatever URL the user already has
      }
      if (force || !current.openrouterModel) {
        if (known.defaultChatModel) patch.openrouterModel = known.defaultChatModel;
      }
      if (force || !current.openrouterEmbeddingModel) {
        if (known.defaultEmbeddingModel) {
          patch.openrouterEmbeddingModel = known.defaultEmbeddingModel;
        }
      }
      if (force || !current.imageGenerationModel) {
        if (known.defaultImageModel) {
          patch.imageGenerationModel = known.defaultImageModel;
        }
      }
      break;
    }
    default:
      break;
  }

  return patch;
}

/**
 * Resolve which catalog entry best matches current settings (for UI select value).
 */
export function resolveKnownProviderFromSettings(settings: AISettings): KnownProviderId {
  if (settings.provider === 'ollama') return 'ollama';
  if (settings.provider === 'ai-gateway') return 'ai-gateway';

  // OpenAI-compatible path: prefer key detection, then base URL, then openrouter default
  const key =
    settings.openrouterApiKey?.trim() ||
    (settings.aiGatewayApiKey?.trim().startsWith('sk-or-')
      ? settings.aiGatewayApiKey.trim()
      : '');
  if (key) {
    const fromKey = detectKnownProviderFromApiKey(key);
    // Only use key match when it is an openai-compatible catalog entry
    if (fromKey && fromKey.runtimeProvider === 'openrouter' && fromKey.id !== 'custom') {
      // sk- matches OpenAI but OpenRouter keys are sk-or- (already preferred by length)
      // If user has OpenRouter base URL with an OpenAI-looking key, prefer URL.
      const fromUrl = detectKnownProviderFromBaseUrl(settings.openrouterBaseUrl || '');
      if (fromUrl && fromUrl.id !== fromKey.id && fromUrl.id === 'openrouter') {
        return 'openrouter';
      }
      return fromKey.id;
    }
  }

  const fromUrl = detectKnownProviderFromBaseUrl(settings.openrouterBaseUrl || '');
  if (fromUrl && fromUrl.runtimeProvider === 'openrouter') {
    return fromUrl.id;
  }

  if (!settings.openrouterBaseUrl || settings.openrouterBaseUrl === OPENROUTER_DEFAULTS.baseUrl) {
    return 'openrouter';
  }

  return 'custom';
}

/** Catalog integrity: every runtime AIProviderName has at least one entry. */
export function listRuntimeProvidersCovered(): AIProviderName[] {
  const set = new Set<AIProviderName>();
  for (const p of KNOWN_PROVIDERS) {
    set.add(p.runtimeProvider);
  }
  return [...set];
}
