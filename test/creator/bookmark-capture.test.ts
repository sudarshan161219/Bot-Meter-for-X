// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startBookmarkBrain, type BookmarkCapture } from '../../src/creator/bookmark-brain/capture';
import type { CapturedBookmark } from '../../src/creator/bookmark-brain/model';
import { TweetCache } from '../../src/creator/cache';
import { pageHelpers } from '../../src/creator/page';
import { post } from './thread-fixtures';

const article = (handle: string, id: string, text: string): string =>
  `<div><article><a href="/${handle}">Name</a> <a href="/${handle}">@${handle}</a> <a href="/${handle}/status/${id}">1h</a>
   <div dir="auto">${text}</div></article></div>`;

let cache: TweetCache;
let capture: BookmarkCapture;
let rerun: () => void = () => {};
const saved: CapturedBookmark[][] = [];
const panelText = (): string => document.querySelector('[data-creator-tools="bookmarks"]')?.shadowRoot?.querySelector('.text')?.textContent ?? '';
const panelButton = (): HTMLButtonElement | null | undefined =>
  document.querySelector('[data-creator-tools="bookmarks"]')?.shadowRoot?.querySelector<HTMLButtonElement>('button.primary');

beforeAll(() => {
  vi.useFakeTimers({ now: 1_000_000 });
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  history.pushState({}, '', '/i/bookmarks');
  document.body.innerHTML = `<main>${article('maya_writes', '1', 'from data')}${article('maya_writes', '2', 'only on the page')}</main>`;
  cache = new TweetCache();
  cache.putTweets([post('1', 'from data'), post('3', 'third')]);
  capture = startBookmarkBrain({
    cache,
    helpers: pageHelpers,
    onPageChange: (fn) => {
      rerun = fn;
      fn();
    },
    save: async (items) => {
      saved.push(items);
      return 40 + saved.flat().length;
    },
    count: async () => 40,
    openApp: () => {},
  });
});
afterAll(() => {
  vi.useRealTimers();
});

describe('Bookmark Brain capture on x.com/i/bookmarks', () => {
  it('saves the posts in the list, in order, with full data when there is some', async () => {
    await vi.advanceTimersByTimeAsync(600);
    expect(saved[0]?.map((i) => [i.tweet.id, i.tweet.source, i.order])).toEqual([
      ['1', 'graphql', 1_000_000],
      ['2', 'dom', 999_999],
    ]);
    expect(panelText()).toBe('Bookmark Brain · 42 saved');
  });

  it("adds bookmarks from X's responses, and upgrades a page-only copy when its data arrives", async () => {
    cache.putTweets([post('2', 'full text now')]);
    capture.fromResponse(['3', '2', '1']);
    await vi.advanceTimersByTimeAsync(600);
    expect(saved[1]?.map((i) => [i.tweet.id, i.tweet.source, i.order])).toEqual([
      ['3', 'graphql', 999_998],
      ['2', 'graphql', 999_999], // same place in the list as before
    ]);
  });

  it('"Sync all" scrolls until nothing new loads three times in a row, then stops', async () => {
    panelButton()?.click();
    expect(panelText()).toMatch(/^Syncing… 3 loaded/);
    expect(panelButton()?.textContent).toBe('Stop');
    await vi.advanceTimersByTimeAsync(3 * 3000 + 100);
    expect(panelText()).toMatch(/Reached the end of your bookmarks\.$/);
    expect(panelButton()?.textContent).toBe('Sync all');
  });

  it('removes its panel when the reader leaves the bookmarks page', () => {
    history.pushState({}, '', '/home');
    rerun();
    expect(document.querySelector('[data-creator-tools="bookmarks"]')).toBeNull();
  });
});
