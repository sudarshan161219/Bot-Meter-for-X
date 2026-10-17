// @vitest-environment jsdom
// The Reply Filter on a post page, running with the real Bot Meter core
// (settings.js, stats.js, content.js) in jsdom, as in the extension.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { TweetCache } from '../../src/creator/cache';
import { getCore } from '../../src/creator/core';
import { startReplyFilter } from '../../src/creator/reply-filter';
import { coerceSettings, type CreatorSettings } from '../../src/creator/settings';
import type { Tweet } from '../../src/creator/types';

const FOCAL = '1900000000000000000';
let setSettings: (s: CreatorSettings) => void = () => {};
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 250));

const post = (handle: string, id: string, text: string): string => `
  <div class="cell"><article>
    <div><a href="/${handle}">${handle} name</a> <span><a href="/${handle}">@${handle}</a></span>
      <a href="/${handle}/status/${id}">1h</a></div>
    <div dir="auto">${text}</div>
  </article></div>`;

const page = (): string => `<main>
  ${post('nasa', FOCAL, 'Artemis update: the heat shield test is done.')}
  ${post('fan1', '1900000000000000001', 'Great post! 🔥')}
  ${post('thinker', '1900000000000000002', 'How does this change the reentry profile for crewed flights?')}
  ${post('spambot', '1900000000000000003', 'Interesting results from the team today')}
  ${post('nasa', '1900000000000000004', 'this')}
  ${post('promo', '1900000000000000005', 'Join us t.me/pumpgroup')}
  ${post('other', '1900000000000000006', 'great post')}
</main>`;

const flags = (): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const flag of document.querySelectorAll('.bmc-flag')) {
    const handle = flag.closest('article')?.querySelector('a[href^="/"]')?.getAttribute('href')?.slice(1) ?? '?';
    out[handle] = flag.textContent ?? '';
  }
  return out;
};
const articleOf = (handle: string): Element => {
  const a = document.querySelector(`a[href="/${handle}"]`)?.closest('article');
  if (!a) throw new Error(`no post by ${handle}`);
  return a;
};
const counter = (): string => document.querySelector('.bmc-counter span')?.textContent ?? '';

beforeAll(async () => {
  (globalThis as { chrome?: unknown }).chrome = {
    storage: { sync: { get: (_d: unknown, cb: (v: object) => void) => cb({}) }, onChanged: { addListener() {} } },
  };
  for (const file of ['settings.js', 'stats.js', 'content.js']) {
    new Function(readFileSync(join(import.meta.dirname, '..', '..', 'src', file), 'utf8'))();
  }
  const core = getCore();
  if (!core) throw new Error('BotMeterCore not exposed by content.js');

  history.pushState({}, '', `/nasa/status/${FOCAL}`);
  document.body.innerHTML = page();
  // Bot Meter's account data for @spambot: 400 posts a day.
  const day = 24 * 60 * 60 * 1000;
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window,
      data: {
        source: 'bot-meter-x',
        type: 'users',
        users: [{ screenName: 'spambot', statuses: 40000, createdAt: new Date(Date.now() - 100 * day).toUTCString() }],
      },
    })
  );

  // X's data says the last post isn't a reply (a "Discover more" post).
  const cache = new TweetCache();
  const discover: Tweet = {
    id: '1900000000000000006',
    authorId: '6',
    authorHandle: 'other',
    authorName: 'Other',
    authorAvatar: null,
    verified: false,
    text: 'great post',
    createdAt: null,
    media: [],
    conversationId: '1900000000000000006',
    metrics: { likes: 0, reposts: 0, replies: 0, quotes: 0, views: null, bookmarks: null },
    urls: [],
    source: 'graphql',
  };
  cache.putTweets([discover]);

  startReplyFilter(core, cache, (fn) => {
    setSettings = fn;
    fn(coerceSettings({}));
  });
  await settle();
});

describe('Reply Filter on a post page', () => {
  it('badge mode flags low-effort, promotion and bot replies, and counts them', () => {
    expect(flags()).toEqual({ fan1: 'low effort', spambot: 'likely bot', promo: 'promotion' });
    expect(counter()).toBe('Reply Filter: Flagged 3 of 5 replies');
    // Next to Bot Meter's own badge, not instead of it.
    const bot = articleOf('spambot');
    expect(bot.querySelector('.bm-badge.bm-bot + .bmc-flag')).not.toBeNull();
    expect(bot.querySelector('.bmc-flag')?.getAttribute('title')).toContain('Bot Meter: likely automated');
  });

  it('collapse mode hides them behind a one-line notice that can be undone', async () => {
    setSettings(coerceSettings({ replyFilterMode: 'collapse' }));
    await settle();
    expect(articleOf('fan1').classList.contains('bmc-collapsed')).toBe(true);
    expect(articleOf('thinker').classList.contains('bmc-collapsed')).toBe(false);
    const notices = [...document.querySelectorAll('.bmc-notice span')].map((s) => s.textContent);
    expect(notices).toEqual([
      'Hidden reply from @fan1: low effort.',
      'Hidden reply from @spambot: likely bot.',
      'Hidden reply from @promo: promotion.',
    ]);
    expect(counter()).toBe('Reply Filter: Filtered 3 of 5 replies');

    document.querySelector<HTMLButtonElement>('.bmc-notice button')?.click();
    await settle();
    expect(articleOf('fan1').classList.contains('bmc-collapsed')).toBe(false);
    expect(flags().fan1).toBe('low effort'); // still flagged once shown
    expect(document.querySelectorAll('.bmc-notice')).toHaveLength(2);

    document.querySelector<HTMLButtonElement>('.bmc-counter button')?.click();
    await settle();
    expect(document.querySelectorAll('.bmc-collapsed, .bmc-notice')).toHaveLength(0);
    expect(document.querySelector('.bmc-counter button')?.textContent).toBe('Filter again');
  });

  it('hide mode removes them with no notice', async () => {
    document.querySelector<HTMLButtonElement>('.bmc-counter button')?.click(); // filter again
    setSettings(coerceSettings({ replyFilterMode: 'hide' }));
    await settle();
    expect(document.querySelectorAll('.bmc-notice')).toHaveLength(0);
    // @fan1 was shown by hand earlier in this conversation, so it stays visible.
    expect([...document.querySelectorAll('article.bmc-hidden')].map((a) => a.querySelector('a')?.getAttribute('href'))).toEqual([
      '/spambot',
      '/promo',
    ]);
  });

  it('allowlist, muted keywords and sensitivity change the result', async () => {
    setSettings(coerceSettings({ replyFilterAllow: '@fan1, promo', replyFilterMuted: 'reentry', replyFilterSensitivity: 'lenient' }));
    await settle();
    expect(flags()).toEqual({ thinker: 'muted keyword', spambot: 'likely bot' });
  });

  it('turning it off removes everything it added', async () => {
    setSettings(coerceSettings({ replyFilter: false, replyFilterMode: 'collapse' }));
    await settle();
    expect(document.querySelectorAll('.bmc-flag, .bmc-notice, .bmc-counter, .bmc-collapsed, .bmc-hidden')).toHaveLength(0);
    expect(document.querySelector('.bm-badge.bm-bot')).not.toBeNull(); // Bot Meter itself is untouched
  });
});
