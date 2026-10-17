// Creator Tools, extension (content-script) world. Loaded after Bot Meter's
// content.js, in the same world, so it can reuse BotMeterCore.
//
// - Captures: inject.js already posts every response it sees; with the Creator
//   parser loaded, those messages carry normalized `tweets` and `authors`.
// - DOM fallback: after each core page scan, posts that never arrived as data
//   are read from the page (partial, marked source: 'dom').
// - Reply Filter: flags, collapses or hides low-effort replies on post pages.

import { readArticle } from '../capture/dom-fallback';
import { coerceCapture } from '../capture/validate';
import { getCore } from '../core';
import { fail, isDisabled, warnOnce } from '../log';
import { startReplyFilter } from '../reply-filter';
import { watchSettings } from '../settings';
import { isObj } from '../util';
import { cache } from './store';

const SOURCE = 'bot-meter-x';

// Two lines in the regular console (any context) so it's easy to confirm capture is running.
console.info('[BotMeter:Creator] loaded; waiting for posts…');
let announced = false;
cache.subscribe(() => {
  if (announced) return;
  announced = true;
  console.info(
    '[BotMeter:Creator] capturing posts. To inspect: pick the "Bot Meter for X" context in this console, then run botMeterCreator.cache.tweets.size'
  );
});

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.source !== window || isDisabled('capture')) return;
  const data = event.data;
  if (!isObj(data) || data.source !== SOURCE || data.type !== 'users') return;
  try {
    const { tweets, authors } = coerceCapture(data);
    if (authors.length) cache.putAuthors(authors);
    if (tweets.length) cache.putTweets(tweets);
  } catch (error) {
    fail('capture', error);
  }
});

const core = getCore();
if (!core) {
  warnOnce('no-core', "Bot Meter's core API wasn't found; the page fallback is off.");
} else {
  // Articles already handled, so each scan only reads new ones.
  const seen = new WeakSet<Element>();
  core.onScan(() => {
    if (isDisabled('dom-fallback')) return;
    try {
      const found = [];
      for (const article of document.querySelectorAll('article')) {
        if (seen.has(article)) continue;
        const tweet = readArticle(article, core);
        if (!tweet) continue; // still rendering; try again next scan
        seen.add(article);
        if (!cache.tweets.has(tweet.id)) found.push(tweet);
      }
      if (found.length) cache.putTweets(found);
    } catch (error) {
      fail('dom-fallback', error);
    }
  });
  startReplyFilter(core, cache, watchSettings);
}

// For manual checks: in DevTools, pick the "Bot Meter for X" context in the
// console's context menu and inspect botMeterCreator.cache.
(globalThis as { botMeterCreator?: unknown }).botMeterCreator = { cache };
