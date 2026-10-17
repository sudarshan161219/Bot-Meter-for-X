// Creator Tools for X, extension (content-script) world. Receives the posts the
// page hook captured, keeps them in the shared cache, and runs the features.
import { TweetCache } from '../cache';
import { readArticle } from '../capture/dom-fallback';
import { coerceCapture } from '../capture/validate';
import { fail, isDisabled } from '../log';
import { onPageChange, pageHelpers } from '../page';
import { startThreadExporter } from '../thread-exporter';
import type { Tweet } from '../types';
import { isObj } from '../util';
import { PAGE_SOURCE, type OpenPrintMessage } from './protocol';

const cache = new TweetCache();

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.source !== window || isDisabled('capture')) return;
  const data = event.data;
  if (!isObj(data) || data.source !== PAGE_SOURCE || data.type !== 'capture') return;
  try {
    const { tweets, authors } = coerceCapture(data);
    if (authors.length) cache.putAuthors(authors);
    if (tweets.length) cache.putTweets(tweets);
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

startThreadExporter({
  cache,
  helpers: pageHelpers,
  onPageChange: (fn) => {
    listeners.add(fn);
    schedule();
  },
  async openPrint(tweets, quoted) {
    const message: OpenPrintMessage = { type: 'open-print', tweets, quoted };
    try {
      const reply: unknown = await chrome.runtime.sendMessage(message);
      return isObj(reply) && reply.ok === true;
    } catch (error) {
      fail('thread-exporter', error);
      return false;
    }
  },
});

// For manual checks in DevTools (pick the "Creator Tools for X" console context).
(globalThis as { creatorTools?: unknown }).creatorTools = { cache };
