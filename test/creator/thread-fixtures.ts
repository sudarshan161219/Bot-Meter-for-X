// Small synthetic threads for the Thread Exporter tests.
import { TweetCache } from '../../src/creator/cache';
import type { Tweet } from '../../src/creator/types';

let clock = Date.parse('2026-09-25T10:00:00Z');

export function post(id: string, text: string, extra: Partial<Tweet> = {}): Tweet {
  clock += 60_000;
  return {
    id,
    authorId: '11',
    authorHandle: 'maya_writes',
    authorName: 'Maya Chen',
    authorAvatar: 'https://pbs.twimg.com/profile_images/1/a_normal.jpg',
    verified: true,
    text,
    createdAt: clock,
    media: [],
    conversationId: null,
    metrics: { likes: 0, reposts: 0, replies: 0, quotes: 0, views: null, bookmarks: null },
    urls: [],
    source: 'graphql',
    ...extra,
  };
}

export const cacheOf = (...tweets: Tweet[]): TweetCache => {
  const cache = new TweetCache();
  cache.putTweets(tweets);
  return cache;
};
