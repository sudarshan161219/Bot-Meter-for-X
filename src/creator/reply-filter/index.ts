// Reply Filter on post pages (/<user>/status/<id>): judges each reply below the
// post with the rules in ./rules.ts and Bot Meter's posts-per-day score, then
// flags, collapses or hides it. Runs after each of Bot Meter's page scans; reads
// the page there and writes in the next animation frame, only where something
// changed, so its own writes settle instead of re-triggering scans.

import type { TweetCache } from '../cache';
import { readArticle } from '../capture/dom-fallback';
import type { BotMeterCore } from '../core';
import { allowed } from '../entitlements';
import { fail, isDisabled } from '../log';
import type { CreatorSettings } from '../settings';
import { isExempt, judgeReply, parseList, RepeatIndex, verdictLabel, type Verdict } from './rules';

const FEATURE = 'reply-filter';

type Action = 'flag' | 'collapse' | 'hide';

interface Item {
  article: Element;
  /** Where the flag goes: after this element (and after Bot Meter's own badge, if any). */
  anchor: Element;
  id: string;
  handle: string;
  verdict: Verdict;
  action: Action;
}

interface Plan {
  focal: Element;
  items: Item[];
  filtered: number;
  total: number;
  canReveal: boolean;
  showAll: boolean;
  badgeOnly: boolean;
}

// One conversation's state, kept while the reader stays on the same post page.
interface Conversation {
  focalId: string;
  repeats: RepeatIndex;
  /** Every reply seen here (X only keeps the visible ones on the page) -> filtered? */
  seen: Map<string, boolean>;
  revealed: Set<string>;
  showAll: boolean;
}

const nextFrame: (fn: () => void) => void =
  typeof requestAnimationFrame === 'function' ? (fn) => requestAnimationFrame(fn) : (fn) => setTimeout(fn, 16);

const stop = (e: Event): void => {
  e.preventDefault();
  e.stopPropagation();
};

export function startReplyFilter(
  core: BotMeterCore,
  cache: TweetCache,
  watch: (fn: (settings: CreatorSettings) => void) => void
): void {
  let settings: CreatorSettings | null = null;
  let conversation: Conversation | null = null;
  let pending: Plan | null = null;
  let frameQueued = false;
  let cacheTimer: ReturnType<typeof setTimeout> | null = null;

  watch((next) => {
    settings = next;
    run();
  });
  core.onScan(run);
  // Post data sometimes lands after the replies are drawn; judge again with it.
  cache.subscribe(() => {
    if (cacheTimer || !conversation) return;
    cacheTimer = setTimeout(() => {
      cacheTimer = null;
      run();
    }, 150);
  });

  function run(): void {
    if (!settings || isDisabled(FEATURE)) return;
    try {
      write(plan(settings));
    } catch (error) {
      // After repeated errors the feature turns itself off: undo what it changed.
      if (!fail(FEATURE, error)) write(null);
    }
  }

  function write(next: Plan | null): void {
    pending = next;
    if (frameQueued) return;
    frameQueued = true;
    nextFrame(() => {
      frameQueued = false;
      try {
        apply(pending);
      } catch (error) {
        fail(FEATURE, error);
      }
    });
  }

  function plan(s: CreatorSettings): Plan | null {
    const focalId = location.pathname.match(/\/status\/(\d+)/)?.[1];
    if (!s.enabled || !s.replyFilter || !focalId) {
      conversation = null;
      return null;
    }
    if (conversation?.focalId !== focalId) {
      conversation = { focalId, repeats: new RepeatIndex(), seen: new Map(), revealed: new Set(), showAll: false };
    }
    const convo = conversation;

    // Top-level posts in page order, with their author link and ID.
    const posts: { article: Element; link: Element; handle: string; id: string }[] = [];
    for (const article of document.querySelectorAll('article')) {
      if (article.parentElement?.closest('article')) continue; // a quoted post
      for (const link of article.querySelectorAll('a[href^="/"]')) {
        if (link.closest('article') !== article) continue;
        const handle = core.authorHandle(link);
        if (!handle) continue;
        const id = core.postId(article, handle);
        if (id) posts.push({ article, link, handle, id });
        break;
      }
    }
    const focalIndex = posts.findIndex((p) => p.id === focalId);
    const focal = posts[focalIndex];
    if (!focal) return null; // the post itself hasn't rendered yet

    const threadAuthors = [focal.handle];
    const rootAuthor = cache.tweets.peek(cache.rootOf(focalId))?.authorHandle;
    if (rootAuthor) threadAuthors.push(rootAuthor);
    const allowlist = parseList(s.replyFilterAllow);
    const muted = parseList(s.replyFilterMuted);

    // Replies are the posts below the one being viewed. Skip any that X's data
    // says aren't replies (the "Discover more" posts at the end).
    const replies = [];
    for (const post of posts.slice(focalIndex + 1)) {
      const tweet = cache.tweets.peek(post.id);
      if (tweet?.source === 'graphql' && !tweet.inReplyToId) continue;
      const text = tweet?.text ?? readArticle(post.article, core)?.text ?? '';
      const followedByViewer = tweet ? cache.authors.peek(tweet.authorId)?.followedByViewer : undefined;
      const exempt = isExempt({
        handle: post.handle,
        threadAuthors,
        allowlist,
        ...(followedByViewer !== undefined && { followedByViewer }),
      });
      if (!exempt) convo.repeats.add(post.handle, text);
      replies.push({ ...post, text, urls: tweet?.urls ?? [], exempt });
    }

    const items: Item[] = [];
    for (const r of replies) {
      if (r.exempt) {
        convo.seen.set(r.id, false);
        continue;
      }
      const found = core.lookup(r.handle);
      const verdict = judgeReply(
        {
          text: r.text,
          urls: r.urls,
          level: found?.stats.level ?? null,
          rate: found?.stats.rate ?? null,
          repeats: convo.repeats.othersWith(r.handle, r.text),
        },
        s.replyFilterSensitivity,
        muted
      );
      convo.seen.set(r.id, verdict.filtered);
      if (!verdict.filtered) continue;

      let action: Action = 'flag';
      const shown = convo.showAll || convo.revealed.has(r.id);
      // Bot Meter already collapsed or blurred it (bot or adult rules): don't stack a second notice.
      const coreHid = r.article.classList.contains('bm-collapsed') || r.article.classList.contains('bm-blur');
      if (!shown && !coreHid && s.replyFilterMode !== 'badge') {
        action = s.replyFilterMode === 'hide' && allowed('replyFilterHide') ? 'hide' : 'collapse';
      }
      items.push({ article: r.article, anchor: core.badgeAnchor(r.link), id: r.id, handle: r.handle, verdict, action });
    }

    let filtered = 0;
    for (const f of convo.seen.values()) if (f) filtered++;
    return {
      focal: focal.article,
      items,
      filtered,
      total: convo.seen.size,
      canReveal: s.replyFilterMode !== 'badge',
      showAll: convo.showAll,
      badgeOnly: s.replyFilterMode === 'badge',
    };
  }

  // --- page writes (idempotent: only touch what differs) ---

  function apply(p: Plan | null): void {
    const flags = new Set<Element>();
    const notices = new Set<Element>();
    const collapsed = new Set<Element>();
    const hidden = new Set<Element>();
    let counter: Element | null = null;

    for (const item of p?.items ?? []) {
      if (!item.article.isConnected) continue;
      flags.add(syncFlag(item));
      if (item.action === 'collapse') {
        collapsed.add(item.article);
        notices.add(syncNotice(item));
      } else if (item.action === 'hide') {
        hidden.add(item.article);
      }
    }
    if (p && p.total > 0 && p.focal.isConnected) counter = syncCounter(p);

    for (const el of document.querySelectorAll('.bmc-flag')) if (!flags.has(el)) el.remove();
    for (const el of document.querySelectorAll('.bmc-notice')) if (!notices.has(el)) el.remove();
    for (const el of document.querySelectorAll('.bmc-counter')) if (el !== counter) el.remove();
    for (const el of document.querySelectorAll('.bmc-collapsed')) if (!collapsed.has(el)) el.classList.remove('bmc-collapsed');
    for (const el of document.querySelectorAll('.bmc-hidden')) if (!hidden.has(el)) el.classList.remove('bmc-hidden');
    for (const el of collapsed) if (!el.classList.contains('bmc-collapsed')) el.classList.add('bmc-collapsed');
    for (const el of hidden) if (!el.classList.contains('bmc-hidden')) el.classList.add('bmc-hidden');
  }

  function describe(item: Item): string {
    return ['Reply Filter:', ...item.verdict.signals.map((s) => `• ${s.detail}`)].join('\n');
  }

  function syncFlag(item: Item): Element {
    // After Bot Meter's badge when there is one, so the core keeps finding its badge right after the anchor.
    let after = item.anchor;
    if (after.nextElementSibling?.classList.contains('bm-badge')) after = after.nextElementSibling;
    let flag = after.nextElementSibling?.classList.contains('bmc-flag') ? after.nextElementSibling : null;
    if (!flag) {
      flag = document.createElement('span');
      flag.addEventListener('click', stop);
      after.after(flag);
    }
    const label = verdictLabel(item.verdict);
    const className = `bmc-flag${label === 'likely bot' || label === 'muted keyword' ? ' bmc-strong' : ''}`;
    if (flag.className !== className) flag.className = className;
    if (flag.textContent !== label) flag.textContent = label;
    const title = describe(item);
    if ((flag as HTMLElement).title !== title) (flag as HTMLElement).title = title;
    return flag;
  }

  function syncNotice(item: Item): Element {
    const { article } = item;
    // Bot Meter may have put its own notice right before the post; ours goes before that.
    let notice: Element | null = null;
    for (let el = article.previousElementSibling, i = 0; el && i < 2; el = el.previousElementSibling, i++) {
      if (el.classList.contains('bmc-notice')) notice = el;
    }
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'bmc-notice';
      notice.append(document.createElement('span'));
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Show';
      button.addEventListener('click', (e) => {
        stop(e);
        const id = (e.currentTarget as HTMLElement).closest<HTMLElement>('.bmc-notice')?.dataset.id;
        if (id) conversation?.revealed.add(id);
        run();
      });
      notice.append(button);
      article.parentElement?.insertBefore(notice, article);
    }
    const text = `Hidden reply from @${item.handle}: ${verdictLabel(item.verdict)}.`;
    const span = notice.firstElementChild;
    if (span && span.textContent !== text) span.textContent = text;
    const el = notice as HTMLElement;
    const title = describe(item);
    if (el.title !== title) el.title = title;
    if (el.dataset.id !== item.id) el.dataset.id = item.id;
    return notice;
  }

  function syncCounter(p: Plan): Element {
    let counter = p.focal.nextElementSibling?.classList.contains('bmc-counter') ? p.focal.nextElementSibling : null;
    if (!counter) {
      counter = document.createElement('div');
      counter.className = 'bmc-counter';
      counter.append(document.createElement('span'));
      const button = document.createElement('button');
      button.type = 'button';
      button.addEventListener('click', (e) => {
        stop(e);
        if (conversation) conversation.showAll = !conversation.showAll;
        run();
      });
      counter.append(button);
      p.focal.after(counter);
    }
    const verb = p.badgeOnly ? 'Flagged' : 'Filtered';
    const text = `Reply Filter: ${verb} ${p.filtered.toLocaleString('en-US')} of ${p.total.toLocaleString('en-US')} replies`;
    const span = counter.firstElementChild;
    if (span && span.textContent !== text) span.textContent = text;
    const el = counter as HTMLElement;
    const title = 'Counts the replies loaded so far. Scroll down to load more.';
    if (el.title !== title) el.title = title;
    const button = counter.querySelector('button');
    if (button) {
      const show = p.canReveal && p.filtered > 0;
      if (button.hidden === show) button.hidden = !show;
      const label = p.showAll ? 'Filter again' : 'Show all';
      if (button.textContent !== label) button.textContent = label;
    }
    return counter;
  }
}
