// In-memory LRU cache of posts and accounts, shared by every Creator Tools
// feature in the content script. Nothing here is persisted.

import type { Author, Tweet } from './types';

export class LRU<K, V> {
  private readonly map = new Map<K, V>();
  constructor(private readonly max: number) {}

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      // Refresh recency.
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  /** Read without touching recency (for scans over many entries). */
  peek(key: K): V | undefined {
    return this.map.get(key);
  }

  set(key: K, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next();
      if (!oldest.done) this.map.delete(oldest.value);
    }
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  get size(): number {
    return this.map.size;
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }
}

export class TweetCache {
  readonly tweets: LRU<string, Tweet>;
  readonly authors: LRU<string, Author>;
  private readonly listeners = new Set<(tweets: Tweet[]) => void>();

  constructor(maxTweets = 5000, maxAuthors = 5000) {
    this.tweets = new LRU(maxTweets);
    this.authors = new LRU(maxAuthors);
  }

  /** Adds or updates posts. GraphQL data always beats a DOM-fallback copy. */
  putTweets(tweets: readonly Tweet[]): void {
    const changed: Tweet[] = [];
    for (const tweet of tweets) {
      const known = this.tweets.peek(tweet.id);
      if (known && known.source === 'graphql' && tweet.source === 'dom') continue;
      this.tweets.set(tweet.id, tweet);
      changed.push(tweet);
    }
    if (changed.length) for (const fn of this.listeners) fn(changed);
  }

  putAuthors(authors: readonly Author[]): void {
    for (const author of authors) this.authors.set(author.id, author);
  }

  get(id: string): Tweet | undefined {
    return this.tweets.get(id);
  }

  /** Called with each batch of new or updated posts; returns an unsubscribe function. */
  subscribe(fn: (tweets: Tweet[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * The conversation's first post, found by following inReplyToId through the
   * cache (X's 2026 client doesn't send a conversation ID). Returns the furthest
   * ancestor known if the chain isn't fully loaded.
   */
  rootOf(id: string): string {
    let current = id;
    const visited = new Set<string>([id]);
    for (;;) {
      const tweet = this.tweets.peek(current);
      if (!tweet) return current; // not loaded: the furthest ancestor we know of
      if (tweet.conversationId) return tweet.conversationId; // older format sends it
      const parent = tweet.inReplyToId;
      if (!parent || visited.has(parent)) return current; // not a reply: this is the root
      visited.add(parent);
      current = parent;
    }
  }
}
