import { describe, expect, it } from 'vitest';
import {
  resolveImageModelId,
  resolveImagePipeline,
} from '@/services/ai/imageGeneration';
import { DEFAULT_AI_SETTINGS, OPENROUTER_DEFAULTS } from '@/services/ai/constants';
import type { AISettings } from '@/services/ai/types';

const base = (): AISettings => ({
  ...DEFAULT_AI_SETTINGS,
  enabled: true,
  provider: 'openrouter',
});

describe('resolveImageModelId', () => {
  it('defaults to OpenRouter image model when unset', () => {
    const s = base();
    s.imageGenerationModel = undefined;
    expect(resolveImageModelId(s)).toBe(OPENROUTER_DEFAULTS.imageModel);
  });

  it('rejects chat-only models (Cerebras) and falls back', () => {
    const s = base();
    s.imageGenerationModel = 'gpt-oss-120b';
    expect(resolveImageModelId(s)).toBe(OPENROUTER_DEFAULTS.imageModel);
  });

  it('rewrites retired -image-preview id to avoid OpenRouter 404', () => {
    const s = base();
    s.imageGenerationModel = 'google/gemini-2.5-flash-image-preview';
    expect(resolveImageModelId(s)).toBe('google/gemini-2.5-flash-image');
  });

  it('keeps a real image model', () => {
    const s = base();
    s.imageGenerationModel = 'black-forest-labs/flux.2-pro';
    expect(resolveImageModelId(s)).toBe('black-forest-labs/flux.2-pro');
  });
});

describe('resolveImagePipeline dual-key Cerebras + OpenRouter', () => {
  it('crafts on Cerebras and renders on OpenRouter with auto image model', () => {
    const s = base();
    s.openrouterBaseUrl = 'https://api.cerebras.ai/v1';
    s.openrouterApiKey = 'csk-cerebras-test-key';
    s.openrouterModel = 'gpt-oss-120b';
    s.embeddingApiKey = 'sk-or-v1-openrouter-test-key';
    s.embeddingBaseUrl = OPENROUTER_DEFAULTS.baseUrl;
    // Simulate user never filling Image model field
    s.imageGenerationModel = '';

    const p = resolveImagePipeline(s);

    expect(p.craft.baseUrl).toContain('cerebras');
    expect(p.craft.apiKey).toBe('csk-cerebras-test-key');
    expect(p.craft.model).toBe('gpt-oss-120b');

    expect(p.image.baseUrl).toBe(OPENROUTER_DEFAULTS.baseUrl);
    expect(p.image.apiKey).toBe('sk-or-v1-openrouter-test-key');
    expect(p.image.model).toBe(OPENROUTER_DEFAULTS.imageModel);
    // Must never send chat model to image host
    expect(p.image.model).not.toBe('gpt-oss-120b');
  });

  it('throws a helpful error when only Cerebras key is present', () => {
    const s = base();
    s.openrouterBaseUrl = 'https://api.cerebras.ai/v1';
    s.openrouterApiKey = 'csk-cerebras-only';
    s.openrouterModel = 'gpt-oss-120b';
    s.embeddingApiKey = '';

    expect(() => resolveImagePipeline(s)).toThrow(/OpenRouter sk-or/i);
  });

  it('uses OpenRouter for both when only OpenRouter key is set', () => {
    const s = base();
    s.openrouterBaseUrl = OPENROUTER_DEFAULTS.baseUrl;
    s.openrouterApiKey = 'sk-or-v1-only';
    s.openrouterModel = OPENROUTER_DEFAULTS.chatModel;

    const p = resolveImagePipeline(s);
    expect(p.craft.baseUrl).toContain('openrouter');
    expect(p.image.baseUrl).toBe(OPENROUTER_DEFAULTS.baseUrl);
    expect(p.image.model).toBe(OPENROUTER_DEFAULTS.imageModel);
  });
});
