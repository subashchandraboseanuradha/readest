/**
 * OpenAI-compatible chat streaming with an explicit Authorization header.
 * Used by the notebook chat adapter (browser) and /api/ai/chat (server).
 * Avoids AI SDK createOpenAICompatible edge cases that omit Bearer and
 * produce OpenRouter "Missing Authentication header" + empty replies.
 */

export type OAIChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export async function* streamOpenAICompatibleChatText(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: OAIChatMessage[];
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const base = (args.baseUrl || '').replace(/\/+$/, '');
  const key = (args.apiKey || '').trim();
  if (!base) throw new Error('Chat base URL is missing.');
  if (!key) {
    throw new Error(
      'Chat API key is empty. Paste your key in Settings → AI and click Test Connection.',
    );
  }
  if (!args.model?.trim()) throw new Error('Chat model id is missing.');

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'HTTP-Referer': 'https://readest.com',
      'X-Title': 'Readest',
    },
    body: JSON.stringify({
      model: args.model.trim(),
      messages: args.messages,
      stream: true,
    }),
    signal: args.signal,
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    let message = errBody.slice(0, 400) || res.statusText;
    try {
      const j = JSON.parse(errBody) as { error?: { message?: string } | string };
      if (typeof j.error === 'string') message = j.error;
      else if (j.error && typeof j.error === 'object' && j.error.message) {
        message = j.error.message;
      }
    } catch {
      /* keep raw */
    }
    if (/missing authentication/i.test(message)) {
      throw new Error(
        `Chat auth failed at ${base} (401). Authorization Bearer was rejected. ` +
          `Confirm the API key matches this base URL in Settings → AI (Cerebras key only works with https://api.cerebras.ai/v1; OpenRouter keys start with sk-or-).`,
      );
    }
    throw new Error(`Chat failed (${res.status}) at ${base}: ${message}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Chat failed: empty response body.');

  const decoder = new TextDecoder();
  let buffer = '';
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const json = JSON.parse(data) as {
          choices?: { delta?: { content?: string }; message?: { content?: string } }[];
        };
        const delta =
          json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? '';
        if (delta) {
          total += delta.length;
          yield delta;
        }
      } catch {
        /* skip malformed SSE */
      }
    }
  }

  if (total === 0) {
    throw new Error(
      `Chat returned no text from ${base}. Check model “${args.model}” is valid for this provider and your key has access.`,
    );
  }
}
