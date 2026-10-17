// Bookmark Brain on x.com: while the reader is on their bookmarks page, saves
// every bookmark that loads (from X's bookmark responses, or from the page as a
// fallback), and offers "Sync all" to load the whole list by scrolling slowly.

import type { TweetCache } from '../cache';
import { readArticle } from '../capture/dom-fallback';
import type { CoreHelpers } from '../core';
import { fail, isDisabled } from '../log';
import { pagePosts } from '../page';
import type { Tweet } from '../types';
import type { CapturedBookmark } from './model';

const FEATURE = 'bookmark-brain';
const onBookmarksPage = (): boolean => /^\/i\/bookmarks(\/|$)/.test(location.pathname);

export interface BookmarkDeps {
  cache: TweetCache;
  helpers: CoreHelpers;
  onPageChange(fn: () => void): void;
  /** Sends a batch to the service worker; resolves to the new total, or null on failure. */
  save(items: CapturedBookmark[]): Promise<number | null>;
  count(): Promise<number | null>;
  openApp(): void;
  /** The reader's on/off switch. */
  enabled(): boolean;
}

export interface BookmarkCapture {
  /** IDs of the posts in a bookmark-list response, newest first. */
  fromResponse(ids: readonly string[]): void;
}

const SYNC_MIN_MS = 1500;
const SYNC_MAX_MS = 3000;
const SYNC_IDLE_STOPS = 3;

export function startBookmarkBrain(deps: BookmarkDeps): BookmarkCapture {
  // Per visit to the bookmarks page: each post seen so far, its list order and
  // whether only the page's partial copy has been saved for it.
  let visitStart = 0;
  let seen = new Map<string, { order: number; partial: boolean }>();
  let pending: CapturedBookmark[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let total: number | null = null;
  let panel: Panel | null = null;
  let syncing: { stop: boolean } | null = null;

  deps.onPageChange(run);

  function startVisit(): void {
    visitStart = Date.now();
    seen = new Map();
    void deps.count().then((n) => {
      total = n;
      panel?.update();
    });
  }

  /** Queues a post as a bookmark, keeping list order (first seen = most recently bookmarked). */
  function add(tweet: Tweet | undefined): void {
    if (!tweet) return;
    const known = seen.get(tweet.id);
    // Already saved, unless that was the page's partial copy and full data has arrived since.
    if (known && !(known.partial && tweet.source === 'graphql')) return;
    // Order: the visit's start time minus the position in the list, so newer
    // bookmarks (higher in the list, or seen on a later visit) sort first.
    const order = known?.order ?? visitStart - seen.size;
    seen.set(tweet.id, { order, partial: tweet.source === 'dom' });
    pending.push({ tweet, order });
    flushTimer ??= setTimeout(flush, 500);
  }

  function flush(): void {
    flushTimer = null;
    const batch = pending.splice(0, 500);
    if (pending.length) flushTimer = setTimeout(flush, 100);
    if (!batch.length) return;
    void deps.save(batch).then((n) => {
      if (n !== null) total = n;
      panel?.update();
    });
  }

  function run(): void {
    if (isDisabled(FEATURE)) return;
    try {
      if (!onBookmarksPage() || !deps.enabled()) {
        if (visitStart) {
          visitStart = 0;
          if (syncing) syncing.stop = true;
          panel?.remove();
          panel = null;
        }
        return;
      }
      if (!visitStart) startVisit();
      panel ??= createPanel();
      if (!panel.host.isConnected) document.body.append(panel.host);
      // Fallback for responses not recognized as bookmarks: every post in the
      // list on this page is one (quoted posts are nested and skipped).
      for (const post of pagePosts(deps.helpers)) {
        add(deps.cache.tweets.peek(post.id) ?? readArticle(post.article, deps.helpers) ?? undefined);
      }
      panel.update();
    } catch (error) {
      if (!fail(FEATURE, error)) {
        panel?.remove();
        panel = null;
      }
    }
  }

  // --- "Sync all": scroll slowly to the end of the list ---

  async function syncAll(): Promise<void> {
    if (syncing) return;
    const state = { stop: false };
    syncing = state;
    panel?.update();
    let idle = 0;
    while (!state.stop && idle < SYNC_IDLE_STOPS && onBookmarksPage() && deps.enabled()) {
      const before = seen.size;
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      // A randomized pause, like a person scrolling, so X has time to load more.
      await new Promise((resolve) => setTimeout(resolve, SYNC_MIN_MS + Math.random() * (SYNC_MAX_MS - SYNC_MIN_MS)));
      idle = seen.size > before ? 0 : idle + 1;
      panel?.update();
    }
    flush();
    syncing = null;
    if (panel) {
      panel.done = state.stop ? 'Stopped.' : 'Reached the end of your bookmarks.';
      panel.update();
    }
  }

  // --- floating panel (shadow DOM, so X's styles don't apply) ---

  interface Panel {
    host: HTMLElement;
    done: string;
    update(): void;
    remove(): void;
  }

  function createPanel(): Panel {
    const host = document.createElement('div');
    host.setAttribute('data-creator-tools', 'bookmarks');
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .bar { position: fixed; left: 0; right: 0; bottom: 20px; margin: 0 auto; width: max-content; z-index: 2147482000;
        display: flex; align-items: center; gap: 10px; padding: 8px 10px 8px 16px; border-radius: 999px;
        background: #0f1419; color: #fff; box-shadow: 0 4px 18px rgba(0,0,0,.3);
        font: 14px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: calc(100vw - 32px); }
      .text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      button { flex-shrink: 0; padding: 6px 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,.35);
        background: transparent; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
      button.primary { background: #fff; color: #0f1419; border-color: #fff; }
      button:hover { opacity: .85; }`;
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Bookmark Brain');
    const text = document.createElement('span');
    text.className = 'text';
    text.setAttribute('role', 'status');
    const sync = document.createElement('button');
    sync.type = 'button';
    sync.className = 'primary';
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open';
    open.title = 'Open Bookmark Brain: search, tags, notes and export';
    bar.append(text, sync, open);
    root.append(style, bar);

    const p: Panel = {
      host,
      done: '',
      update() {
        const saved = total === null ? '' : `${total.toLocaleString('en-US')} saved`;
        const label = syncing
          ? `Syncing… ${seen.size.toLocaleString('en-US')} loaded${saved ? ` · ${saved}` : ''}`
          : `Bookmark Brain${saved ? ` · ${saved}` : ''}${p.done ? ` · ${p.done}` : ''}`;
        if (text.textContent !== label) text.textContent = label;
        const button = syncing ? 'Stop' : 'Sync all';
        if (sync.textContent !== button) sync.textContent = button;
        sync.title = syncing ? 'Stop scrolling' : 'Scroll slowly through all your bookmarks so every one is saved';
      },
      remove() {
        if (syncing) syncing.stop = true;
        host.remove();
      },
    };
    sync.addEventListener('click', () => {
      if (syncing) syncing.stop = true;
      else {
        p.done = '';
        void syncAll();
      }
      p.update();
    });
    open.addEventListener('click', () => deps.openApp());
    document.body.append(host);
    return p;
  }

  return {
    fromResponse(ids) {
      if (!onBookmarksPage() || !deps.enabled() || isDisabled(FEATURE)) return;
      if (!visitStart) startVisit();
      for (const id of ids) add(deps.cache.tweets.peek(id));
    },
  };
}
