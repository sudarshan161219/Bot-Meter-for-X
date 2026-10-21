// Page helpers for the Creator Tools extension, which runs without Bot Meter's
// core. Same rules as authorHandle/postId in src/content.js (kept in step, see
// CoreHelpers in ./core.ts); inside Bot Meter, Creator code uses the core's.

import type { CoreHelpers } from './core';

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

export const pageHelpers: CoreHelpers = {
  // A link like <a href="/jack">@jack</a> that isn't an @mention inside post text.
  authorHandle(link) {
    const handle = (link.getAttribute('href') ?? '').slice(1);
    if (!HANDLE_RE.test(handle)) return null;
    if ((link.textContent ?? '').trim().toLowerCase() !== `@${handle.toLowerCase()}`) return null;
    if (link.closest('[dir="auto"]')) return null;
    return handle;
  },
  // The post's own ID, from its permalink (/<author>/status/<id>).
  postId(article, author) {
    const prefix = `/${author.toLowerCase()}/status/`;
    for (const a of article.querySelectorAll('a[href*="/status/"]')) {
      if (a.closest('article') !== article) continue;
      const href = (a.getAttribute('href') ?? '').toLowerCase();
      if (href.startsWith(prefix)) return href.slice(prefix.length).match(/^\d+/)?.[0] ?? null;
    }
    return null;
  },
};

/** The top-level posts on the page, in order, with their author and ID. */
export function pagePosts(helpers: CoreHelpers): { article: Element; link: Element; handle: string; id: string }[] {
  const posts = [];
  for (const article of document.querySelectorAll('article')) {
    if (article.parentElement?.closest('article')) continue; // a quoted post
    for (const link of article.querySelectorAll('a[href^="/"]')) {
      if (link.closest('article') !== article) continue;
      const handle = helpers.authorHandle(link);
      if (!handle) continue;
      const id = helpers.postId(article, handle);
      if (id) posts.push({ article, link, handle, id });
      break;
    }
  }
  return posts;
}

/** Calls `fn` (debounced) whenever the page changes; returns a function that runs it soon. */
export function onPageChange(fn: () => void, delay = 150): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = (): void => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, delay);
  };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  schedule();
  return schedule;
}

/**
 * A post's action bar (reply, repost, like, bookmark, share). X serves two
 * versions of its web app: the new one (seen signed out) marks actions with
 * data-engagement-action inside a plain row; the classic one (seen signed in)
 * uses data-testid buttons inside a div[role="group"].
 */
export function actionBar(article: Element): Element | null {
  const own = (el: Element): boolean => el.closest('article') === article;
  const marked = [...article.querySelectorAll('[data-engagement-action="like"]')].find(own);
  if (marked) return marked.parentElement;
  const like = [...article.querySelectorAll('[data-testid="like"], [data-testid="unlike"]')].find(own);
  const group = like?.closest('[role="group"]');
  return group && own(group) ? group : null;
}
