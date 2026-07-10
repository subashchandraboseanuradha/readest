import { validateUserAndToken } from '@/utils/access';
import { streamText, createGateway } from 'ai';
import type { ModelMessage } from 'ai';
import { OPENROUTER_DEFAULTS } from '@/services/ai/constants';
import { streamOpenAICompatibleChatText } from '@/services/ai/utils/openaiCompatibleChat';

const looksLikeOpenRouterKey = (key: string) => key.trim().startsWith('sk-or-');

type ChatMessage = { role: string; content: string };

export async function POST(req: Request): Promise<Response> {
  try {
    const {
      messages,
      system,
      apiKey,
      model,
      baseUrl: bodyBaseUrl,
      provider: bodyProvider,
    } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: 'Messages required' }, { status: 400 });
    }

    const clientKey = typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : '';
    if (!clientKey) {
      const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
      if (!user || !token) {
        return Response.json(
          {
            error:
              'Not authenticated. Sign in, or add your own API key in Settings → AI.',
          },
          { status: 403 },
        );
      }
    }

    const gatewayApiKey = clientKey || process.env['AI_GATEWAY_API_KEY'];
    if (!gatewayApiKey) {
      return Response.json({ error: 'API key required in Settings → AI.' }, { status: 401 });
    }

    const modelId =
      (typeof model === 'string' && model.trim()) ||
      process.env['AI_GATEWAY_MODEL'] ||
      OPENROUTER_DEFAULTS.chatModel;

    const useOpenAICompatible =
      bodyProvider === 'openrouter' ||
      looksLikeOpenRouterKey(gatewayApiKey) ||
      (typeof bodyBaseUrl === 'string' && bodyBaseUrl.trim().length > 0);

    if (useOpenAICompatible) {
      const baseURL = (
        (typeof bodyBaseUrl === 'string' && bodyBaseUrl.trim()) ||
        OPENROUTER_DEFAULTS.baseUrl
      ).replace(/\/+$/, '');

      const oaiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
      if (typeof system === 'string' && system.trim()) {
        oaiMessages.push({ role: 'system', content: system.trim() });
      }
      for (const m of messages as ChatMessage[]) {
        if (m.role === 'user' || m.role === 'assistant' || m.role === 'system') {
          oaiMessages.push({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content,
          });
        }
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for await (const chunk of streamOpenAICompatibleChatText({
              baseUrl: baseURL,
              apiKey: gatewayApiKey,
              model: modelId,
              messages: oaiMessages,
            })) {
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            controller.enqueue(encoder.encode(`\n[Error] ${msg}`));
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
    }

    const gateway = createGateway({ apiKey: gatewayApiKey });
    const languageModel = gateway(modelId || 'google/gemini-2.5-flash-lite');
    const result = streamText({
      model: languageModel,
      system: system || 'You are a helpful assistant.',
      messages: messages as ModelMessage[],
    });
    return result.toTextStreamResponse();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: `Chat failed: ${errorMessage}` }, { status: 500 });
  }
}
