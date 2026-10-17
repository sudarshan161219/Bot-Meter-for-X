// The Creator Tools page hook against a replayed x.com page (server-rendered
// stream), stubbed fetch/XHR, and a second hook installed alongside it (as when
// Bot Meter and Creator Tools are both installed).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { installHook, type HookTarget } from '../../src/creator/capture/hook';
import { parseGraphQL } from '../../src/creator/capture/parse-graphql';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10));

class FakeXHR {
  responseType = '';
  responseText = '';
  response: unknown = null;
  private listeners: (() => void)[] = [];
  open(_method: string, _url: string): void {}
  send(_body?: unknown): void {}
  addEventListener(_type: string, fn: () => void): void {
    this.listeners.push(fn);
  }
  respond(text: string): void {
    this.responseText = text;
    for (const fn of this.listeners) fn.call(this);
  }
}

function target(responses: Record<string, unknown> = {}): HookTarget {
  return {
    fetch: (async (url: string) => {
      const res = new Response(JSON.stringify(responses[url] ?? {}), { headers: { 'content-type': 'application/json' } });
      Object.defineProperty(res, 'url', { value: url });
      return res;
    }) as unknown as typeof fetch,
    XMLHttpRequest: FakeXHR as unknown as typeof XMLHttpRequest,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
  };
}

describe('installHook', () => {
  it('reads the server-rendered stream of a real page, even with a second hook installed', async () => {
    const html = readFileSync(join(import.meta.dirname, '..', 'pages', 'status-NASA.html'), 'utf8');
    const ctx: Record<string, unknown> = {
      document: { addEventListener() {}, dispatchEvent() {}, currentScript: { remove() {} } },
      Event: class {},
      ReadableStream,
    };
    ctx.window = ctx.self = ctx.globalThis = ctx;
    createContext(ctx);
    const first: unknown[] = [];
    const second: unknown[] = [];
    const t = Object.assign(ctx, target()) as unknown as HookTarget;
    installHook(t, (d) => first.push(d));
    installHook(t, (d) => second.push(d));
    for (const [, code = ''] of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      if (code.includes('$_TSR') || code.startsWith('($R=>')) runInContext(code, ctx);
    }
    await tick();
    for (const got of [first, second]) {
      const ids = got.flatMap((d) => parseGraphQL(d).tweets.map((tw) => tw.id));
      expect(ids).toContain('2103610284464316469');
    }
  });

  it('reads JSON from X API fetches and XHRs, and ignores other URLs', async () => {
    const tweet = {
      __typename: 'Tweet',
      rest_id: '42',
      core: { user_results: { result: { __typename: 'User', rest_id: '7', core: { screen_name: 'someone', name: 'S' } } } },
      details: { full_text: 'hello' },
    };
    const t = target({ 'https://api.x.com/graphql/abc/TweetDetail': { data: { tweet } }, 'https://x.com/other': { data: { tweet } } });
    const got: unknown[] = [];
    installHook(t, (d) => got.push(d));

    await t.fetch('https://api.x.com/graphql/abc/TweetDetail');
    await t.fetch('https://x.com/other');
    await tick();
    expect(got).toHaveLength(1);
    expect(parseGraphQL(got[0]).tweets[0]?.text).toBe('hello');

    const xhr = new t.XMLHttpRequest() as unknown as FakeXHR;
    xhr.open('GET', 'https://x.com/i/api/graphql/x/HomeTimeline');
    xhr.send();
    xhr.respond(JSON.stringify({ data: { tweet } }));
    expect(got).toHaveLength(2);
  });

  it('never lets a failing reader break the page', async () => {
    const t = target({ 'https://api.x.com/graphql/abc/X': {} });
    installHook(t, () => {
      throw new Error('parser broke');
    });
    await expect(t.fetch('https://api.x.com/graphql/abc/X')).resolves.toBeInstanceOf(Response);
  });
});
