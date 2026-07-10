import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isTauriAppPlatform } from '@/services/environment';

/**
 * AI providers need to call arbitrary third-party HTTP endpoints
 * (OpenRouter, OpenAI-compatible proxies, self-hosted Ollama, internal
 * LLM gateways, etc.). In a browser/webview context the standard
 * `window.fetch` is subject to CORS preflight rules AND — on Android —
 * the platform's cleartext-traffic policy. Neither restriction makes
 * sense for an AI provider call: the user explicitly typed the endpoint
 * URL into our settings and authenticated to it themselves, so we want
 * the same semantics as `curl` or `reqwest` (raw HTTP, no Origin header,
 * no preflight, no cleartext block).
 *
 * `@tauri-apps/plugin-http` gives us exactly that: the request is sent
 * from the Rust side via reqwest, bypassing the renderer entirely. We
 * expose a single helper so every provider goes through the same
 * decision rather than each file re-implementing the platform check.
 *
 * For web builds (no Tauri runtime) we use the global `fetch`:
 *  - Browser: window/globalThis.fetch (CORS still applies)
 *  - Next.js API routes / Node: globalThis.fetch (no `window` — using
 *    `window.fetch` here caused "window is not defined" in Image studio)
 */
export const getAIFetch = (): typeof fetch => {
  if (isTauriAppPlatform()) {
    // tauriFetch matches the standard `fetch` signature, so ai-sdk
    // providers can take it directly via their `fetch` option.
    return tauriFetch as unknown as typeof fetch;
  }
  // Prefer globalThis so server-side image/embed/chat proxies work.
  const g = globalThis as typeof globalThis & { fetch?: typeof fetch };
  if (typeof g.fetch === 'function') {
    return g.fetch.bind(g);
  }
  // Last resort (very old environments)
  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    return window.fetch.bind(window);
  }
  throw new Error('No fetch implementation available for AI HTTP calls.');
};
