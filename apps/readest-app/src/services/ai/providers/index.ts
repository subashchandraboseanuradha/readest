import { OllamaProvider } from './OllamaProvider';
import { AIGatewayProvider } from './AIGatewayProvider';
import { OpenRouterProvider } from './OpenRouterProvider';
import type { AIProvider, AISettings } from '../types';
import { OPENROUTER_DEFAULTS } from '../constants';
import { aiLogger } from '../logger';

export { OllamaProvider, AIGatewayProvider, OpenRouterProvider };

// Static known-provider catalog (no remote registration API).
export {
  KNOWN_PROVIDERS,
  CEREBRAS_CHAT_PRESETS,
  getKnownProviders,
  getKnownProvider,
  getOpenAICompatibleProviders,
  getRuntimeProviderChoices,
  detectKnownProviderFromApiKey,
  detectKnownProviderFromBaseUrl,
  applyKnownProviderToSettings,
  resolveKnownProviderFromSettings,
} from '../knownProviders';
export type {
  KnownProvider,
  KnownProviderId,
  KnownProviderKind,
  KnownModelPreset,
} from '../knownProviders';

/** OpenRouter keys always start with this prefix; Vercel AI Gateway keys do not. */
const looksLikeOpenRouterKey = (key: string) => key.trim().startsWith('sk-or-');

/**
 * If the user selected "AI Gateway" but pasted an OpenRouter key (common),
 * route through OpenRouter instead of Vercel AI Gateway so indexing/chat work.
 */
function coerceOpenRouterFromGatewayKey(settings: AISettings): AISettings {
  const gwKey = settings.aiGatewayApiKey?.trim() || '';
  return {
    ...settings,
    provider: 'openrouter',
    openrouterApiKey: gwKey || settings.openrouterApiKey,
    openrouterBaseUrl: settings.openrouterBaseUrl || OPENROUTER_DEFAULTS.baseUrl,
    openrouterModel:
      settings.openrouterModel || settings.aiGatewayModel || OPENROUTER_DEFAULTS.chatModel,
    openrouterEmbeddingModel:
      settings.openrouterEmbeddingModel ||
      settings.aiGatewayEmbeddingModel ||
      OPENROUTER_DEFAULTS.embeddingModel,
  };
}

export function getAIProvider(settings: AISettings): AIProvider {
  switch (settings.provider) {
    case 'ollama':
      return new OllamaProvider(settings);
    case 'ai-gateway': {
      const gwKey = settings.aiGatewayApiKey?.trim() || '';
      if (!gwKey) {
        throw new Error(
          'API key required for AI Gateway. Paste a Vercel AI Gateway key in Settings → AI, or switch provider to OpenRouter.',
        );
      }
      // OpenRouter keys are rejected by Vercel AI Gateway with "Invalid API key".
      if (looksLikeOpenRouterKey(gwKey)) {
        aiLogger.provider.init(
          'ai-gateway',
          'Detected OpenRouter key (sk-or-…) under AI Gateway — routing via OpenRouter',
        );
        return new OpenRouterProvider(coerceOpenRouterFromGatewayKey(settings));
      }
      return new AIGatewayProvider(settings);
    }
    case 'openrouter':
      if (!settings.openrouterApiKey) {
        // Recover if the key was only saved in the Gateway field
        const gwKey = settings.aiGatewayApiKey?.trim() || '';
        if (looksLikeOpenRouterKey(gwKey)) {
          return new OpenRouterProvider(coerceOpenRouterFromGatewayKey(settings));
        }
        throw new Error(
          'API key required. Paste your provider key in Settings → AI (OpenRouter sk-or-…, Cerebras, OpenAI, etc.).',
        );
      }
      return new OpenRouterProvider(settings);
    default:
      throw new Error(`Unknown provider: ${settings.provider}`);
  }
}
