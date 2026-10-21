// Quote link: on some posts X doesn't show how many times the post was
// quoted, or link to its quotes, though it still sends the count and still
// serves the list at /<user>/status/<id>/quotes. On a post's page this adds a
// "View 60 quotes" pill to the post's action bar that opens that list, where Bot
// Meter's badges then show which quoting accounts look automated.
// It's an ordinary link: X's own page loads the list when the reader clicks.

import type { TweetCache } from '../cache';
import type { BotMeterCore } from '../core';
import { fail, isDisabled } from '../log';
import { actionBar, pagePosts } from '../page';
import type { CreatorSettings } from '../settings';

const FEATURE = 'quotes';
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** "View 1 quote", "View 60 quotes", "View 4.2K quotes"; "View quotes" when there's no count to show. */
export function quoteLabel(count: number | null): string {
  if (!count) return 'View quotes';
  return `View ${compact.format(count)} ${count === 1 ? 'quote' : 'quotes'}`;
}

/** The post a /<user>/status/<id> page is about, unless it's already the quotes list. */
export function postPageId(pathname: string): string | null {
  const m = pathname.match(/^\/[A-Za-z0-9_]{1,15}\/status\/(\d+)\/?$/);
  return m?.[1] ?? null;
}

const nextFrame: (fn: () => void) => void =
  typeof requestAnimationFrame === 'function' ? (fn) => requestAnimationFrame(fn) : (fn) => setTimeout(fn, 16);

export function startQuoteLink(
  core: BotMeterCore,
  cache: TweetCache,
  watch: (fn: (settings: CreatorSettings) => void) => void
): void {
  let settings: CreatorSettings | null = null;
  let queued = false; // one write per animation frame
  watch((next) => {
    settings = next;
    run();
  });
  core.onScan(run);
  // The count arrives with X's data, sometimes after the post is drawn.
  cache.subscribe(() => {
    if (postPageId(location.pathname)) run();
  });

  function run(): void {
    if (queued || !settings || isDisabled(FEATURE)) return;
    queued = true;
    nextFrame(() => {
      queued = false;
      try {
        sync();
      } catch (error) {
        if (!fail(FEATURE, error)) for (const el of document.querySelectorAll('.bm-quotes')) el.remove();
      }
    });
  }

  function sync(): void {
    const id = settings?.enabled && settings.showQuotes ? postPageId(location.pathname) : null;
    const post = id ? pagePosts(core).find((p) => p.id === id) : undefined;
    const bar = post ? actionBar(post.article) : null;
    const tweet = id ? cache.tweets.peek(id) : undefined;
    // Only X's data has the count; a page-only copy doesn't. The link is shown
    // either way: a missing count reads as 0, so hiding at 0 could hide real quotes.
    const count = tweet?.source === 'graphql' ? tweet.metrics.quotes : null;

    let keep: Element | null = null;
    if (post && bar) {
      let link = bar.querySelector<HTMLAnchorElement>(':scope > .bm-quotes');
      if (!link) {
        link = document.createElement('a');
        link.className = 'bm-quotes';
        bar.append(link);
      }
      const href = `/${post.handle}/status/${post.id}/quotes`;
      if (link.getAttribute('href') !== href) link.setAttribute('href', href);
      const text = quoteLabel(count);
      if (link.textContent !== text) link.textContent = text;
      const title = 'See who quoted this post (Bot Meter)';
      if (link.title !== title) link.title = title;
      keep = link;
    }
    for (const el of document.querySelectorAll('.bm-quotes')) if (el !== keep) el.remove();
  }
}
