import type { AISettings } from './types';

// cheapest popular models as of 2025
export const GATEWAY_MODELS = {
  GEMINI_FLASH_LITE: 'google/gemini-2.5-flash-lite',
  GPT_5_NANO: 'openai/gpt-5-nano',
  LLAMA_4_SCOUT: 'meta/llama-4-scout',
  GROK_4_1_FAST: 'xai/grok-4.1-fast-reasoning',
  DEEPSEEK_V3_2: 'deepseek/deepseek-v3.2',
  QWEN_3_235B: 'alibaba/qwen-3-235b',
} as const;

export const MODEL_PRICING: Record<string, { input: string; output: string }> = {
  [GATEWAY_MODELS.GEMINI_FLASH_LITE]: { input: '0.1', output: '0.4' },
  [GATEWAY_MODELS.GPT_5_NANO]: { input: '0.05', output: '0.4' },
  [GATEWAY_MODELS.LLAMA_4_SCOUT]: { input: '0.08', output: '0.3' },
  [GATEWAY_MODELS.GROK_4_1_FAST]: { input: '0.2', output: '0.5' },
  [GATEWAY_MODELS.DEEPSEEK_V3_2]: { input: '0.27', output: '0.4' },
  [GATEWAY_MODELS.QWEN_3_235B]: { input: '0.07', output: '0.46' },
};

/** Sensible OpenRouter model ids for chat, RAG embeddings, and illustrate. */
export const OPENROUTER_DEFAULTS = {
  baseUrl: 'https://openrouter.ai/api/v1',
  /** Cheap, capable chat for Reedy + image-prompt craft */
  chatModel: 'openai/gpt-4o-mini',
  /** Required for book indexing / RAG search */
  embeddingModel: 'openai/text-embedding-3-small',
  /** Image-capable model for selection → Illustrate (OpenRouter GA id) */
  imageModel: 'google/gemini-2.5-flash-image',
} as const;

/** Quick picks shown in Settings when using OpenRouter */
export const OPENROUTER_CHAT_PRESETS = [
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini (recommended)' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku' },
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
] as const;

/** OpenRouter-hosted embedding models (not Vercel AI Gateway). */
export const OPENROUTER_EMBED_PRESETS = [
  {
    id: 'openai/text-embedding-3-small',
    label: 'OpenAI text-embedding-3-small (recommended, cheap)',
  },
  {
    id: 'openai/text-embedding-3-large',
    label: 'OpenAI text-embedding-3-large (higher quality)',
  },
  {
    id: 'google/gemini-embedding-001',
    label: 'Google gemini-embedding-001',
  },
  {
    id: 'qwen/qwen3-embedding-8b',
    label: 'Qwen3 Embedding 8B',
  },
] as const;

/** Where to get an OpenRouter key for embeddings (when chat is Cerebras, etc.). */
export const EMBEDDING_VIA_OPENROUTER = {
  baseUrl: OPENROUTER_DEFAULTS.baseUrl,
  keysUrl: 'https://openrouter.ai/keys',
  docsHint:
    'Book search needs an embedding API. Cerebras is chat-only — use OpenRouter for embeddings (your Cerebras key stays for chat). Not Vercel.',
} as const;

export const OPENROUTER_IMAGE_PRESETS = [
  { id: 'google/gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image (recommended)' },
  { id: 'google/gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image (preview)' },
  { id: 'openai/gpt-5-image-mini', label: 'GPT Image Mini' },
  { id: 'black-forest-labs/flux.2-pro', label: 'FLUX.2 Pro' },
] as const;

/** Retired OpenRouter image model ids → current replacements (avoids 404). */
export const OPENROUTER_IMAGE_MODEL_ALIASES: Record<string, string> = {
  'google/gemini-2.5-flash-image-preview': 'google/gemini-2.5-flash-image',
  'google/gemini-2.0-flash-exp:free': 'google/gemini-2.5-flash-image',
};

export const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: false,
  // Prefer OpenRouter for cloud BYOK (chat + RAG + illustrate).
  provider: 'openrouter',

  ollamaBaseUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'llama3.2',
  ollamaEmbeddingModel: 'nomic-embed-text',

  aiGatewayModel: 'google/gemini-2.5-flash-lite',
  aiGatewayEmbeddingModel: 'openai/text-embedding-3-small',

  openrouterBaseUrl: OPENROUTER_DEFAULTS.baseUrl,
  openrouterModel: OPENROUTER_DEFAULTS.chatModel,
  openrouterEmbeddingModel: OPENROUTER_DEFAULTS.embeddingModel,

  imageGenerationModel: OPENROUTER_DEFAULTS.imageModel,

  spoilerProtection: true,
  maxContextChunks: 10,
  indexingMode: 'on-demand',
  reedy: { enabled: false },
};
