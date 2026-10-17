import { describe, expect, it, vi } from 'vitest';
import { LRU, TweetCache } from '../../src/creator/cache';
import type { Tweet } from '../../src/creator/types';

const tweet = (id: string, extra: Partial<Tweet> = {}): Tweet => ({
  id,
  authorId: '1',
  authorHandle: 'a',
  authorName: 'A',
  authorAvatar: null,
  verified: false,
  text: `t${id}`,
  createdAt: null,
  media: [],
  conversationId: null,
  metrics: { likes: 0, reposts: 0, replies: 0, quotes: 0, views: null, bookmarks: null },
  urls: [],
  source: 'graphql',
  ...extra,
});

describe('LRU', () => {
  it('evicts the least recently used entry', () => {
    const lru = new LRU<string, number>(2);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.get('a'); // a is now most recent
    lru.set('c', 3);
    expect(lru.has('a')).toBe(true);
    expect(lru.has('b')).toBe(false);
    expect(lru.size).toBe(2);
  });
});

describe('TweetCache', () => {
  it('keeps GraphQL data over a later DOM-fallback copy, and notifies on changes', () => {
    const cache = new TweetCache();
    const listener = vi.fn();
    cache.subscribe(listener);
    cache.putTweets([tweet('1', { text: 'full' })]);
    cache.putTweets([tweet('1', { text: 'from page', source: 'dom' })]);
    expect(cache.get('1')?.text).toBe('full');
    expect(listener).toHaveBeenCalledTimes(1);
    // …but a DOM copy is replaced once GraphQL data arrives.
    cache.putTweets([tweet('2', { source: 'dom' }), tweet('2', { text: 'real' })]);
    expect(cache.get('2')?.text).toBe('real');
  });

  it('resolves a conversation root by following replies', () => {
    const cache = new TweetCache();
    cache.putTweets([tweet('10', { conversationId: '10' }), tweet('11', { inReplyToId: '10' }), tweet('12', { inReplyToId: '11' })]);
    expect(cache.rootOf('12')).toBe('10');
    expect(cache.rootOf('10')).toBe('10');
  });

  it('stops at the furthest known ancestor when the chain is incomplete, and survives loops', () => {
    const cache = new TweetCache();
    cache.putTweets([tweet('21', { inReplyToId: '20' }), tweet('22', { inReplyToId: '21' })]);
    expect(cache.rootOf('22')).toBe('20');
    cache.putTweets([tweet('31', { inReplyToId: '32' }), tweet('32', { inReplyToId: '31' })]);
    expect(['31', '32']).toContain(cache.rootOf('31'));
  });
});
