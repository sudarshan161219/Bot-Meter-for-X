// A saved bookmark: the post as captured, plus the reader's own tags and note.

import { coerceTweet } from '../capture/validate';
import type { Tweet } from '../types';
import { arr, isObj, num, str } from '../util';

export interface Bookmark {
  /** The post's ID. */
  id: string;
  tweet: Tweet;
  /** When Bookmark Brain first saw it (ms). */
  capturedAt: number;
  /**
   * Approximate bookmark order, larger = bookmarked more recently. X doesn't say
   * when something was bookmarked, only lists bookmarks newest first, so this
   * comes from the capture time and the position in that list.
   */
  order: number;
  tags: string[];
  note: string;
  updatedAt: number;
}

/** A bookmark as the content script captures it. */
export interface CapturedBookmark {
  tweet: Tweet;
  order: number;
}

export const MAX_TAGS = 20;
export const MAX_NOTE = 5000;

/** "#Machine Learning " -> "machine-learning". Empty if nothing usable is left. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .slice(0, 32);
}

export const cleanTags = (tags: readonly string[]): string[] =>
  [...new Set(tags.map(normalizeTag).filter(Boolean))].slice(0, MAX_TAGS);

/** Prefer full GraphQL data over a page-only copy, then the newer capture (fresher counts). */
const betterTweet = (a: Tweet, b: Tweet): Tweet => (a.source === 'graphql' && b.source === 'dom' ? a : b);

/** Adds a captured post, or refreshes the post data of one already saved (tags, note and order are kept). */
export function mergeCaptured(existing: Bookmark | undefined, captured: CapturedBookmark, now: number): Bookmark {
  if (existing) return { ...existing, tweet: betterTweet(existing.tweet, captured.tweet), updatedAt: now };
  return { id: captured.tweet.id, tweet: captured.tweet, capturedAt: now, order: captured.order, tags: [], note: '', updatedAt: now };
}

/** Combines an imported bookmark with one already saved: union of tags, existing note wins unless empty. */
export function mergeImported(existing: Bookmark | undefined, imported: Bookmark): Bookmark {
  if (!existing) return imported;
  return {
    ...existing,
    tweet: betterTweet(imported.tweet, existing.tweet),
    capturedAt: Math.min(existing.capturedAt, imported.capturedAt),
    tags: cleanTags([...existing.tags, ...imported.tags]),
    note: existing.note.trim() ? existing.note : imported.note,
    updatedAt: Math.max(existing.updatedAt, imported.updatedAt),
  };
}

/** Untrusted input (an imported file) -> a valid Bookmark, or null. */
export function coerceBookmark(x: unknown): Bookmark | null {
  if (!isObj(x)) return null;
  const tweet = coerceTweet(x.tweet);
  if (!tweet) return null;
  const capturedAt = num(x.capturedAt) ?? Date.now();
  return {
    id: tweet.id,
    tweet,
    capturedAt,
    order: num(x.order) ?? capturedAt,
    tags: cleanTags(arr(x.tags).map((t) => str(t) ?? '')),
    note: (str(x.note) ?? '').slice(0, MAX_NOTE),
    updatedAt: num(x.updatedAt) ?? capturedAt,
  };
}
