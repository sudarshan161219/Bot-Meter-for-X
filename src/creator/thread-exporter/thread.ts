// Builds an author's thread (their chain of replies to themselves) from the
// posts captured so far. Pure: works on any id -> Tweet lookup.

import type { Tweet } from '../types';

export interface TweetSource {
  peek(id: string): Tweet | undefined;
  values(): Iterable<Tweet>;
}

export interface Thread {
  /** The thread's posts in order, first post first. */
  tweets: Tweet[];
  /**
   * The first post replies to a post that hasn't been loaded, so the thread may
   * start earlier (open the first post to load it).
   */
  missingStart: boolean;
}

const byTime = (a: Tweet, b: Tweet): number =>
  (a.createdAt ?? 0) - (b.createdAt ?? 0) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1);

/**
 * The thread `id` belongs to: walk up through the same author's posts to the
 * first one, then down through the author's replies to themselves (the earliest
 * one at each step, as X shows it). Returns null if `id` isn't loaded.
 */
export function assembleThread(id: string, source: TweetSource): Thread | null {
  const start = source.peek(id);
  if (!start) return null;
  const sameAuthor = (t: Tweet): boolean =>
    t.authorId !== '0' && start.authorId !== '0'
      ? t.authorId === start.authorId
      : t.authorHandle.toLowerCase() === start.authorHandle.toLowerCase();

  // Up: to the first post of the author's chain.
  let first = start;
  let missingStart = false;
  const visited = new Set([first.id]);
  while (first.inReplyToId) {
    const parent = source.peek(first.inReplyToId);
    if (!parent) {
      missingStart = true; // could be the author's own earlier post, not loaded yet
      break;
    }
    if (!sameAuthor(parent) || visited.has(parent.id)) break;
    visited.add(parent.id);
    first = parent;
  }

  // Down: the author's replies to each post.
  const children = new Map<string, Tweet[]>();
  for (const t of source.values()) {
    if (!t.inReplyToId || !sameAuthor(t)) continue;
    const list = children.get(t.inReplyToId);
    if (list) list.push(t);
    else children.set(t.inReplyToId, [t]);
  }
  const tweets = [first];
  const inThread = new Set([first.id]);
  for (let cur = first; ; ) {
    const next = children.get(cur.id)?.filter((t) => !inThread.has(t.id)).sort(byTime)[0];
    if (!next) break;
    tweets.push(next);
    inThread.add(next.id);
    cur = next;
  }
  return { tweets, missingStart };
}

/** A thread worth exporting: at least two posts by the same author. */
export const isThread = (thread: Thread | null): thread is Thread => !!thread && thread.tweets.length >= 2;
