// @vitest-environment jsdom
// Runs the real Bot Meter core (settings.js, stats.js, content.js) in jsdom so the
// fallback is tested against the same page helpers it uses in the extension.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { readArticle } from '../../src/creator/capture/dom-fallback';
import { getCore, type BotMeterCore } from '../../src/creator/core';

let core: BotMeterCore;

beforeAll(() => {
  (globalThis as { chrome?: unknown }).chrome = {
    storage: { sync: { get: (_d: unknown, cb: (v: object) => void) => cb({}) }, onChanged: { addListener() {} } },
  };
  for (const file of ['settings.js', 'stats.js', 'content.js']) {
    new Function(readFileSync(join(import.meta.dirname, '..', '..', 'src', file), 'utf8'))();
  }
  const found = getCore();
  if (!found) throw new Error('BotMeterCore not exposed by content.js');
  core = found;
});

// Mirrors X's 2026 markup: no data-testid, post text in dir="auto".
const markup = `
  <article>
    <div><span><a href="/maya_writes">Maya Chen</a></span>
      <span><a href="/maya_writes">@maya_writes</a> · <a href="/maya_writes/status/1880000000000000000">2h</a></span></div>
    <div dir="auto">Finished the draft. Thanks <a href="/editor">@editor</a>!</div>
    <div role="link"><article>
      <div><a href="/quoted">@quoted</a> <a href="/quoted/status/1870000000000000000">1d</a></div>
      <div dir="auto">quoted text</div>
    </article></div>
  </article>`;

describe('readArticle', () => {
  it("reads a post's author, ID, name and text using the core helpers", () => {
    document.body.innerHTML = markup;
    const article = document.querySelector('article');
    if (!article) throw new Error('no article');
    const tweet = readArticle(article, core);
    expect(tweet).toMatchObject({
      id: '1880000000000000000',
      authorHandle: 'maya_writes',
      authorName: 'Maya Chen',
      text: 'Finished the draft. Thanks @editor!',
      source: 'dom',
    });
    // Snowflake IDs carry the post time.
    expect(tweet?.createdAt).toBe(Number((1880000000000000000n >> 22n) + 1288834974657n));
  });

  it("reads a nested quoted post on its own, without the outer post's text", () => {
    document.body.innerHTML = markup;
    const inner = document.querySelectorAll('article')[1];
    if (!inner) throw new Error('no inner article');
    expect(readArticle(inner, core)).toMatchObject({ id: '1870000000000000000', authorHandle: 'quoted', text: 'quoted text' });
  });

  it('returns null while a post is still rendering (no permalink yet)', () => {
    document.body.innerHTML = '<article><a href="/someone">@someone</a><div dir="auto">loading…</div></article>';
    const article = document.querySelector('article');
    if (!article) throw new Error('no article');
    expect(readArticle(article, core)).toBeNull();
  });
});
