// @vitest-environment jsdom
// The quote link on a post's page, with the real Bot Meter core in jsdom.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { TweetCache } from '../../src/creator/cache';
import { getCore } from '../../src/creator/core';
import { postPageId, quoteLabel, startQuoteLink } from '../../src/creator/quotes';
import { coerceSettings, type CreatorSettings } from '../../src/creator/settings';
import { post } from './thread-fixtures';

const ID = '1900000000000000000';
let cache: TweetCache;
let setSettings: (s: CreatorSettings) => void = () => {};
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 250));
const link = (): HTMLAnchorElement | null => document.querySelector('.bm-quotes');

beforeAll(async () => {
  (globalThis as { chrome?: unknown }).chrome = {
    storage: { sync: { get: (_d: unknown, cb: (v: object) => void) => cb({}) }, onChanged: { addListener() {} } },
  };
  for (const file of ['settings.js', 'stats.js', 'content.js']) {
    new Function(readFileSync(join(import.meta.dirname, '..', '..', 'src', file), 'utf8'))();
  }
  const core = getCore();
  if (!core) throw new Error('BotMeterCore not exposed by content.js');
  history.pushState({}, '', `/maya_writes/status/${ID}`);
  document.body.innerHTML = `<main><div><article>
    <a href="/maya_writes">Maya</a> <a href="/maya_writes">@maya_writes</a> <a href="/maya_writes/status/${ID}">2h</a>
    <div dir="auto">Big news today</div>
    <div class="bar"><div data-engagement-action="reply"></div><div data-engagement-action="like"></div><button data-engagement-action="share"></button></div>
  </article></div></main>`;
  cache = new TweetCache();
  cache.putTweets([post(ID, 'Big news today', { metrics: { likes: 9, reposts: 1, replies: 2, quotes: 60, views: null, bookmarks: null } })]);
  startQuoteLink(core, cache, (fn) => {
    setSettings = fn;
    fn(coerceSettings({}));
  });
  await settle();
});

describe('quote link', () => {
  it("adds the post's quote count to its action bar, linking to X's quotes list", () => {
    expect(link()?.textContent).toBe('View 60 quotes');
    expect(link()?.getAttribute('href')).toBe(`/maya_writes/status/${ID}/quotes`);
    expect(link()?.parentElement?.className).toBe('bar');
  });

  it('follows the count as it changes, and still offers the list when there is no count', async () => {
    cache.putTweets([post(ID, 'Big news today', { metrics: { likes: 9, reposts: 1, replies: 2, quotes: 1, views: null, bookmarks: null } })]);
    await settle();
    expect(link()?.textContent).toBe('View 1 quote');
    cache.putTweets([post(ID, 'Big news today', { metrics: { likes: 9, reposts: 1, replies: 2, quotes: 0, views: null, bookmarks: null } })]);
    await settle();
    expect(link()?.textContent).toBe('View quotes');
  });

  it('turns off with its switch or with Bot Meter', async () => {
    cache.putTweets([post(ID, 'Big news today', { metrics: { likes: 9, reposts: 1, replies: 2, quotes: 5, views: null, bookmarks: null } })]);
    setSettings(coerceSettings({ showQuotes: false }));
    await settle();
    expect(link()).toBeNull();
    setSettings(coerceSettings({ enabled: false }));
    await settle();
    expect(link()).toBeNull();
    setSettings(coerceSettings({}));
    await settle();
    expect(link()?.textContent).toBe('View 5 quotes');
  });
});

describe('classic X (signed in)', () => {
  it('finds the action bar X uses when signed in: data-testid buttons in a role="group"', async () => {
    document.querySelector('.bar')!.outerHTML = `<div role="group" class="group">
      <div><button data-testid="reply"></button></div><div><button data-testid="retweet"></button></div>
      <div><button data-testid="like"></button></div><div><button data-testid="bookmark"></button></div><div><button></button></div></div>`;
    await settle();
    expect(link()?.parentElement?.className).toBe('group');
    expect(link()?.textContent).toBe('View 5 quotes');
  });
});

describe('helpers', () => {
  it('formats counts like X and finds the post a page is about', () => {
    expect(quoteLabel(4229)).toBe('View 4.2K quotes');
    expect(quoteLabel(null)).toBe('View quotes');
    expect(quoteLabel(0)).toBe('View quotes');
    expect(postPageId(`/maya_writes/status/${ID}`)).toBe(ID);
    expect(postPageId(`/maya_writes/status/${ID}/quotes`)).toBeNull();
    expect(postPageId('/home')).toBeNull();
  });
});
