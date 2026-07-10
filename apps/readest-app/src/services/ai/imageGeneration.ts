import type { AISettings } from './types';
import {
  DEFAULT_AI_SETTINGS,
  OPENROUTER_DEFAULTS,
  OPENROUTER_IMAGE_MODEL_ALIASES,
} from './constants';
import { getAIFetch } from './utils/httpFetch';
import { aiLogger } from './logger';

/** Default OpenRouter / OpenAI-compatible image model (override in AI settings). */
export const DEFAULT_IMAGE_MODEL = OPENROUTER_DEFAULTS.imageModel;

export type ImageGenStage = 'crafting' | 'generating';

export type GeneratedImage = {
  /** data:image/...;base64,... or https URL */
  src: string;
  /** Final image-model prompt (step 2 input) */
  prompt: string;
  /** Quoted source sentence from the book */
  citation: string;
  /** Image model id */
  model: string;
  /** Chat/LLM model used to craft the prompt */
  promptModel?: string;
};

export type GenerateImageInput = {
  selectionText: string;
  bookTitle?: string;
  author?: string;
  settings: AISettings;
  /** Optional extra style guidance */
  styleHint?: string;
  /** Progress for UI (craft prompt → generate image) */
  onStage?: (stage: ImageGenStage) => void;
};

type HostCreds = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

/** Split pipeline: prompt craft may use Cerebras; pixels always use an image-capable host. */
export type ImagePipelineCreds = {
  craft: HostCreds;
  image: HostCreds;
};

/** @deprecated use ImagePipelineCreds — kept for older call sites */
type ApiCreds = {
  baseUrl: string;
  apiKey: string;
  imageModel: string;
  chatModel: string;
};

/**
 * Instructions for step 1: turn a raw book quote into a concrete image prompt.
 * Output must be ONLY the image prompt — no preamble, no quotes around it.
 */
const PROMPT_CRAFT_SYSTEM = `You are an expert illustration director for a literary reading app.

Your job is to convert a short quoted passage from a book into ONE self-contained image-generation prompt that an image model can render faithfully.

Rules:
1. Infer concrete visual details implied by the quote: setting, subjects, actions, mood, era, weather, lighting, materials, camera angle.
2. Expand vague lines into specific visual scene description — do not leave abstract ideas as abstract (e.g. "freedom" becomes a concrete scene the quote implies).
3. Stay faithful to the quote: invent only what the text reasonably implies; do not contradict the passage or invent named characters not in the text unless the quote implies someone.
4. Write a single dense paragraph (2–6 sentences) suitable as an image prompt.
5. Include: subject(s), environment, composition, lighting, color palette, mood, style (e.g. literary illustration, cinematic, painterly).
6. Explicitly forbid: readable text, watermarks, logos, UI, borders, speech bubbles, captions, blurry faces when not needed.
7. Output ONLY the image prompt text. No title, no "Prompt:", no markdown, no quotation marks wrapping the whole answer.`;

const craftUserMessage = (input: GenerateImageInput): string => {
  const quote = input.selectionText.trim().replace(/\s+/g, ' ');
  const book = input.bookTitle?.trim();
  const author = input.author?.trim();
  const lines = [
    'Convert this book passage into a detailed image-generation prompt.',
    '',
    `Passage: “${quote}”`,
  ];
  if (book) lines.push(`Book: ${book}`);
  if (author) lines.push(`Author: ${author}`);
  if (input.styleHint?.trim()) {
    lines.push(`Preferred visual style: ${input.styleHint.trim()}`);
  } else {
    lines.push(
      'Preferred visual style: literary illustration, cinematic lighting, detailed, emotionally resonant.',
    );
  }
  lines.push('', 'Respond with only the final image prompt.');
  return lines.join('\n');
};

/** Fallback if the chat model is unavailable — still better than the raw line alone. */
const fallbackCraftedPrompt = (input: GenerateImageInput): string => {
  const quote = input.selectionText.trim().replace(/\s+/g, ' ');
  const book = input.bookTitle?.trim();
  const author = input.author?.trim();
  const source =
    book && author ? `from “${book}” by ${author}` : book ? `from “${book}”` : 'from a book';
  const style =
    input.styleHint?.trim() ||
    'literary illustration, cinematic lighting, detailed, painterly, no text, no watermark';
  return [
    `A single cohesive illustration ${source}, visualizing: ${quote}.`,
    `Depict the scene with concrete subjects, setting, and mood implied by those words.`,
    `Style: ${style}. No readable text, logos, or watermarks.`,
  ].join(' ');
};

/** OpenRouter keys always start with this prefix; Vercel AI Gateway keys do not. */
const looksLikeOpenRouterKey = (key: string) => key.trim().startsWith('sk-or-');

/** Hosts that do not offer image generation (chat-only). */
const IMAGE_UNAVAILABLE_HOSTS = [
  'api.cerebras.ai',
  'api.perplexity.ai',
  'api.groq.com',
  'api.x.ai',
];

const hostOf = (baseUrl: string) => {
  try {
    return new URL(baseUrl).host.toLowerCase();
  } catch {
    return '';
  }
};

const isImageUnavailableHost = (baseUrl: string) => {
  const host = hostOf(baseUrl);
  return IMAGE_UNAVAILABLE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
};

/**
 * Chat model ids that are NOT image generators (never send these to /images).
 */
const looksLikeNonImageModel = (modelId: string) => {
  const m = modelId.toLowerCase();
  if (/image|flux|dall-e|dalle|sdxl|imagen|stable-diffusion|midjourney|gpt-image/i.test(m)) {
    return false;
  }
  // Common chat-only ids (Cerebras, text LLMs)
  return /gpt-oss|llama|glm|gemma|claude|gpt-4o-mini|gpt-4o(?!-image)|deepseek|qwen|mistral|haiku|sonnet|opus/i.test(
    m,
  );
};

/** Map retired OpenRouter image model ids so saved settings don't 404. */
const normalizeImageModelId = (modelId: string): string => {
  const raw = modelId.trim();
  return (
    OPENROUTER_IMAGE_MODEL_ALIASES[raw] ||
    OPENROUTER_IMAGE_MODEL_ALIASES[raw.toLowerCase()] ||
    raw
  );
};

/** Always pick a real image model — never the Cerebras chat model by accident. */
export function resolveImageModelId(settings: AISettings): string {
  const raw =
    settings.imageGenerationModel?.trim() ||
    DEFAULT_AI_SETTINGS.imageGenerationModel ||
    DEFAULT_IMAGE_MODEL ||
    OPENROUTER_DEFAULTS.imageModel;
  if (!raw || looksLikeNonImageModel(raw)) {
    return OPENROUTER_DEFAULTS.imageModel;
  }
  return normalizeImageModelId(raw);
}

/**
 * Resolve split credentials for Illustrate:
 *  - craft (text LLM) may use Cerebras
 *  - image render always uses OpenRouter when an sk-or- key is available
 */
export function resolveImagePipeline(settings: AISettings): ImagePipelineCreds {
  const imageModel = resolveImageModelId(settings);
  const chatKey = settings.openrouterApiKey?.trim() || '';
  const gatewayKey = settings.aiGatewayApiKey?.trim() || '';
  const embedKey = settings.embeddingApiKey?.trim() || '';
  const chatBase = (
    settings.openrouterBaseUrl ||
    DEFAULT_AI_SETTINGS.openrouterBaseUrl ||
    OPENROUTER_DEFAULTS.baseUrl
  ).replace(/\/+$/, '');
  const chatModel =
    settings.openrouterModel?.trim() ||
    settings.aiGatewayModel?.trim() ||
    OPENROUTER_DEFAULTS.chatModel;

  // OpenRouter key sources (for pixels)
  const openRouterKey = looksLikeOpenRouterKey(embedKey)
    ? embedKey
    : looksLikeOpenRouterKey(chatKey)
      ? chatKey
      : looksLikeOpenRouterKey(gatewayKey)
        ? gatewayKey
        : '';
  const openRouterBase = (
    (looksLikeOpenRouterKey(embedKey) && settings.embeddingBaseUrl) ||
    OPENROUTER_DEFAULTS.baseUrl
  ).replace(/\/+$/, '');

  // --- Image host (must be image-capable) ---
  let image: HostCreds;
  if (openRouterKey) {
    image = {
      baseUrl: openRouterBase.includes('openrouter')
        ? OPENROUTER_DEFAULTS.baseUrl
        : openRouterBase,
      apiKey: openRouterKey,
      model: imageModel,
    };
  } else if (gatewayKey && !isImageUnavailableHost('https://ai-gateway.vercel.sh/v1')) {
    image = {
      baseUrl: 'https://ai-gateway.vercel.sh/v1',
      apiKey: gatewayKey,
      model: imageModel,
    };
  } else if (chatKey && !isImageUnavailableHost(chatBase) && looksLikeOpenRouterKey(chatKey)) {
    image = { baseUrl: OPENROUTER_DEFAULTS.baseUrl, apiKey: chatKey, model: imageModel };
  } else if (chatKey && !isImageUnavailableHost(chatBase)) {
    image = { baseUrl: chatBase, apiKey: chatKey, model: imageModel };
  } else {
    throw new Error(
      'Illustrate needs an image-capable API key. You have Cerebras for chat (good) — also paste an OpenRouter sk-or-… key under Settings → AI → Book indexing (embeddings). Image model defaults to google/gemini-2.5-flash-image (you do not need to invent one).',
    );
  }

  // --- Prompt craft (any chat LLM) ---
  let craft: HostCreds;
  if (chatKey && chatBase) {
    // Prefer user's chat host (Cerebras is fine for text prompt craft)
    craft = {
      baseUrl: chatBase,
      apiKey: chatKey,
      model: isImageUnavailableHost(chatBase)
        ? chatModel // e.g. gpt-oss-120b on Cerebras
        : looksLikeNonImageModel(chatModel)
          ? chatModel
          : OPENROUTER_DEFAULTS.chatModel,
    };
  } else if (openRouterKey) {
    craft = {
      baseUrl: OPENROUTER_DEFAULTS.baseUrl,
      apiKey: openRouterKey,
      model: OPENROUTER_DEFAULTS.chatModel,
    };
  } else {
    craft = { ...image, model: OPENROUTER_DEFAULTS.chatModel };
  }

  return { craft, image };
}

/** Legacy single-creds shape for older helpers. */
export const resolveCredentials = (settings: AISettings): ApiCreds | null => {
  try {
    const p = resolveImagePipeline(settings);
    return {
      baseUrl: p.image.baseUrl,
      apiKey: p.image.apiKey,
      imageModel: p.image.model,
      chatModel: p.craft.model,
    };
  } catch {
    return null;
  }
};

const extractChatText = (data: unknown): string | null => {
  if (!data || typeof data !== 'object') return null;
  const choices = (data as { choices?: unknown[] })['choices'];
  if (!Array.isArray(choices) || !choices[0]) return null;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  if (!message) return null;
  const content = message.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    const texts = content
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        const p = part as { type?: string; text?: string };
        if (p.type === 'text' && typeof p.text === 'string') return p.text;
        return '';
      })
      .filter(Boolean);
    if (texts.length) return texts.join('\n').trim();
  }
  return null;
};

/** Strip common LLM wrappers so the image model gets a clean prompt. */
const cleanCraftedPrompt = (raw: string): string => {
  let t = raw.trim();
  // Remove markdown fences
  t = t.replace(/^```(?:\w+)?\s*/i, '').replace(/\s*```$/i, '');
  // Remove leading "Prompt:" labels
  t = t.replace(/^(?:image\s*)?prompt\s*:\s*/i, '');
  // Unwrap a single pair of surrounding quotes
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith('“') && t.endsWith('”')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }
  return t;
};

/**
 * Step 1 — LLM crafts a detailed image prompt from the selected book line.
 */
export async function craftImagePromptFromCitation(
  input: GenerateImageInput,
  craft: HostCreds,
  httpFetch: typeof fetch,
): Promise<{ prompt: string; promptModel: string }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${craft.apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://readest.com',
    'X-Title': 'Readest',
  };

  const res = await httpFetch(`${craft.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: craft.model,
      temperature: 0.7,
      max_tokens: 600,
      messages: [
        { role: 'system', content: PROMPT_CRAFT_SYSTEM },
        { role: 'user', content: craftUserMessage(input) },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Prompt craft failed (${res.status}): ${errText.slice(0, 240)}`);
  }

  const data = await res.json();
  const text = extractChatText(data);
  const prompt = text ? cleanCraftedPrompt(text) : '';
  if (!prompt || prompt.length < 20) {
    throw new Error('Prompt craft returned an empty or too-short prompt.');
  }
  return { prompt, promptModel: craft.model };
}

const extractImageFromChatResponse = (data: unknown): string | null => {
  if (!data || typeof data !== 'object') return null;
  const root = data as Record<string, unknown>;
  const choices = root['choices'];
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: Record<string, unknown> })?.message;
  if (!message) return null;

  const images = message['images'];
  if (Array.isArray(images) && images[0]) {
    const first = images[0] as Record<string, unknown>;
    const url =
      (first['image_url'] as { url?: string } | undefined)?.url ||
      (first['imageUrl'] as { url?: string } | undefined)?.url ||
      (typeof first['url'] === 'string' ? first['url'] : null);
    if (url) return url;
    if (typeof first['b64_json'] === 'string') {
      return `data:image/png;base64,${first['b64_json']}`;
    }
  }

  const content = message['content'];
  if (typeof content === 'string') {
    const dataUrl = content.match(/data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+/);
    if (dataUrl) return dataUrl[0]!;
    const md = content.match(/!\[[^\]]*]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/);
    if (md?.[1]) return md[1];
  }
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const p = part as Record<string, unknown>;
      if (p['type'] === 'image_url') {
        const url = (p['image_url'] as { url?: string } | undefined)?.url;
        if (url) return url;
      }
      if (p['type'] === 'image' && typeof p['image'] === 'string') return p['image'] as string;
      if (typeof p['b64_json'] === 'string') {
        return `data:image/png;base64,${p['b64_json']}`;
      }
    }
  }
  return null;
};

const extractImageFromGenerationsResponse = (data: unknown): string | null => {
  if (!data || typeof data !== 'object') return null;
  const list = (data as { data?: unknown[] })['data'];
  if (!Array.isArray(list) || !list[0]) return null;
  const first = list[0] as Record<string, unknown>;
  if (typeof first['url'] === 'string') return first['url'];
  if (typeof first['b64_json'] === 'string') {
    return `data:image/png;base64,${first['b64_json']}`;
  }
  return null;
};

const isOpenRouterBase = (baseUrl: string) => /openrouter\.ai/i.test(baseUrl);

/**
 * Step 2 — send the crafted prompt to the image model (OpenRouter / image host only).
 *
 * OpenRouter paths (in order):
 *  1. POST /images          — dedicated Image API (current)
 *  2. POST /images/generations — OpenAI-compatible alias
 *  3. POST /chat/completions with modalities: image+text — Gemini-style
 */
export async function generateImageFromPrompt(
  prompt: string,
  image: HostCreds,
  httpFetch: typeof fetch = fetch,
): Promise<string> {
  const model = normalizeImageModelId(image.model);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${image.apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://readest.com',
    'X-Title': 'Readest',
  };

  const errors: string[] = [];

  // 1) OpenRouter dedicated Image API: POST /api/v1/images
  if (isOpenRouterBase(image.baseUrl)) {
    try {
      const res = await httpFetch(`${image.baseUrl}/images`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          prompt,
          n: 1,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const src = extractImageFromGenerationsResponse(data);
        if (src) {
          // Prefer data URL with media_type when present
          if (src.startsWith('data:') || src.startsWith('http')) return src;
          return src;
        }
        // Some responses only have b64 without wrapping — re-check with media_type
        const list = (data as { data?: { b64_json?: string; media_type?: string; url?: string }[] })
          ?.data;
        const first = list?.[0];
        if (first?.b64_json) {
          const mime = first.media_type || 'image/png';
          return `data:${mime};base64,${first.b64_json}`;
        }
        if (first?.url) return first.url;
        errors.push('/images returned no image data');
      } else {
        const body = (await res.text().catch(() => '')).slice(0, 220);
        errors.push(`/images ${res.status}: ${body}`);
        // Hard 404 on model → don't keep thrashing same dead id
        if (res.status === 404 && /model|not found/i.test(body)) {
          throw new Error(
            `Image model not found (404): ${model}. In Settings → AI → Image model pick “Gemini 2.5 Flash Image” (google/gemini-2.5-flash-image). Old “-image-preview” ids were removed on OpenRouter.`,
          );
        }
      }
    } catch (e) {
      if (e instanceof Error && /Image model not found/i.test(e.message)) throw e;
      errors.push(e instanceof Error ? e.message : String(e));
      aiLogger.provider.error('image-gen', errors[errors.length - 1]!);
    }
  }

  // 2) OpenAI-compatible /images/generations
  try {
    const res = await httpFetch(`${image.baseUrl}/images/generations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json',
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const src = extractImageFromGenerationsResponse(data);
      if (src) return src;
      errors.push('images/generations returned no image data');
    } else {
      const body = (await res.text().catch(() => '')).slice(0, 200);
      errors.push(`images/generations ${res.status}: ${body}`);
      if (res.status === 404 && /model|not found/i.test(body)) {
        throw new Error(
          `Image model not found (404): ${model}. Use google/gemini-2.5-flash-image in Settings → AI.`,
        );
      }
    }
  } catch (e) {
    if (e instanceof Error && /Image model not found/i.test(e.message)) throw e;
    errors.push(e instanceof Error ? e.message : String(e));
    aiLogger.provider.error('image-gen', errors[errors.length - 1]!);
  }

  // 3) Multimodal chat (Gemini image models on OpenRouter)
  try {
    const chatRes = await httpFetch(`${image.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        modalities: ['image', 'text'],
      }),
    });

    if (!chatRes.ok) {
      const errText = await chatRes.text().catch(() => chatRes.statusText);
      const status = chatRes.status;
      if (status === 404) {
        throw new Error(
          `Image model not found (404): ${model} @ ${image.baseUrl}. ` +
            `Update Settings → AI → Image model to google/gemini-2.5-flash-image (the old -preview id 404s). ` +
            `${errText.slice(0, 180)}`,
        );
      }
      throw new Error(
        `Image generation failed (${status}) model=${model} @ ${image.baseUrl}: ${errText.slice(0, 280)}` +
          (errors.length ? ` [also: ${errors.join(' | ')}]` : ''),
      );
    }

    const chatData = await chatRes.json();
    const src = extractImageFromChatResponse(chatData);
    if (!src) {
      throw new Error(
        `No image in response (model=${model}). Default is google/gemini-2.5-flash-image; ` +
          `ensure your OpenRouter key can use that model. Cerebras keys cannot generate images.`,
      );
    }
    return src;
  } catch (e) {
    if (
      e instanceof Error &&
      /Image generation failed|No image in response|Image model not found/i.test(e.message)
    ) {
      throw e;
    }
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      /failed to fetch|networkerror|load failed/i.test(msg)
        ? `Could not reach image API ${image.baseUrl} (model ${model}). ` +
            `With Cerebras chat, put OpenRouter sk-or-… under Book indexing (embeddings). (${msg})`
        : msg,
    );
  }
}

/**
 * Two-step illustration for a cited book passage:
 *  1) Chat/LLM crafts a detailed image prompt from the selected line
 *  2) Image model renders that prompt
 *
 * In the browser we proxy via /api/ai/image to avoid CORS "Failed to fetch"
 * against OpenRouter / image hosts.
 */
export async function generateImageFromCitation(
  input: GenerateImageInput,
): Promise<GeneratedImage> {
  if (!input.settings.enabled) {
    throw new Error('AI is disabled. Enable it in Settings → AI.');
  }

  // Browser: server-side proxy (no CORS)
  if (typeof window !== 'undefined') {
    input.onStage?.('crafting');
    const res = await fetch('/api/ai/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectionText: input.selectionText,
        bookTitle: input.bookTitle,
        author: input.author,
        styleHint: input.styleHint,
        settings: {
          enabled: input.settings.enabled,
          provider: input.settings.provider,
          openrouterApiKey: input.settings.openrouterApiKey,
          openrouterBaseUrl: input.settings.openrouterBaseUrl,
          openrouterModel: input.settings.openrouterModel,
          embeddingApiKey: input.settings.embeddingApiKey,
          embeddingBaseUrl: input.settings.embeddingBaseUrl,
          aiGatewayApiKey: input.settings.aiGatewayApiKey,
          aiGatewayModel: input.settings.aiGatewayModel,
          imageGenerationModel: input.settings.imageGenerationModel,
        },
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Image generation failed (${res.status})`);
    }
    input.onStage?.('generating');
    return (await res.json()) as GeneratedImage;
  }

  return generateImageFromCitationDirect(input);
}

/** Direct path (server / Tauri without CORS issues). */
export async function generateImageFromCitationDirect(
  input: GenerateImageInput,
): Promise<GeneratedImage> {
  let pipeline: ImagePipelineCreds;
  try {
    pipeline = resolveImagePipeline(input.settings);
  } catch (e) {
    throw e instanceof Error
      ? e
      : new Error(
          'No image API key configured. For Cerebras chat, add an OpenRouter sk-or-… key under Book indexing (embeddings) for Illustrate.',
        );
  }

  const httpFetch = getAIFetch();
  const citation = input.selectionText.trim();

  // Step 1: craft prompt on chat host (Cerebras / OpenRouter chat)
  input.onStage?.('crafting');
  aiLogger.provider.init('image-prompt-craft', pipeline.craft.model);

  let prompt: string;
  let promptModel: string | undefined;
  try {
    const crafted = await craftImagePromptFromCitation(input, pipeline.craft, httpFetch);
    prompt = crafted.prompt;
    promptModel = crafted.promptModel;
  } catch (e) {
    aiLogger.provider.error(
      'image-prompt-craft',
      e instanceof Error ? e.message : String(e),
    );
    prompt = fallbackCraftedPrompt(input);
    promptModel = undefined;
  }

  // Step 2: render on image host only (OpenRouter when dual-key)
  input.onStage?.('generating');
  aiLogger.provider.init('image-gen', pipeline.image.model);
  const src = await generateImageFromPrompt(prompt, pipeline.image, httpFetch);

  return {
    src,
    prompt,
    citation,
    model: pipeline.image.model,
    promptModel,
  };
}
