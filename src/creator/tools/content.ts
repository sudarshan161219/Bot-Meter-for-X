// Creator Tools for X, extension (content-script) world. Receives the posts the
// page hook captured, keeps them in the shared cache, and runs the features.
import { startBookmarkBrain } from '../bookmark-brain/capture';
import { TweetCache } from '../cache';
import { readArticle } from '../capture/dom-fallback';
import { coerceCapture } from '../capture/validate';
import { fail, isDisabled } from '../log';
import { onPageChange, pageHelpers } from '../page';
import { startThreadExporter } from '../thread-exporter';
import type { Tweet } from '../types';
import { arr, isObj, num, str } from '../util';
import { PAGE_SOURCE, type OpenPrintMessage, type SaveBookmarksMessage } from './protocol';

const cache = new TweetCache();

/** Sends a message to the service worker; null if it fails (e.g. the extension was just updated). */
async function ask(message: object): Promise<Record<string, unknown> | null> {
  try {
    const reply: unknown = await chrome.runtime.sendMessage(message);
    return isObj(reply) && reply.ok === true ? reply : null;
  } catch {
    return null;
  }
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.source !== window || isDisabled('capture')) return;
  const data = event.data;
  if (!isObj(data) || data.source !== PAGE_SOURCE || data.type !== 'capture') return;
  try {
    const { tweets, authors } = coerceCapture(data);
    if (authors.length) cache.putAuthors(authors);
    if (tweets.length) cache.putTweets(tweets);
    const ids = arr(data.bookmarks).map(str).filter((id): id is string => id !== null && /^\d{1,20}$/.test(id));
    if (ids.length) bookmarks.fromResponse(ids);
  } catch (error) {
    fail('capture', error);
  }
});

const listeners = new Set<() => void>();
const schedule = onPageChange(() => {
  // Page fallback: posts that never arrived as data.
  if (!isDisabled('dom-fallback')) {
    try {
      const found: Tweet[] = [];
      for (const article of document.querySelectorAll('article')) {
        const tweet = readArticle(article, pageHelpers);
        if (tweet && !cache.tweets.has(tweet.id)) found.push(tweet);
      }
      if (found.length) cache.putTweets(found);
    } catch (error) {
      fail('dom-fallback', error);
    }
  }
  for (const fn of listeners) fn();
});

const onPageChangeHook = (fn: () => void): void => {
  listeners.add(fn);
  schedule();
};

startThreadExporter({
  cache,
  helpers: pageHelpers,
  onPageChange: onPageChangeHook,
  async openPrint(tweets, quoted) {
    const message: OpenPrintMessage = { type: 'open-print', tweets, quoted };
    return (await ask(message)) !== null;
  },
});

const bookmarks = startBookmarkBrain({
  cache,
  helpers: pageHelpers,
  onPageChange: onPageChangeHook,
  async save(items) {
    const message: SaveBookmarksMessage = { type: 'bookmarks:save', items };
    return num((await ask(message))?.total);
  },
  async count() {
    return num((await ask({ type: 'bookmarks:count' }))?.total);
  },
  openApp() {
    void ask({ type: 'open-bookmarks' });
  },
});

// For manual checks in DevTools (pick the "Creator Tools for X" console context).
(globalThis as { creatorTools?: unknown }).creatorTools = { cache };
