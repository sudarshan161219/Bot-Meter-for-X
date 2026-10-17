// Replays the server-rendered data stream of a saved x.com page (test/pages/*.html)
// and returns the objects X's page scripts build: the same values inject.js
// hands to the parser on a real first page load.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';

export function replayPage(page: string): unknown[] {
  const html = readFileSync(join(import.meta.dirname, '..', 'pages', page), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? '');
  const ctx: Record<string, unknown> = {
    document: { addEventListener() {}, dispatchEvent() {}, currentScript: { remove() {} } },
    Event: class {},
    ReadableStream,
  };
  ctx.window = ctx.self = ctx.globalThis = ctx;
  createContext(ctx);
  for (const code of scripts) {
    // Only the TanStack/seroval data stream, not React's own helpers.
    if (code.includes('$_TSR') || code.startsWith('($R=>')) runInContext(code, ctx);
  }
  const R = ctx.$R as { tsr?: unknown[] } | undefined;
  return R?.tsr ?? [];
}
