import clsx from 'clsx';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PiCheckCircle, PiWarningCircle, PiArrowsClockwise, PiSpinner } from 'react-icons/pi';

import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { useEnv } from '@/context/EnvContext';
import { getAIProvider } from '@/services/ai/providers';
import {
  fetchOpenRouterModels,
  type OpenRouterModelInfo,
} from '@/services/ai/providers/OpenRouterProvider';
import {
  DEFAULT_AI_SETTINGS,
  GATEWAY_MODELS,
  MODEL_PRICING,
  OPENROUTER_DEFAULTS,
  OPENROUTER_CHAT_PRESETS,
  OPENROUTER_EMBED_PRESETS,
  OPENROUTER_IMAGE_PRESETS,
  EMBEDDING_VIA_OPENROUTER,
} from '@/services/ai/constants';
import {
  applyKnownProviderToSettings,
  getKnownProvider,
  getOpenAICompatibleProviders,
  resolveKnownProviderFromSettings,
  type KnownProviderId,
} from '@/services/ai/knownProviders';
import { isChatOnlyEmbedHost } from '@/services/ai/embeddingCredentials';
import type { AISettings, AIProviderName } from '@/services/ai/types';
import { exportReedyMetricsBundle } from '@/services/reedy/instrumentation';
import { isTauriAppPlatform } from '@/services/environment';
import { BoxedList, SettingLabel, SettingsRow, SettingsSwitchRow } from './primitives';

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';
type CustomModelStatus = 'idle' | 'validating' | 'valid' | 'invalid';

const CUSTOM_MODEL_VALUE = '__custom__';

interface ModelOption {
  id: string;
  label: string;
  inputCost: string;
  outputCost: string;
}

const getModelOptions = (): ModelOption[] => [
  {
    id: GATEWAY_MODELS.GEMINI_FLASH_LITE,
    label: 'Gemini 2.5 Flash Lite',
    inputCost: MODEL_PRICING[GATEWAY_MODELS.GEMINI_FLASH_LITE]?.input ?? '?',
    outputCost: MODEL_PRICING[GATEWAY_MODELS.GEMINI_FLASH_LITE]?.output ?? '?',
  },
  {
    id: GATEWAY_MODELS.GPT_5_NANO,
    label: 'GPT-5 Nano',
    inputCost: MODEL_PRICING[GATEWAY_MODELS.GPT_5_NANO]?.input ?? '?',
    outputCost: MODEL_PRICING[GATEWAY_MODELS.GPT_5_NANO]?.output ?? '?',
  },
  {
    id: GATEWAY_MODELS.LLAMA_4_SCOUT,
    label: 'Llama 4 Scout',
    inputCost: MODEL_PRICING[GATEWAY_MODELS.LLAMA_4_SCOUT]?.input ?? '?',
    outputCost: MODEL_PRICING[GATEWAY_MODELS.LLAMA_4_SCOUT]?.output ?? '?',
  },
  {
    id: GATEWAY_MODELS.GROK_4_1_FAST,
    label: 'Grok 4.1 Fast',
    inputCost: MODEL_PRICING[GATEWAY_MODELS.GROK_4_1_FAST]?.input ?? '?',
    outputCost: MODEL_PRICING[GATEWAY_MODELS.GROK_4_1_FAST]?.output ?? '?',
  },
  {
    id: GATEWAY_MODELS.DEEPSEEK_V3_2,
    label: 'DeepSeek V3.2',
    inputCost: MODEL_PRICING[GATEWAY_MODELS.DEEPSEEK_V3_2]?.input ?? '?',
    outputCost: MODEL_PRICING[GATEWAY_MODELS.DEEPSEEK_V3_2]?.output ?? '?',
  },
  {
    id: GATEWAY_MODELS.QWEN_3_235B,
    label: 'Qwen 3 235B',
    inputCost: MODEL_PRICING[GATEWAY_MODELS.QWEN_3_235B]?.input ?? '?',
    outputCost: MODEL_PRICING[GATEWAY_MODELS.QWEN_3_235B]?.output ?? '?',
  },
];

const AIPanel: React.FC = () => {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const { settings, setSettings, saveSettings } = useSettingsStore();

  const aiSettings: AISettings = settings?.aiSettings ?? DEFAULT_AI_SETTINGS;

  const [enabled, setEnabled] = useState(aiSettings.enabled);
  const [reedyEnabled, setReedyEnabled] = useState(aiSettings.reedy?.enabled ?? false);
  const [reedyAgentRuntime, setReedyAgentRuntime] = useState(
    (aiSettings.reedy?.runtime ?? 'mvp') === 'agent',
  );
  const [provider, setProvider] = useState<AIProviderName>(aiSettings.provider);
  const [ollamaUrl, setOllamaUrl] = useState(aiSettings.ollamaBaseUrl);
  const [ollamaModel, setOllamaModel] = useState(aiSettings.ollamaModel);
  const [ollamaEmbeddingModel, setOllamaEmbeddingModel] = useState(aiSettings.ollamaEmbeddingModel);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [gatewayKey, setGatewayKey] = useState(aiSettings.aiGatewayApiKey ?? '');

  // ---- OpenRouter (OpenAI-compatible) state ----
  const [openrouterKey, setOpenrouterKey] = useState(aiSettings.openrouterApiKey ?? '');
  const [openrouterUrl, setOpenrouterUrl] = useState(
    aiSettings.openrouterBaseUrl ?? DEFAULT_AI_SETTINGS.openrouterBaseUrl ?? '',
  );
  const [openrouterModel, setOpenrouterModel] = useState(aiSettings.openrouterModel ?? '');
  const [openrouterEmbeddingModel, setOpenrouterEmbeddingModel] = useState(
    aiSettings.openrouterEmbeddingModel ?? '',
  );
  const [embeddingApiKey, setEmbeddingApiKey] = useState(aiSettings.embeddingApiKey ?? '');
  const [embeddingBaseUrl, setEmbeddingBaseUrl] = useState(
    aiSettings.embeddingBaseUrl ?? EMBEDDING_VIA_OPENROUTER.baseUrl,
  );
  const [imageGenerationModel, setImageGenerationModel] = useState(
    aiSettings.imageGenerationModel ?? DEFAULT_AI_SETTINGS.imageGenerationModel ?? '',
  );
  const [openrouterModels, setOpenrouterModels] = useState<OpenRouterModelInfo[]>([]);
  const [openrouterFetchingModels, setOpenrouterFetchingModels] = useState(false);
  const [openrouterModelsError, setOpenrouterModelsError] = useState('');
  const [knownEndpointId, setKnownEndpointId] = useState<KnownProviderId>(() =>
    resolveKnownProviderFromSettings(aiSettings),
  );
  const openaiCompatibleProviders = getOpenAICompatibleProviders();
  const selectedKnownEndpoint = getKnownProvider(knownEndpointId);

  const savedCustomModel = aiSettings.aiGatewayCustomModel ?? '';
  const savedModel = aiSettings.aiGatewayModel ?? DEFAULT_AI_SETTINGS.aiGatewayModel ?? '';
  const isCustomModelSaved = savedCustomModel.length > 0;

  const [selectedModel, setSelectedModel] = useState(
    isCustomModelSaved ? CUSTOM_MODEL_VALUE : savedModel,
  );
  const [customModelInput, setCustomModelInput] = useState(savedCustomModel);
  const [customModelStatus, setCustomModelStatus] = useState<CustomModelStatus>(
    isCustomModelSaved ? 'valid' : 'idle',
  );
  const [customModelPricing, setCustomModelPricing] = useState<{
    input: string;
    output: string;
  } | null>(isCustomModelSaved ? { input: '?', output: '?' } : null);
  const [customModelError, setCustomModelError] = useState('');

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const isMounted = useRef(false);
  const modelOptions = getModelOptions();

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  /**
   * One text field powers all OpenAI-compatible hosts (Cerebras, OpenRouter, …).
   * We keep a session map so switching Known provider restores that host’s key
   * instead of silently reusing Cerebras’s key against openrouter.ai.
   */
  const keysByHostRef = useRef<Record<string, string>>({});
  const knownEndpointIdRef = useRef(knownEndpointId);
  knownEndpointIdRef.current = knownEndpointId;

  // Serialize AI saves so concurrent field updates cannot clobber each other
  // (e.g. base URL write wiping the API key — a common cause of chat 401s).
  const saveQueueRef = useRef(Promise.resolve());

  const saveAiSettingsPatch = useCallback(
    (patch: Partial<AISettings>) => {
      saveQueueRef.current = saveQueueRef.current
        .then(async () => {
          const currentSettings = settingsRef.current;
          if (!currentSettings) return;
          const currentAiSettings: AISettings = currentSettings.aiSettings ?? DEFAULT_AI_SETTINGS;
          const newAiSettings: AISettings = { ...currentAiSettings, ...patch };
          const newSettings = { ...currentSettings, aiSettings: newAiSettings };
          // Update ref immediately so the next queued save sees the merge.
          settingsRef.current = newSettings;
          setSettings(newSettings);
          await saveSettings(envConfig, newSettings);
        })
        .catch((err) => {
          console.error('[AI settings] save failed', err);
        });
      return saveQueueRef.current;
    },
    [envConfig, setSettings, saveSettings],
  );

  const saveAiSetting = useCallback(
    async (key: keyof AISettings, value: AISettings[keyof AISettings]) => {
      await saveAiSettingsPatch({ [key]: value } as Partial<AISettings>);
    },
    [saveAiSettingsPatch],
  );

  /** Live snapshot of what chat will use (local form state, not stale store). */
  const chatConfigSummary = (() => {
    if (provider === 'ollama') {
      return {
        host: ollamaUrl || 'ollama',
        model: ollamaModel || '—',
        keyOk: true,
        mismatch: null as string | null,
      };
    }
    if (provider === 'ai-gateway') {
      const gwModel =
        selectedModel === CUSTOM_MODEL_VALUE && customModelStatus === 'valid'
          ? customModelInput
          : selectedModel;
      return {
        host: 'ai-gateway.vercel.sh',
        model: gwModel || '—',
        keyOk: !!gatewayKey.trim(),
        mismatch: !gatewayKey.trim() ? _('No AI Gateway key entered.') : (null as string | null),
      };
    }
    const host = (() => {
      try {
        return new URL(openrouterUrl || OPENROUTER_DEFAULTS.baseUrl).host;
      } catch {
        return openrouterUrl || '—';
      }
    })();
    const key = openrouterKey.trim();
    let mismatch: string | null = null;
    if (key && host.includes('openrouter') && !key.startsWith('sk-or-')) {
      mismatch = _(
        'Key does not look like OpenRouter (sk-or-…). If this is a Cerebras key, choose Known provider “Cerebras Inference” so the base URL is api.cerebras.ai — not openrouter.ai.',
      );
    }
    if (key.startsWith('sk-or-') && host.includes('cerebras')) {
      mismatch = _(
        'OpenRouter key (sk-or-…) with Cerebras base URL. Switch Known provider to OpenRouter, or use a Cerebras key.',
      );
    }
    if (!key) {
      mismatch = _('No API key entered for chat.');
    }
    return {
      host,
      model: openrouterModel || '—',
      keyOk: !!key,
      mismatch,
    };
  })();

  const fetchOllamaModels = useCallback(async () => {
    if (!ollamaUrl || !enabled) return;

    setFetchingModels(true);
    try {
      const response = await fetch(`${ollamaUrl}/api/tags`);
      if (!response.ok) throw new Error('Failed to fetch models');
      const data = await response.json();
      const models = data.models?.map((m: { name: string }) => m.name) || [];

      setOllamaModels(models);
      if (models.length > 0 && !models.includes(ollamaModel)) {
        setOllamaModel(models[0]!);
      }
    } catch (_err) {
      setOllamaModels([]);
    } finally {
      setFetchingModels(false);
    }
  }, [ollamaUrl, ollamaModel, enabled]);

  useEffect(() => {
    if (provider === 'ollama' && enabled) {
      fetchOllamaModels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, enabled, ollamaUrl]);

  // ---- OpenRouter: fetch /models list ----
  const fetchOpenrouterModelList = useCallback(async () => {
    if (!enabled || !openrouterUrl || !openrouterKey) {
      setOpenrouterModels([]);
      return;
    }
    setOpenrouterFetchingModels(true);
    setOpenrouterModelsError('');
    try {
      const models = await fetchOpenRouterModels(openrouterUrl, openrouterKey);
      // Sort by id for a stable picker. Keep raw entries — UI uses
      // `name || id` so OpenRouter's friendly labels still show up.
      models.sort((a, b) => a.id.localeCompare(b.id));
      setOpenrouterModels(models);
      // Do NOT overwrite the user's model. Auto-pick only when empty.
      // Overwriting broke Cerebras (gpt-oss-120b) when the list was from a
      // different host or incomplete, and left chat on openai/gpt-4o-mini
      // against the wrong base URL.
      if (!openrouterModel.trim() && models.length > 0) {
        setOpenrouterModel(models[0]!.id);
      }
    } catch (e) {
      setOpenrouterModels([]);
      setOpenrouterModelsError((e as Error).message || _('Failed to fetch models'));
    } finally {
      setOpenrouterFetchingModels(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, openrouterUrl, openrouterKey, openrouterModel]);

  useEffect(() => {
    if (provider === 'openrouter' && enabled && openrouterKey && openrouterUrl) {
      fetchOpenrouterModelList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, enabled, openrouterKey, openrouterUrl]);

  useEffect(() => {
    isMounted.current = true;
  }, []);

  useEffect(() => {
    if (!isMounted.current) return;
    if (enabled !== aiSettings.enabled) {
      saveAiSetting('enabled', enabled);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (provider !== aiSettings.provider) {
      saveAiSetting('provider', provider);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (ollamaUrl !== aiSettings.ollamaBaseUrl) {
      saveAiSetting('ollamaBaseUrl', ollamaUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ollamaUrl]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (ollamaModel !== aiSettings.ollamaModel) {
      saveAiSetting('ollamaModel', ollamaModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ollamaModel]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (ollamaEmbeddingModel !== aiSettings.ollamaEmbeddingModel) {
      saveAiSetting('ollamaEmbeddingModel', ollamaEmbeddingModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ollamaEmbeddingModel]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (gatewayKey !== (aiSettings.aiGatewayApiKey ?? '')) {
      saveAiSetting('aiGatewayApiKey', gatewayKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayKey]);

  // ---- OpenRouter save effects ----
  useEffect(() => {
    if (!isMounted.current) return;
    if (openrouterKey !== (aiSettings.openrouterApiKey ?? '')) {
      saveAiSetting('openrouterApiKey', openrouterKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openrouterKey]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (openrouterUrl !== (aiSettings.openrouterBaseUrl ?? '')) {
      saveAiSetting('openrouterBaseUrl', openrouterUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openrouterUrl]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (openrouterModel !== (aiSettings.openrouterModel ?? '')) {
      saveAiSetting('openrouterModel', openrouterModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openrouterModel]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (openrouterEmbeddingModel !== (aiSettings.openrouterEmbeddingModel ?? '')) {
      saveAiSetting('openrouterEmbeddingModel', openrouterEmbeddingModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openrouterEmbeddingModel]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (embeddingApiKey !== (aiSettings.embeddingApiKey ?? '')) {
      saveAiSetting('embeddingApiKey', embeddingApiKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embeddingApiKey]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (embeddingBaseUrl !== (aiSettings.embeddingBaseUrl ?? '')) {
      saveAiSetting('embeddingBaseUrl', embeddingBaseUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embeddingBaseUrl]);

  useEffect(() => {
    if (!isMounted.current) return;
    if (imageGenerationModel !== (aiSettings.imageGenerationModel ?? '')) {
      saveAiSetting('imageGenerationModel', imageGenerationModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageGenerationModel]);

  // Get the effective model ID to use (either selected or custom)
  const getEffectiveModelId = useCallback(() => {
    if (selectedModel === CUSTOM_MODEL_VALUE && customModelStatus === 'valid') {
      return customModelInput;
    }
    return selectedModel;
  }, [selectedModel, customModelStatus, customModelInput]);

  // Save model selection when it changes
  useEffect(() => {
    if (!isMounted.current) return;
    const effectiveModel = getEffectiveModelId();
    if (effectiveModel !== aiSettings.aiGatewayModel) {
      saveAiSetting('aiGatewayModel', effectiveModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel, customModelStatus, customModelInput]);

  // Save custom model separately
  useEffect(() => {
    if (!isMounted.current) return;
    const customToSave =
      selectedModel === CUSTOM_MODEL_VALUE && customModelStatus === 'valid' ? customModelInput : '';
    if (customToSave !== (aiSettings.aiGatewayCustomModel ?? '')) {
      saveAiSetting('aiGatewayCustomModel', customToSave);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel, customModelStatus, customModelInput]);

  const handleModelChange = (value: string) => {
    setSelectedModel(value);
    if (value !== CUSTOM_MODEL_VALUE) {
      setCustomModelStatus('idle');
      setCustomModelError('');
      setCustomModelPricing(null);
    }
  };

  const validateCustomModel = async () => {
    if (!customModelInput.trim()) {
      setCustomModelError(_('Please enter a model ID'));
      setCustomModelStatus('invalid');
      return;
    }

    setCustomModelStatus('validating');
    setCustomModelError('');

    try {
      // Simple validation: try to make a minimal request to verify model exists
      // This uses the AI Gateway to check if the model is available
      const testSettings: AISettings = {
        ...aiSettings,
        provider: 'ai-gateway',
        aiGatewayApiKey: gatewayKey,
        aiGatewayModel: customModelInput.trim(),
      };

      const aiProvider = getAIProvider(testSettings);
      const isAvailable = await aiProvider.isAvailable();

      if (isAvailable) {
        setCustomModelStatus('valid');
        // Set unknown pricing for custom models
        setCustomModelPricing({ input: '?', output: '?' });
      } else {
        setCustomModelStatus('invalid');
        setCustomModelError(_('Model not available or invalid'));
      }
    } catch (_err) {
      setCustomModelStatus('invalid');
      setCustomModelError(_('Failed to validate model'));
    }
  };

  const handleTestConnection = async () => {
    if (!enabled) return;
    setConnectionStatus('testing');
    setErrorMessage('');

    try {
      // Persist form state first so chat uses the same values as this test.
      await saveAiSettingsPatch({
        enabled: true,
        provider,
        ollamaBaseUrl: ollamaUrl,
        ollamaModel,
        ollamaEmbeddingModel,
        aiGatewayApiKey: gatewayKey,
        aiGatewayModel: getEffectiveModelId(),
        openrouterApiKey: openrouterKey,
        openrouterBaseUrl: openrouterUrl,
        openrouterModel,
        openrouterEmbeddingModel,
        embeddingApiKey,
        embeddingBaseUrl,
        imageGenerationModel,
      });

      if (chatConfigSummary.mismatch && provider === 'openrouter') {
        setConnectionStatus('error');
        setErrorMessage(chatConfigSummary.mismatch);
        return;
      }

      const effectiveModel = getEffectiveModelId();
      const testSettings: AISettings = {
        ...aiSettings,
        provider,
        ollamaBaseUrl: ollamaUrl,
        ollamaModel,
        ollamaEmbeddingModel,
        aiGatewayApiKey: gatewayKey,
        aiGatewayModel: effectiveModel,
        openrouterApiKey: openrouterKey,
        openrouterBaseUrl: openrouterUrl,
        openrouterModel,
        openrouterEmbeddingModel,
        embeddingApiKey,
        embeddingBaseUrl,
      };
      const aiProvider = getAIProvider(testSettings);
      const isHealthy = await aiProvider.healthCheck();
      if (isHealthy) {
        setConnectionStatus('success');
      } else {
        setConnectionStatus('error');
        setErrorMessage(
          provider === 'ollama'
            ? _("Couldn't connect to Ollama. Is it running?")
            : _(
                'Invalid API key or wrong base URL. Cerebras keys need https://api.cerebras.ai/v1; OpenRouter keys (sk-or-…) need https://openrouter.ai/api/v1.',
              ),
        );
      }
    } catch (error) {
      setConnectionStatus('error');
      setErrorMessage((error as Error).message || _('Connection failed'));
    }
  };

  const disabledSection = !enabled ? 'opacity-50 pointer-events-none select-none' : '';

  return (
    <div className='my-4 w-full space-y-6'>
      <BoxedList title={_('AI Assistant')}>
        <SettingsSwitchRow
          label={_('Enable AI Assistant')}
          checked={enabled}
          onChange={() => setEnabled(!enabled)}
        />
      </BoxedList>

      {/* Always-visible summary so mismatches are obvious before Test Connection */}
      {enabled && (
        <div
          className={clsx(
            'rounded-lg border px-3 py-2.5 text-xs leading-relaxed',
            chatConfigSummary.mismatch
              ? 'border-error/40 bg-error/10 text-error'
              : 'border-success/30 bg-success/10 text-base-content',
          )}
        >
          <p className='mb-1 font-medium'>
            {chatConfigSummary.mismatch ? _('Configuration problem') : _('Active chat configuration')}
          </p>
          <p className='text-base-content/80'>
            {_('Host')}: <code className='text-base-content'>{chatConfigSummary.host}</code>
            {' · '}
            {_('Model')}: <code className='text-base-content'>{chatConfigSummary.model}</code>
            {' · '}
            {_('Key')}: {chatConfigSummary.keyOk ? _('set') : _('missing')}
          </p>
          {chatConfigSummary.mismatch && (
            <p className='mt-1.5'>{chatConfigSummary.mismatch}</p>
          )}
          {!chatConfigSummary.mismatch && provider === 'openrouter' && (
            <p className='text-base-content/60 mt-1'>
              {_(
                'Chat uses this host + key. Book Index may use local keywords or a separate OpenRouter embed key (not Vercel).',
              )}
            </p>
          )}
        </div>
      )}

      <BoxedList
        title={_('Provider')}
        description={_(
          'OpenAI-compatible (OpenRouter, Cerebras, …): one key + base URL. AI Gateway is Vercel-only. Ollama is fully local.',
        )}
        className={disabledSection}
      >
        <SettingsRow label={_('OpenAI-compatible (recommended)')} asLabel>
          <input
            type='radio'
            name='ai-provider'
            className='radio'
            checked={provider === 'openrouter'}
            onChange={() => setProvider('openrouter')}
            disabled={!enabled}
          />
        </SettingsRow>
        <SettingsRow label={_('AI Gateway (Vercel)')} asLabel>
          <input
            type='radio'
            name='ai-provider'
            className='radio'
            checked={provider === 'ai-gateway'}
            onChange={() => setProvider('ai-gateway')}
            disabled={!enabled}
          />
        </SettingsRow>
        <SettingsRow label={_('Ollama (Local)')} asLabel>
          <input
            type='radio'
            name='ai-provider'
            className='radio'
            checked={provider === 'ollama'}
            onChange={() => setProvider('ollama')}
            disabled={!enabled}
          />
        </SettingsRow>
      </BoxedList>

      {provider === 'ollama' && (
        <BoxedList title={_('Ollama Configuration')} className={disabledSection}>
          {/* Stacked-content rows: label-on-top, input below — used when the
              control is too wide to fit alongside the label (full-width text
              inputs, long selects). Custom <div> rather than <SettingsRow>
              since SettingsRow assumes label-left/control-right. */}
          <div className='flex flex-col gap-2 py-3 pe-4'>
            <div className='flex w-full items-center justify-between'>
              <SettingLabel>{_('Server URL')}</SettingLabel>
              <button
                className='hover:bg-base-200 inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150'
                onClick={fetchOllamaModels}
                disabled={!enabled || fetchingModels}
                title={_('Refresh Models')}
                aria-label={_('Refresh Models')}
              >
                <PiArrowsClockwise className='size-4' />
              </button>
            </div>
            <input
              type='text'
              className='input input-bordered input-sm w-full'
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              placeholder='http://127.0.0.1:11434'
              disabled={!enabled}
            />
          </div>
          {ollamaModels.length > 0 ? (
            <>
              <div className='flex flex-col gap-2 py-3 pe-4'>
                <SettingLabel>{_('AI Model')}</SettingLabel>
                <select
                  className='select select-bordered select-sm bg-base-100 text-base-content w-full'
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  disabled={!enabled}
                >
                  {ollamaModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>
              <div className='flex flex-col gap-2 py-3 pe-4'>
                <SettingLabel>{_('Embedding Model')}</SettingLabel>
                <select
                  className='select select-bordered select-sm bg-base-100 text-base-content w-full'
                  value={ollamaEmbeddingModel}
                  onChange={(e) => setOllamaEmbeddingModel(e.target.value)}
                  disabled={!enabled}
                >
                  {ollamaModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : !fetchingModels ? (
            <SettingsRow
              label={<span className='text-warning text-sm'>{_('No models detected')}</span>}
            />
          ) : null}
        </BoxedList>
      )}

      {provider === 'ai-gateway' && (
        <BoxedList
          title={_('AI Gateway Configuration')}
          description={_(
            'Choose from a selection of high-quality, economical AI models. You can also bring your own model by selecting "Custom Model" below.',
          )}
          className={disabledSection}
        >
          <div className='flex flex-col gap-2 pe-4 py-3'>
            <div className='flex w-full items-center justify-between'>
              <SettingLabel>{_('API Key')}</SettingLabel>
              <a
                href='https://vercel.com/docs/ai/ai-gateway'
                target='_blank'
                rel='noopener noreferrer'
                className={clsx('link text-xs', !enabled && 'pointer-events-none')}
              >
                {_('Get Key')}
              </a>
            </div>
            <input
              type='password'
              className='input input-bordered input-sm w-full'
              value={gatewayKey}
              onChange={(e) => {
                const v = e.target.value;
                // OpenRouter keys pasted here → switch provider and migrate key.
                if (v.trim().startsWith('sk-or-')) {
                  setOpenrouterKey(v.trim());
                  setGatewayKey('');
                  setProvider('openrouter');
                  if (!openrouterUrl) {
                    setOpenrouterUrl(OPENROUTER_DEFAULTS.baseUrl);
                  }
                  if (!openrouterModel) {
                    setOpenrouterModel(OPENROUTER_DEFAULTS.chatModel);
                  }
                  if (!openrouterEmbeddingModel) {
                    setOpenrouterEmbeddingModel(OPENROUTER_DEFAULTS.embeddingModel);
                  }
                  if (!imageGenerationModel) {
                    setImageGenerationModel(OPENROUTER_DEFAULTS.imageModel);
                  }
                  return;
                }
                setGatewayKey(v);
              }}
              placeholder='vck_… (Vercel AI Gateway — not sk-or-…)'
              disabled={!enabled}
            />
            <span className='text-base-content/60 text-xs'>
              {_(
                'Must be a Vercel AI Gateway key. OpenRouter keys start with sk-or- — paste those under OpenRouter (recommended) instead; we auto-switch if you paste one here.',
              )}
            </span>
          </div>
          <div className='flex flex-col gap-2 pe-4 py-3'>
            <SettingLabel>{_('Model')}</SettingLabel>
            <select
              className='select select-bordered select-sm bg-base-100 text-base-content w-full'
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={!enabled}
            >
              {modelOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label} — ${opt.inputCost}/M in, ${opt.outputCost}/M out
                </option>
              ))}
              <option value={CUSTOM_MODEL_VALUE}>{_('Custom Model...')}</option>
            </select>
          </div>

          {selectedModel === CUSTOM_MODEL_VALUE && (
            <div className='flex flex-col gap-2 pe-4 py-3'>
              <SettingLabel>{_('Custom Model ID')}</SettingLabel>
              <div className='flex w-full gap-2'>
                <input
                  type='text'
                  className='input input-bordered input-sm flex-1'
                  value={customModelInput}
                  onChange={(e) => {
                    setCustomModelInput(e.target.value);
                    setCustomModelStatus('idle');
                    setCustomModelError('');
                  }}
                  placeholder='provider/model-name'
                  disabled={!enabled}
                />
                <button
                  className='btn btn-outline btn-sm'
                  onClick={validateCustomModel}
                  disabled={!enabled || customModelStatus === 'validating'}
                >
                  {customModelStatus === 'validating' ? (
                    <PiSpinner className='size-4 animate-spin' />
                  ) : (
                    _('Validate')
                  )}
                </button>
              </div>
              {customModelStatus === 'valid' && customModelPricing && (
                <span className='text-success flex items-center gap-1 text-sm'>
                  <PiCheckCircle />
                  {_('Model available')} · ${customModelPricing.input}/M in, $
                  {customModelPricing.output}/M out
                </span>
              )}
              {customModelStatus === 'invalid' && (
                <span className='text-error text-sm'>{customModelError}</span>
              )}
            </div>
          )}
        </BoxedList>
      )}

      {provider === 'openrouter' && (
        <BoxedList
          title={_('OpenAI-compatible endpoint')}
          description={_(
            'One “API key” field is shared for the active host. Switching Known provider only changes the base URL and default models — paste that host’s own key. Cerebras and OpenRouter are different accounts/keys.',
          )}
          className={disabledSection}
        >
          {/* Known provider catalog */}
          <div className='flex flex-col gap-2 pe-4 py-3'>
            <SettingLabel>{_('Known provider')}</SettingLabel>
            <select
              className='select select-bordered select-sm bg-base-100 text-base-content w-full'
              value={knownEndpointId}
              disabled={!enabled}
              onChange={(e) => {
                const id = e.target.value as KnownProviderId;
                const prevId = knownEndpointIdRef.current;
                const currentKey = openrouterKey.trim();
                // Remember key for the host we leave (session only).
                if (currentKey) {
                  keysByHostRef.current[prevId] = currentKey;
                }
                setKnownEndpointId(id);
                const known = getKnownProvider(id);
                if (!known) return;
                setProvider('openrouter');
                const patch = applyKnownProviderToSettings(
                  id,
                  {
                    ...DEFAULT_AI_SETTINGS,
                    ...aiSettings,
                    provider: 'openrouter',
                    openrouterApiKey: openrouterKey,
                    openrouterBaseUrl: openrouterUrl,
                    openrouterModel,
                    openrouterEmbeddingModel,
                    imageGenerationModel,
                  },
                  { forceModels: true },
                );
                const nextUrl =
                  patch.openrouterBaseUrl !== undefined
                    ? patch.openrouterBaseUrl
                    : openrouterUrl;
                const nextModel = patch.openrouterModel || openrouterModel;
                const nextEmbed =
                  patch.openrouterEmbeddingModel || openrouterEmbeddingModel;
                const nextImage = patch.imageGenerationModel || imageGenerationModel;

                // Prefer key previously used for this host; otherwise only keep
                // the current key if it matches the new host’s key style.
                let nextKey = keysByHostRef.current[id] ?? '';
                if (!nextKey && currentKey) {
                  const isOr = currentKey.startsWith('sk-or-');
                  if (id === 'openrouter') {
                    nextKey = isOr ? currentKey : '';
                  } else if (id === 'openai') {
                    nextKey = currentKey.startsWith('sk-') && !isOr ? currentKey : '';
                  } else if (id === 'cerebras' || id === 'groq' || id === 'xai') {
                    // Different accounts — do not reuse an OpenRouter key here
                    nextKey = isOr ? '' : currentKey;
                  } else {
                    nextKey = currentKey;
                  }
                }

                if (patch.openrouterBaseUrl !== undefined) {
                  setOpenrouterUrl(patch.openrouterBaseUrl);
                }
                if (patch.openrouterModel) setOpenrouterModel(patch.openrouterModel);
                if (patch.openrouterEmbeddingModel) {
                  setOpenrouterEmbeddingModel(patch.openrouterEmbeddingModel);
                }
                if (patch.imageGenerationModel) {
                  setImageGenerationModel(patch.imageGenerationModel);
                }
                setOpenrouterKey(nextKey);
                setOpenrouterModels([]);
                setConnectionStatus('idle');
                void saveAiSettingsPatch({
                  provider: 'openrouter',
                  openrouterApiKey: nextKey,
                  openrouterBaseUrl: nextUrl,
                  openrouterModel: nextModel,
                  openrouterEmbeddingModel: nextEmbed,
                  imageGenerationModel: nextImage,
                });
              }}
            >
              {openaiCompatibleProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.recommended ? `${p.name} (recommended)` : p.name}
                </option>
              ))}
            </select>
            {selectedKnownEndpoint?.description && (
              <span className='text-base-content/60 text-xs'>
                {_(selectedKnownEndpoint.description)}
              </span>
            )}
            <div className='flex flex-wrap gap-3'>
              {selectedKnownEndpoint?.docsUrl && (
                <a
                  href={selectedKnownEndpoint.docsUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  className={clsx('link text-xs', !enabled && 'pointer-events-none')}
                >
                  {_('Inference docs')}
                </a>
              )}
              {selectedKnownEndpoint?.websiteUrl && (
                <a
                  href={selectedKnownEndpoint.websiteUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  className={clsx('link text-xs', !enabled && 'pointer-events-none')}
                >
                  {_('Provider website')}
                </a>
              )}
            </div>
          </div>

          <div className='flex flex-col gap-2 pe-4 py-3'>
            <button
              type='button'
              className='btn btn-primary btn-sm h-9 min-h-0 w-full sm:w-auto'
              disabled={!enabled}
              onClick={() => {
                const id = knownEndpointId;
                const patch = applyKnownProviderToSettings(
                  id,
                  {
                    ...DEFAULT_AI_SETTINGS,
                    ...aiSettings,
                    provider: 'openrouter',
                    openrouterApiKey: openrouterKey,
                    openrouterBaseUrl: openrouterUrl,
                    openrouterModel,
                    openrouterEmbeddingModel,
                    imageGenerationModel,
                  },
                  { forceModels: true },
                );
                if (patch.openrouterBaseUrl) setOpenrouterUrl(patch.openrouterBaseUrl);
                if (patch.openrouterModel) setOpenrouterModel(patch.openrouterModel);
                if (patch.openrouterEmbeddingModel) {
                  setOpenrouterEmbeddingModel(patch.openrouterEmbeddingModel);
                }
                if (patch.imageGenerationModel) {
                  setImageGenerationModel(patch.imageGenerationModel);
                }
                // Migrate a mistaken sk-or- key from the Gateway field if present.
                if (!openrouterKey.trim() && gatewayKey.trim().startsWith('sk-or-')) {
                  setOpenrouterKey(gatewayKey.trim());
                  setGatewayKey('');
                  setKnownEndpointId('openrouter');
                }
              }}
            >
              {_('Apply recommended models for this provider')}
            </button>
            <span className='text-base-content/60 text-xs'>
              {_(
                'Fills base URL and known-good chat / embedding / image model ids from the catalog (local, no network).',
              )}
            </span>
          </div>

          {/* API key — one field for the *active* host only */}
          <div className='flex flex-col gap-2 pe-4 py-3'>
            <div className='flex w-full items-center justify-between'>
              <SettingLabel>
                {_('API key for')} {selectedKnownEndpoint?.name || _('this host')}
              </SettingLabel>
              {selectedKnownEndpoint?.keysUrl ? (
                <a
                  href={selectedKnownEndpoint.keysUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  className={clsx('link text-xs', !enabled && 'pointer-events-none')}
                >
                  {_('Get Key')}
                </a>
              ) : null}
            </div>
            <input
              type='password'
              className='input input-bordered input-sm w-full'
              value={openrouterKey}
              onChange={(e) => {
                const v = e.target.value;
                setOpenrouterKey(v);
                keysByHostRef.current[knownEndpointIdRef.current] = v.trim();
                // OpenRouter keys only work on openrouter.ai — switch host to match.
                if (v.trim().startsWith('sk-or-')) {
                  setProvider('openrouter');
                  if (knownEndpointId !== 'openrouter') {
                    setKnownEndpointId('openrouter');
                    setOpenrouterUrl(OPENROUTER_DEFAULTS.baseUrl);
                  }
                }
              }}
              placeholder={
                knownEndpointId === 'cerebras'
                  ? _('Cerebras API key from cloud.cerebras.ai')
                  : selectedKnownEndpoint?.apiKeyPrefixes?.[0]
                    ? `${selectedKnownEndpoint.apiKeyPrefixes[0]}…`
                    : 'API key for this host'
              }
              disabled={!enabled}
              autoComplete='off'
            />
            <span className='text-base-content/60 text-xs'>
              {knownEndpointId === 'openrouter'
                ? _('Must start with sk-or-. This is not your Cerebras key.')
                : knownEndpointId === 'cerebras'
                  ? _(
                      'Cerebras key only. Switching to OpenRouter clears this field so the wrong key is not sent to openrouter.ai.',
                    )
                  : _('Paste the API key from the selected provider’s website (each host has its own key).')}
            </span>
          </div>

          {/* Base URL + refresh */}
          <div className='flex flex-col gap-2 pe-4 py-3'>
            <div className='flex w-full items-center justify-between'>
              <SettingLabel>{_('Base URL')}</SettingLabel>
              <button
                className='hover:bg-base-200 inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150'
                onClick={fetchOpenrouterModelList}
                disabled={
                  !enabled ||
                  openrouterFetchingModels ||
                  !openrouterKey ||
                  selectedKnownEndpoint?.supportsModelsList === false
                }
                title={_('Refresh Models')}
                aria-label={_('Refresh Models')}
              >
                {openrouterFetchingModels ? (
                  <PiSpinner className='size-4 animate-spin' />
                ) : (
                  <PiArrowsClockwise className='size-4' />
                )}
              </button>
            </div>
            <input
              type='text'
              className='input input-bordered input-sm w-full'
              value={openrouterUrl}
              onChange={(e) => {
                setOpenrouterUrl(e.target.value);
                setKnownEndpointId('custom');
              }}
              placeholder={
                selectedKnownEndpoint?.baseUrl || OPENROUTER_DEFAULTS.baseUrl
              }
              disabled={!enabled}
            />
          </div>

          {/* Chat / LLM */}
          <div className='flex flex-col gap-2 pe-4 py-3'>
            <SettingLabel>{_('Chat model (LLM)')}</SettingLabel>
            {openrouterModels.length > 0 ? (
              <select
                className='select select-bordered select-sm bg-base-100 text-base-content w-full'
                value={openrouterModel}
                onChange={(e) => setOpenrouterModel(e.target.value)}
                disabled={!enabled}
              >
                {openrouterModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name ? `${m.name} (${m.id})` : m.id}
                  </option>
                ))}
              </select>
            ) : (
              <select
                className='select select-bordered select-sm bg-base-100 text-base-content w-full'
                value={openrouterModel}
                onChange={(e) => setOpenrouterModel(e.target.value)}
                disabled={!enabled}
              >
                {(selectedKnownEndpoint?.chatModelPresets?.length
                  ? selectedKnownEndpoint.chatModelPresets
                  : OPENROUTER_CHAT_PRESETS
                ).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}
            {!openrouterModels.length && (
              <input
                type='text'
                className='input input-bordered input-sm w-full'
                value={openrouterModel}
                onChange={(e) => setOpenrouterModel(e.target.value)}
                placeholder={OPENROUTER_DEFAULTS.chatModel}
                disabled={!enabled}
              />
            )}
            <span className='text-base-content/60 text-xs'>
              {_('Used for Chat and for crafting Illustrate prompts (step 1).')}
            </span>
            {openrouterModelsError && (
              <span className='text-error text-xs'>{openrouterModelsError}</span>
            )}
          </div>

          {/* Embedding / book indexing — clear chat vs search split */}
          <div className='flex flex-col gap-2 pe-4 py-3'>
            <SettingLabel>{_('Book indexing (embeddings)')}</SettingLabel>
            {isChatOnlyEmbedHost(openrouterUrl) ? (
              <div className='border-base-content/10 bg-base-200/50 rounded-lg border p-3 text-xs leading-relaxed'>
                <p className='text-base-content mb-1 font-medium'>
                  {_('Chat and book search use different services')}
                </p>
                <ul className='text-base-content/70 list-inside list-disc space-y-1'>
                  <li>
                    {_('Chat answers → your current API (e.g. Cerebras). Keep that key above.')}
                  </li>
                  <li>
                    {_(
                      'Book Index needs embeddings. Cerebras has none — optionally add OpenRouter below (not Vercel).',
                    )}
                  </li>
                  <li>
                    {_(
                      'No OpenRouter embed key? Index still works with free local keyword search; chat still uses Cerebras.',
                    )}
                  </li>
                </ul>
                <p className='text-base-content/70 mt-2'>
                  {_('Suggested embedding model (via OpenRouter):')}{' '}
                  <code className='text-base-content'>openai/text-embedding-3-small</code>
                </p>
              </div>
            ) : (
              <span className='text-base-content/60 text-xs'>
                {_(
                  'Used to Index a book for semantic search. Same OpenAI-compatible key as chat when the host supports /embeddings (e.g. OpenRouter, OpenAI).',
                )}
              </span>
            )}

            {isChatOnlyEmbedHost(openrouterUrl) && (
              <>
                <div className='flex w-full items-center justify-between pt-1'>
                  <SettingLabel>{_('OpenRouter API key (embeddings only)')}</SettingLabel>
                  <a
                    href={EMBEDDING_VIA_OPENROUTER.keysUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                    className={clsx('link text-xs', !enabled && 'pointer-events-none')}
                  >
                    {_('Get OpenRouter key')}
                  </a>
                </div>
                <input
                  type='password'
                  className='input input-bordered input-sm w-full'
                  value={embeddingApiKey}
                  onChange={(e) => setEmbeddingApiKey(e.target.value)}
                  placeholder='sk-or-v1-… (optional, for better book search)'
                  disabled={!enabled}
                  autoComplete='off'
                />
                <input
                  type='text'
                  className='input input-bordered input-sm w-full'
                  value={embeddingBaseUrl}
                  onChange={(e) => setEmbeddingBaseUrl(e.target.value)}
                  placeholder={EMBEDDING_VIA_OPENROUTER.baseUrl}
                  disabled={!enabled}
                />
                <span className='text-base-content/60 text-xs'>
                  {_(
                    'Optional. OpenRouter only — not Vercel AI Gateway. Leave empty to index with local keywords.',
                  )}
                </span>
              </>
            )}

            <SettingLabel>{_('Embedding model')}</SettingLabel>
            <select
              className='select select-bordered select-sm bg-base-100 text-base-content w-full'
              value={openrouterEmbeddingModel || OPENROUTER_DEFAULTS.embeddingModel}
              onChange={(e) => setOpenrouterEmbeddingModel(e.target.value)}
              disabled={!enabled}
            >
              {OPENROUTER_EMBED_PRESETS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              {openrouterModels
                .filter((m) => m.id.includes('embed'))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name ? `${m.name} (${m.id})` : m.id}
                  </option>
                ))}
            </select>
            <input
              type='text'
              className='input input-bordered input-sm w-full'
              value={openrouterEmbeddingModel}
              onChange={(e) => setOpenrouterEmbeddingModel(e.target.value)}
              placeholder={OPENROUTER_DEFAULTS.embeddingModel}
              disabled={!enabled}
            />
            <span className='text-base-content/60 text-xs'>
              {isChatOnlyEmbedHost(openrouterUrl)
                ? _(
                    'When using OpenRouter for embeddings, pick openai/text-embedding-3-small (recommended).',
                  )
                : _('Recommended on OpenRouter: openai/text-embedding-3-small.')}
            </span>
          </div>

          {/* Image */}
          <div className='flex flex-col gap-2 pe-4 py-3'>
            <SettingLabel>{_('Image model (Illustrate)')}</SettingLabel>
            <select
              className='select select-bordered select-sm bg-base-100 text-base-content w-full'
              value={imageGenerationModel || OPENROUTER_DEFAULTS.imageModel}
              onChange={(e) => setImageGenerationModel(e.target.value)}
              disabled={!enabled}
            >
              {OPENROUTER_IMAGE_PRESETS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <input
              type='text'
              className='input input-bordered input-sm w-full'
              value={imageGenerationModel}
              onChange={(e) => setImageGenerationModel(e.target.value)}
              placeholder={OPENROUTER_DEFAULTS.imageModel}
              disabled={!enabled}
            />
            <span className='text-base-content/60 text-xs'>
              {isChatOnlyEmbedHost(openrouterUrl)
                ? _(
                    'Illustrate needs an image-capable API (not Cerebras). Uses your OpenRouter embed key above if set, model e.g. google/gemini-2.5-flash-image.',
                  )
                : _(
                    'Illustrate: (1) chat model crafts a visual prompt, (2) this image model renders it. Use an image-capable model on OpenRouter.',
                  )}
            </span>
          </div>
        </BoxedList>
      )}

      {provider !== 'openrouter' && (
        <BoxedList
          title={_('Image generation')}
          description={_(
            'Cite a sentence with the Illustrate toolbar action to generate an image. Uses your AI Gateway key when OpenRouter is not selected.',
          )}
          className={disabledSection}
        >
          <div className='flex flex-col gap-2 pe-4 py-3'>
            <SettingLabel>{_('Image generation model')}</SettingLabel>
            <input
              type='text'
              className='input input-bordered input-sm w-full'
              value={imageGenerationModel}
              onChange={(e) => setImageGenerationModel(e.target.value)}
              placeholder='google/gemini-2.5-flash-image'
              disabled={!enabled}
            />
          </div>
        </BoxedList>
      )}

      <BoxedList
        title={_('Reedy Retrieval (Beta)')}
        className={disabledSection}
        description={
          isTauriAppPlatform()
            ? _(
                'Uses Turso vector search + CFI-anchored citations. The model decides when to look up passages instead of getting them stuffed into the system prompt.',
              )
            : _('Reedy is desktop-only in this beta. Use the Readest desktop app to try it.')
        }
      >
        <SettingsSwitchRow
          label={_('Use Reedy retrieval')}
          checked={reedyEnabled}
          disabled={!enabled || !isTauriAppPlatform()}
          onChange={() => {
            const next = !reedyEnabled;
            setReedyEnabled(next);
            saveAiSetting('reedy', {
              enabled: next,
              runtime: reedyAgentRuntime ? 'agent' : 'mvp',
            });
          }}
        />
        <SettingsSwitchRow
          label={_('Use agent runtime (experimental)')}
          checked={reedyAgentRuntime}
          disabled={!enabled || !reedyEnabled || !isTauriAppPlatform()}
          onChange={() => {
            const next = !reedyAgentRuntime;
            setReedyAgentRuntime(next);
            saveAiSetting('reedy', {
              enabled: reedyEnabled,
              runtime: next ? 'agent' : 'mvp',
            });
          }}
        />
        <div className='flex min-h-14 items-center justify-between gap-3 pe-4'>
          <div className='flex min-w-0 flex-col gap-0.5'>
            <SettingLabel>{_('Send Reedy feedback')}</SettingLabel>
          </div>
          <button
            className='btn btn-outline btn-sm'
            disabled={!enabled || !isTauriAppPlatform() || !appService}
            onClick={async () => {
              if (!appService) return;
              try {
                const bundle = await exportReedyMetricsBundle(appService);
                const blob = new Blob([bundle], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `reedy-feedback-${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } catch (err) {
                console.error('[Reedy] feedback export failed', err);
              }
            }}
          >
            {_('Download')}
          </button>
        </div>
      </BoxedList>

      <BoxedList title={_('Connection')} className={disabledSection}>
        <div className='flex min-h-14 items-center justify-between gap-3 pe-4'>
          <button
            className='btn btn-outline btn-sm'
            onClick={handleTestConnection}
            disabled={!enabled || connectionStatus === 'testing'}
          >
            {_('Test Connection')}
          </button>
          <div>
            {connectionStatus === 'success' && (
              <span className='text-success flex items-center gap-1 text-sm'>
                <PiCheckCircle className='size-4 shrink-0' />
                {_('Connected')}
              </span>
            )}
            {connectionStatus === 'error' && (
              <span className='text-error flex items-center gap-1 text-sm'>
                <PiWarningCircle className='size-4 shrink-0' />
                {errorMessage || _('Failed')}
              </span>
            )}
          </div>
        </div>
      </BoxedList>
    </div>
  );
};

export default AIPanel;
