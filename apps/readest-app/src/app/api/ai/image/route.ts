import { NextResponse } from 'next/server';
import type { AISettings } from '@/services/ai/types';
import { generateImageFromCitationDirect } from '@/services/ai/imageGeneration';

/**
 * Server-side Illustrate proxy — avoids browser CORS "Failed to fetch"
 * when calling OpenRouter / image hosts from the web client.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const selectionText =
      typeof body.selectionText === 'string' ? body.selectionText.trim() : '';
    if (!selectionText) {
      return NextResponse.json({ error: 'selectionText required' }, { status: 400 });
    }

    const partial = (body.settings || {}) as Partial<AISettings>;
    if (!partial.enabled) {
      return NextResponse.json(
        { error: 'AI is disabled. Enable it in Settings → AI.' },
        { status: 400 },
      );
    }

    const settings = {
      enabled: true,
      provider: partial.provider || 'openrouter',
      openrouterApiKey: partial.openrouterApiKey,
      openrouterBaseUrl: partial.openrouterBaseUrl,
      openrouterModel: partial.openrouterModel,
      embeddingApiKey: partial.embeddingApiKey,
      embeddingBaseUrl: partial.embeddingBaseUrl,
      aiGatewayApiKey: partial.aiGatewayApiKey,
      aiGatewayModel: partial.aiGatewayModel,
      imageGenerationModel: partial.imageGenerationModel,
    } as AISettings;

    const result = await generateImageFromCitationDirect({
      selectionText,
      bookTitle: typeof body.bookTitle === 'string' ? body.bookTitle : undefined,
      author: typeof body.author === 'string' ? body.author : undefined,
      styleHint: typeof body.styleHint === 'string' ? body.styleHint : undefined,
      settings,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
