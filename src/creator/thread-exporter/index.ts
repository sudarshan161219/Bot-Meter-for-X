// Thread Exporter: on a post page that's part of a thread (the author replied
// to themselves), adds an "Export" button to the first post's action bar.

import type { TweetCache } from '../cache';
import type { CoreHelpers } from '../core';
import { fail, isDisabled } from '../log';
import { pagePosts } from '../page';
import type { Tweet } from '../types';
import { openExportModal } from './modal';
import { assembleThread, isThread, type Thread } from './thread';

const FEATURE = 'thread-exporter';

export interface ExporterDeps {
  cache: TweetCache;
  helpers: CoreHelpers;
  /** Called (debounced) on page changes. */
  onPageChange(fn: () => void): void;
  openPrint(tweets: Tweet[], quoted: Tweet[]): Promise<boolean>;
}

const focalId = (): string | null => location.pathname.match(/^\/[A-Za-z0-9_]{1,15}\/status\/(\d+)/)?.[1] ?? null;

export function startThreadExporter({ cache, helpers, onPageChange, openPrint }: ExporterDeps): void {
  const currentThread = (): Thread | null => {
    const id = focalId();
    return id ? assembleThread(id, cache.tweets) : null;
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  const soon = (): void => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      run();
    }, 200);
  };
  onPageChange(run);
  cache.subscribe(soon);

  function run(): void {
    if (isDisabled(FEATURE)) return;
    try {
      const thread = currentThread();
      let target: Element | null = null;
      if (isThread(thread)) {
        const posts = pagePosts(helpers);
        // The thread's first post when it's on the page, else the post being viewed.
        target = posts.find((p) => p.id === thread.tweets[0]?.id)?.article ?? posts.find((p) => p.id === focalId())?.article ?? null;
      }
      sync(target);
    } catch (error) {
      if (!fail(FEATURE, error)) sync(null);
    }
  }

  function sync(article: Element | null): void {
    const existing = document.querySelectorAll('.ctx-export');
    for (const el of existing) if (el.closest('article') !== article) el.remove();
    if (!article || article.querySelector('.ctx-export')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ctx-export';
    button.textContent = 'Export';
    button.title = 'Export this thread (Creator Tools)';
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void openExportModal({
        getThread: currentThread,
        quoted: (id) => cache.tweets.peek(id),
        onChange: (fn) => cache.subscribe(fn),
        openPrint,
      }).catch((error: unknown) => fail(FEATURE, error));
    });

    // X's action bar (reply, repost, like, bookmark, share) is marked with
    // data-engagement-action; without it, put the button at the end of the post.
    const like = [...article.querySelectorAll('[data-engagement-action="like"]')].find((el) => el.closest('article') === article);
    const bar = like?.parentElement;
    if (bar) bar.append(button);
    else article.append(button);
  }
}
