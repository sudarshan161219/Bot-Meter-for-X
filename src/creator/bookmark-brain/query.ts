// Filtering and sorting the saved bookmarks. Pure.

import type { Tweet } from '../types';
import type { Bookmark } from './model';

export interface Filters {
  /** Lowercased handle, or '' for everyone. */
  author: string;
  /** Inclusive dates as yyyy-mm-dd (posted date), or ''. */
  from: string;
  to: string;
  hasMedia: boolean;
  hasLinks: boolean;
  minLikes: number;
  /** Bookmarks must have every one of these tags. */
  tags: string[];
  untagged: boolean;
}

export const NO_FILTERS: Filters = { author: '', from: '', to: '', hasMedia: false, hasLinks: false, minLikes: 0, tags: [], untagged: false };

export type SortKey = 'relevance' | 'bookmarked' | 'posted' | 'engagement';

/** Likes, plus reposts, replies, quotes and bookmarks weighted as stronger signals. */
export const engagement = (t: Tweet): number =>
  t.metrics.likes + 2 * t.metrics.reposts + t.metrics.replies + 2 * t.metrics.quotes + (t.metrics.bookmarks ?? 0);

// Date filters are calendar days in the reader's time zone.
const dayStart = (ymd: string): number => new Date(`${ymd}T00:00:00`).getTime();

export function applyFilters(list: readonly Bookmark[], f: Filters, matches: ReadonlySet<string> | null = null): Bookmark[] {
  const from = f.from ? dayStart(f.from) : -Infinity;
  const to = f.to ? dayStart(f.to) + 24 * 60 * 60 * 1000 : Infinity;
  return list.filter((b) => {
    const t = b.tweet;
    if (matches && !matches.has(b.id)) return false;
    if (f.author && t.authorHandle.toLowerCase() !== f.author) return false;
    if ((f.from || f.to) && (t.createdAt == null || t.createdAt < from || t.createdAt >= to)) return false;
    if (f.hasMedia && !t.media.length) return false;
    if (f.hasLinks && !t.urls.length) return false;
    if (f.minLikes > 0 && t.metrics.likes < f.minLikes) return false;
    if (f.untagged && b.tags.length) return false;
    return f.tags.every((tag) => b.tags.includes(tag));
  });
}

/** `rank` orders search results by relevance (best first). */
export function sortBookmarks(list: readonly Bookmark[], key: SortKey, rank: ReadonlyMap<string, number> | null = null): Bookmark[] {
  const out = [...list];
  if (key === 'relevance' && rank) out.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
  else if (key === 'posted') out.sort((a, b) => (b.tweet.createdAt ?? 0) - (a.tweet.createdAt ?? 0));
  else if (key === 'engagement') out.sort((a, b) => engagement(b.tweet) - engagement(a.tweet));
  else out.sort((a, b) => b.order - a.order);
  return out;
}

export interface Count {
  key: string;
  label: string;
  count: number;
}

export function authorCounts(list: readonly Bookmark[]): Count[] {
  const map = new Map<string, Count>();
  for (const { tweet } of list) {
    const key = tweet.authorHandle.toLowerCase();
    const c = map.get(key);
    if (c) c.count++;
    else map.set(key, { key, label: `${tweet.authorName || tweet.authorHandle} (@${tweet.authorHandle})`, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function tagCounts(list: readonly Bookmark[]): Count[] {
  const map = new Map<string, number>();
  for (const b of list) for (const t of b.tags) map.set(t, (map.get(t) ?? 0) + 1);
  return [...map].map(([key, count]) => ({ key, label: key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
