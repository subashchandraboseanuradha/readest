import { describe, test, expect } from 'vitest';

import {
  KNOWN_PROVIDERS,
  getKnownProviders,
  getKnownProvider,
  getOpenAICompatibleProviders,
  getRuntimeProviderChoices,
  detectKnownProviderFromApiKey,
  detectKnownProviderFromBaseUrl,
  applyKnownProviderToSettings,
  resolveKnownProviderFromSettings,
  listRuntimeProvidersCovered,
  normalizeBaseUrl,
  type KnownProviderId,
} from '@/services/ai/knownProviders';
import { DEFAULT_AI_SETTINGS, OPENROUTER_DEFAULTS } from '@/services/ai/constants';
import type { AIProviderName, AISettings } from '@/services/ai/types';

const REQUIRED_RUNTIME: AIProviderName[] = ['ollama', 'ai-gateway', 'openrouter'];

describe('KNOWN_PROVIDERS catalog', () => {
  test('exports a non-empty static list (no remote add-provider API)', () => {
    expect(KNOWN_PROVIDERS.length).toBeGreaterThanOrEqual(10);
    expect(getKnownProviders()).toBe(KNOWN_PROVIDERS);
  });

  test('every entry has unique id, name, kind, runtimeProvider', () => {
    const ids = new Set<string>();
    for (const p of KNOWN_PROVIDERS) {
      expect(p.id).toBeTruthy();
      expect(p.name.trim().length).toBeGreaterThan(0);
      expect(p.kind).toBeTruthy();
      expect(p.runtimeProvider).toBeTruthy();
      expect(typeof p.supportsModelsList).toBe('boolean');
      expect(typeof p.requiresApiKey).toBe('boolean');
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
    }
  });

  test('covers all runtime AIProviderName values', () => {
    const covered = listRuntimeProvidersCovered();
    for (const runtime of REQUIRED_RUNTIME) {
      expect(covered).toContain(runtime);
    }
  });

  test('exactly one recommended provider (OpenRouter)', () => {
    const recommended = KNOWN_PROVIDERS.filter((p) => p.recommended);
    expect(recommended).toHaveLength(1);
    expect(recommended[0]!.id).toBe('openrouter');
  });

  test('OpenRouter defaults match OPENROUTER_DEFAULTS constants', () => {
    const or = getKnownProvider('openrouter');
    expect(or).toBeDefined();
    expect(or!.baseUrl).toBe(OPENROUTER_DEFAULTS.baseUrl);
    expect(or!.defaultChatModel).toBe(OPENROUTER_DEFAULTS.chatModel);
    expect(or!.defaultEmbeddingModel).toBe(OPENROUTER_DEFAULTS.embeddingModel);
    expect(or!.defaultImageModel).toBe(OPENROUTER_DEFAULTS.imageModel);
    expect(or!.apiKeyPrefixes).toContain('sk-or-');
    expect(or!.keysUrl).toMatch(/openrouter\.ai/);
  });

  test('openai-compatible entries have absolute https base URLs (except custom / placeholders)', () => {
    for (const p of getOpenAICompatibleProviders()) {
      if (p.id === 'custom') {
        expect(p.baseUrl === undefined || p.baseUrl === '').toBe(true);
        continue;
      }
      expect(p.baseUrl).toBeTruthy();
      // cloudflare uses {account_id} placeholder
      if (p.id === 'cloudflare') {
        expect(p.baseUrl).toContain('{account_id}');
        expect(p.baseUrl!.startsWith('https://')).toBe(true);
        continue;
      }
      expect(p.baseUrl!.startsWith('https://')).toBe(true);
      expect(p.baseUrl!.endsWith('/')).toBe(false);
    }
  });

  test('ollama is local and does not require an API key', () => {
    const ollama = getKnownProvider('ollama')!;
    expect(ollama.runtimeProvider).toBe('ollama');
    expect(ollama.requiresApiKey).toBe(false);
    expect(ollama.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1/);
  });

  test('ai-gateway uses Vercel host and is not openai-compatible kind', () => {
    const gw = getKnownProvider('ai-gateway')!;
    expect(gw.kind).toBe('ai-gateway');
    expect(gw.runtimeProvider).toBe('ai-gateway');
    expect(gw.baseUrl).toContain('ai-gateway.vercel.sh');
  });

  test('getKnownProvider returns undefined for unknown ids', () => {
    expect(getKnownProvider('not-a-real-provider' as KnownProviderId)).toBeUndefined();
  });

  test('runtime provider choices are openrouter, ai-gateway, ollama in that order', () => {
    const choices = getRuntimeProviderChoices();
    expect(choices.map((c) => c.id)).toEqual(['openrouter', 'ai-gateway', 'ollama']);
  });

  test('keysUrl / websiteUrl are https when present', () => {
    for (const p of KNOWN_PROVIDERS) {
      if (p.keysUrl) expect(p.keysUrl.startsWith('https://')).toBe(true);
      if (p.websiteUrl) expect(p.websiteUrl.startsWith('https://')).toBe(true);
    }
  });
});

describe('detectKnownProviderFromApiKey', () => {
  test('detects OpenRouter sk-or- keys', () => {
    expect(detectKnownProviderFromApiKey('sk-or-v1-abc')?.id).toBe('openrouter');
  });

  test('prefers sk-or- over generic sk- (OpenAI)', () => {
    // Would also match OpenAI's sk- prefix if we only used startsWith without length
    expect(detectKnownProviderFromApiKey('sk-or-v1-xyz')?.id).toBe('openrouter');
  });

  test('detects OpenAI sk- keys that are not OpenRouter', () => {
    expect(detectKnownProviderFromApiKey('sk-proj-abc')?.id).toBe('openai');
  });

  test('detects Groq gsk_ keys', () => {
    expect(detectKnownProviderFromApiKey('gsk_live_123')?.id).toBe('groq');
  });

  test('detects Vercel gateway vck_ keys', () => {
    expect(detectKnownProviderFromApiKey('vck_test')?.id).toBe('ai-gateway');
  });

  test('returns undefined for empty / unknown keys', () => {
    expect(detectKnownProviderFromApiKey('')).toBeUndefined();
    expect(detectKnownProviderFromApiKey('   ')).toBeUndefined();
    expect(detectKnownProviderFromApiKey('random-token')).toBeUndefined();
  });
});

describe('detectKnownProviderFromBaseUrl', () => {
  test('matches OpenRouter default URL with trailing slash', () => {
    expect(
      detectKnownProviderFromBaseUrl('https://openrouter.ai/api/v1/')?.id,
    ).toBe('openrouter');
  });

  test('matches OpenAI API host', () => {
    expect(detectKnownProviderFromBaseUrl('https://api.openai.com/v1')?.id).toBe('openai');
  });

  test('matches Groq OpenAI-compatible path', () => {
    expect(
      detectKnownProviderFromBaseUrl('https://api.groq.com/openai/v1')?.id,
    ).toBe('groq');
  });

  test('matches by host when path differs slightly', () => {
    // exact base mismatch but same host → host fallback
    const p = detectKnownProviderFromBaseUrl('https://api.deepseek.com/v1/extra');
    // host is api.deepseek.com — catalog base is https://api.deepseek.com/v1
    // URL constructor with path /v1/extra still has same host
    expect(p?.id).toBe('deepseek');
  });

  test('returns undefined for empty / unknown hosts', () => {
    expect(detectKnownProviderFromBaseUrl('')).toBeUndefined();
    expect(detectKnownProviderFromBaseUrl('https://my-vllm.local/v1')?.id).toBeUndefined();
  });

  test('normalizeBaseUrl strips trailing slashes', () => {
    expect(normalizeBaseUrl('https://x.com/v1///')).toBe('https://x.com/v1');
  });
});

describe('applyKnownProviderToSettings', () => {
  test('applies OpenRouter defaults with forceModels', () => {
    const current: AISettings = {
      ...DEFAULT_AI_SETTINGS,
      openrouterModel: 'old/model',
      openrouterEmbeddingModel: 'old/embed',
      imageGenerationModel: 'old/image',
      openrouterBaseUrl: 'https://example.com/v1',
    };
    const patch = applyKnownProviderToSettings('openrouter', current, { forceModels: true });
    expect(patch.provider).toBe('openrouter');
    expect(patch.openrouterBaseUrl).toBe(OPENROUTER_DEFAULTS.baseUrl);
    expect(patch.openrouterModel).toBe(OPENROUTER_DEFAULTS.chatModel);
    expect(patch.openrouterEmbeddingModel).toBe(OPENROUTER_DEFAULTS.embeddingModel);
    expect(patch.imageGenerationModel).toBe(OPENROUTER_DEFAULTS.imageModel);
  });

  test('does not overwrite existing models when forceModels is false', () => {
    const current: AISettings = {
      ...DEFAULT_AI_SETTINGS,
      openrouterModel: 'keep/me',
      openrouterEmbeddingModel: 'keep/embed',
      imageGenerationModel: 'keep/image',
    };
    const patch = applyKnownProviderToSettings('openrouter', current, { forceModels: false });
    expect(patch.openrouterBaseUrl).toBe(OPENROUTER_DEFAULTS.baseUrl);
    expect(patch.openrouterModel).toBeUndefined();
    expect(patch.openrouterEmbeddingModel).toBeUndefined();
    expect(patch.imageGenerationModel).toBeUndefined();
  });

  test('applies ollama local defaults', () => {
    const patch = applyKnownProviderToSettings('ollama', DEFAULT_AI_SETTINGS, {
      forceModels: true,
    });
    expect(patch.provider).toBe('ollama');
    expect(patch.ollamaBaseUrl).toBe('http://127.0.0.1:11434');
    expect(patch.ollamaModel).toBe('llama3.2');
    expect(patch.ollamaEmbeddingModel).toBe('nomic-embed-text');
  });

  test('applies ai-gateway defaults', () => {
    const patch = applyKnownProviderToSettings('ai-gateway', DEFAULT_AI_SETTINGS, {
      forceModels: true,
    });
    expect(patch.provider).toBe('ai-gateway');
    expect(patch.aiGatewayModel).toBeTruthy();
    expect(patch.aiGatewayEmbeddingModel).toBeTruthy();
  });

  test('applies OpenAI official endpoint models', () => {
    const patch = applyKnownProviderToSettings('openai', DEFAULT_AI_SETTINGS, {
      forceModels: true,
    });
    expect(patch.provider).toBe('openrouter'); // runtime = openai-compatible class
    expect(patch.openrouterBaseUrl).toBe('https://api.openai.com/v1');
    expect(patch.openrouterModel).toBe('gpt-4o-mini');
    expect(patch.openrouterEmbeddingModel).toBe('text-embedding-3-small');
  });

  test('custom provider does not wipe base URL', () => {
    const current: AISettings = {
      ...DEFAULT_AI_SETTINGS,
      openrouterBaseUrl: 'http://127.0.0.1:1234/v1',
    };
    const patch = applyKnownProviderToSettings('custom', current, { forceModels: true });
    expect(patch.provider).toBe('openrouter');
    expect(patch.openrouterBaseUrl).toBeUndefined();
  });

  test('throws on unknown catalog id', () => {
    expect(() =>
      applyKnownProviderToSettings('nope' as KnownProviderId, DEFAULT_AI_SETTINGS),
    ).toThrow(/Unknown known provider/);
  });
});

describe('resolveKnownProviderFromSettings', () => {
  test('resolves ollama / ai-gateway by runtime provider', () => {
    expect(
      resolveKnownProviderFromSettings({ ...DEFAULT_AI_SETTINGS, provider: 'ollama' }),
    ).toBe('ollama');
    expect(
      resolveKnownProviderFromSettings({
        ...DEFAULT_AI_SETTINGS,
        provider: 'ai-gateway',
        aiGatewayApiKey: 'vck_x',
      }),
    ).toBe('ai-gateway');
  });

  test('resolves OpenRouter from key prefix', () => {
    expect(
      resolveKnownProviderFromSettings({
        ...DEFAULT_AI_SETTINGS,
        provider: 'openrouter',
        openrouterApiKey: 'sk-or-v1-test',
      }),
    ).toBe('openrouter');
  });

  test('resolves OpenAI from base URL', () => {
    expect(
      resolveKnownProviderFromSettings({
        ...DEFAULT_AI_SETTINGS,
        provider: 'openrouter',
        openrouterBaseUrl: 'https://api.openai.com/v1',
        openrouterApiKey: '',
      }),
    ).toBe('openai');
  });

  test('falls back to custom for unknown base URL', () => {
    expect(
      resolveKnownProviderFromSettings({
        ...DEFAULT_AI_SETTINGS,
        provider: 'openrouter',
        openrouterBaseUrl: 'http://localhost:8080/v1',
        openrouterApiKey: '',
      }),
    ).toBe('custom');
  });

  test('default settings resolve to openrouter', () => {
    expect(resolveKnownProviderFromSettings(DEFAULT_AI_SETTINGS)).toBe('openrouter');
  });
});

describe('catalog completeness checklist', () => {
  /** Explicit list — fail the test if someone deletes a known entry without updating tests. */
  const EXPECTED_IDS: KnownProviderId[] = [
    'openrouter',
    'openai',
    'groq',
    'together',
    'deepseek',
    'fireworks',
    'mistral',
    'cerebras',
    'sambanova',
    'perplexity',
    'xai',
    'nvidia',
    'github-models',
    'cloudflare',
    'ai-gateway',
    'ollama',
    'custom',
  ];

  test('includes every expected known provider id', () => {
    const ids = new Set(KNOWN_PROVIDERS.map((p) => p.id));
    for (const id of EXPECTED_IDS) {
      expect(ids.has(id)).toBe(true);
    }
  });

  test('every openai-compatible provider can produce a settings patch', () => {
    for (const p of getOpenAICompatibleProviders()) {
      const patch = applyKnownProviderToSettings(p.id, DEFAULT_AI_SETTINGS, {
        forceModels: true,
      });
      expect(patch.provider).toBe('openrouter');
      if (p.baseUrl) {
        expect(patch.openrouterBaseUrl).toBe(p.baseUrl);
      }
    }
  });
});

describe('Cerebras Inference (inference-docs.cerebras.ai)', () => {
  test('matches official OpenAI-compatible base URL and docs', () => {
    const cerebras = getKnownProvider('cerebras');
    expect(cerebras).toBeDefined();
    expect(cerebras!.baseUrl).toBe('https://api.cerebras.ai/v1');
    expect(cerebras!.docsUrl).toBe('https://inference-docs.cerebras.ai/');
    expect(cerebras!.keysUrl).toMatch(/cloud\.cerebras\.ai/);
    expect(cerebras!.defaultChatModel).toBe('gpt-oss-120b');
    expect(cerebras!.supportsModelsList).toBe(true);
    expect(cerebras!.runtimeProvider).toBe('openrouter');
  });

  test('ships public production + preview model presets from the catalog', () => {
    const cerebras = getKnownProvider('cerebras')!;
    const ids = (cerebras.chatModelPresets ?? []).map((m) => m.id);
    expect(ids).toContain('gpt-oss-120b');
    expect(ids).toContain('gemma-4-31b');
    expect(ids).toContain('zai-glm-4.7');
  });

  test('applyKnownProvider fills Cerebras base URL and gpt-oss-120b', () => {
    const patch = applyKnownProviderToSettings('cerebras', DEFAULT_AI_SETTINGS, {
      forceModels: true,
    });
    expect(patch.openrouterBaseUrl).toBe('https://api.cerebras.ai/v1');
    expect(patch.openrouterModel).toBe('gpt-oss-120b');
  });

  test('detects Cerebras from base URL', () => {
    expect(detectKnownProviderFromBaseUrl('https://api.cerebras.ai/v1')?.id).toBe('cerebras');
    expect(detectKnownProviderFromBaseUrl('https://api.cerebras.ai/v1/')?.id).toBe('cerebras');
  });
});
