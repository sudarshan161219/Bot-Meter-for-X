import { describe, expect, it } from 'vitest';
import { parseAuthor, parseGraphQL } from '../../src/creator/capture/parse-graphql';
import { replayPage } from './replay';

const NASA_POST = '2103610284464316469';

describe('parseGraphQL on real x.com pages (2026 client)', () => {
  it('reads a post page (TweetDetail): the post, its metrics, media and links', () => {
    const { tweets, authors } = parseGraphQL(replayPage('status-NASA.html'));
    const post = tweets.find((t) => t.id === NASA_POST);
    expect(post).toBeDefined();
    expect(post).toMatchObject({
      authorHandle: 'NASA',
      authorName: 'NASA',
      authorId: '11348282',
      verified: true,
      conversationId: NASA_POST,
      source: 'graphql',
      createdAt: 1790374749000,
    });
    expect(post?.text).toMatch(/^With @BoeingSpace, we’ll provide an update on Starliner/);
    expect(post?.metrics).toMatchObject({ likes: 4229, reposts: 549, replies: 199, quotes: 60, bookmarks: 158 });
    expect(post?.metrics.views).toBeGreaterThan(0);
    expect(post?.media[0]).toMatchObject({ type: 'photo', url: 'https://pbs.twimg.com/media/HTGGPVlWUAAeapm.jpg' });
    expect(post?.media[0]?.alt).toMatch(/Starliner/);
    expect(post?.urls).toContain('https://go.nasa.gov/4AA9Ii5');
    expect(post?.authorAvatar).toMatch(/^https:\/\/pbs\.twimg\.com\/profile_images\//);

    const nasa = authors.find((a) => a.handle === 'NASA');
    expect(nasa).toMatchObject({ id: '11348282', following: 115, verified: true });
    expect(nasa?.followers).toBeGreaterThan(90_000_000);
  });

  it('links replies to the post they answer; their conversation is resolved later', () => {
    const { tweets } = parseGraphQL(replayPage('status-NASA.html'));
    const replies = tweets.filter((t) => t.inReplyToId === NASA_POST);
    expect(replies).toHaveLength(3);
    for (const reply of replies) {
      expect(reply.conversationId).toBeNull();
      expect(reply.text.length).toBeGreaterThan(0);
      expect(reply.createdAt).toBeGreaterThan(Date.parse('2026-01-01'));
    }
  });

  it('reads a profile timeline (UserOriginalsTimeline)', () => {
    const { tweets } = parseGraphQL(replayPage('profile-NASA.html'));
    const nasaPosts = tweets.filter((t) => t.authorHandle === 'NASA');
    expect(nasaPosts.length).toBeGreaterThanOrEqual(5);
    for (const t of nasaPosts) {
      expect(t.id).toMatch(/^\d+$/);
      expect(t.metrics.likes).toBeGreaterThan(0);
    }
  });
});

// Older GraphQL format (fields under legacy), plus wrappers and edge cases.
const oldAuthor = {
  __typename: 'User',
  rest_id: '44196397',
  legacy: {
    screen_name: 'old_style',
    name: 'Old Style',
    created_at: 'Tue Jun 02 20:12:29 +0000 2009',
    followers_count: 10,
    friends_count: 20,
    description: 'bio here',
    profile_image_url_https: 'https://pbs.twimg.com/profile_images/1/a.jpg',
  },
};
const oldTweet = (id: string, extra: Record<string, unknown> = {}, legacy: Record<string, unknown> = {}) => ({
  __typename: 'Tweet',
  rest_id: id,
  core: { user_results: { result: oldAuthor } },
  legacy: {
    full_text: `text ${id}`,
    created_at: 'Wed Oct 10 20:19:24 +0000 2018',
    favorite_count: 5,
    retweet_count: 2,
    reply_count: 1,
    quote_count: 0,
    conversation_id_str: '100',
    entities: { urls: [{ expanded_url: 'https://example.com/a' }] },
    ...legacy,
  },
  ...extra,
});

describe('parseGraphQL on the older format and edge cases', () => {
  it('reads legacy fields, conversation IDs, videos and long-form text', () => {
    const response = {
      data: {
        threaded_conversation_with_injections_v2: {
          instructions: [
            {
              entries: [
                { content: { itemContent: { tweet_results: { result: oldTweet('100') } } } },
                {
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: oldTweet(
                          '101',
                          { note_tweet: { note_tweet_results: { result: { text: 'the full long text' } } } },
                          {
                            in_reply_to_status_id_str: '100',
                            extended_entities: {
                              media: [
                                {
                                  type: 'video',
                                  media_url_https: 'https://pbs.twimg.com/poster.jpg',
                                  video_info: {
                                    variants: [
                                      { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/a.m3u8' },
                                      { content_type: 'video/mp4', bitrate: 256000, url: 'https://video.twimg.com/low.mp4' },
                                      { content_type: 'video/mp4', bitrate: 2176000, url: 'https://video.twimg.com/high.mp4' },
                                    ],
                                  },
                                },
                              ],
                            },
                          }
                        ),
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    };
    const { tweets, authors } = parseGraphQL(response);
    const root = tweets.find((t) => t.id === '100');
    const reply = tweets.find((t) => t.id === '101');
    expect(root).toMatchObject({ conversationId: '100', text: 'text 100', urls: ['https://example.com/a'] });
    expect(root?.metrics).toMatchObject({ likes: 5, reposts: 2, replies: 1 });
    expect(root?.createdAt).toBe(Date.parse('Wed Oct 10 20:19:24 +0000 2018'));
    expect(reply).toMatchObject({ inReplyToId: '100', conversationId: '100', text: 'the full long text' });
    expect(reply?.media[0]).toMatchObject({ type: 'video', videoUrl: 'https://video.twimg.com/high.mp4' });
    expect(authors[0]).toMatchObject({ handle: 'old_style', bio: 'bio here', followers: 10 });
  });

  it('skips repost wrappers but keeps the original and quoted posts', () => {
    const original = oldTweet('200');
    const quotedInner = oldTweet('300');
    const response = [
      oldTweet('199', {}, { retweeted_status_result: { result: original } }),
      oldTweet('201', { quoted_status_result: { result: { __typename: 'TweetWithVisibilityResults', tweet: quotedInner } } }),
    ];
    const ids = parseGraphQL(response).tweets.map((t) => t.id).sort();
    expect(ids).toEqual(['200', '201', '300']);
    expect(parseGraphQL(response).tweets.find((t) => t.id === '201')?.quoted).toBe('300');
  });

  it('never throws on junk or cyclic input', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    for (const junk of [null, undefined, 42, 'x', [], {}, cyclic, { __typename: 'Tweet' }, { __typename: 'User', core: {} }]) {
      expect(parseGraphQL(junk)).toEqual({ tweets: [], authors: [] });
    }
  });
});

describe('parseAuthor', () => {
  const user = { __typename: 'User', rest_id: '11348282', core: { screen_name: 'NASA', name: 'NASA' } };

  it('records whether the viewer follows the account, only when X says', () => {
    expect(parseAuthor({ ...user, relationship_perspectives: { following: true } })?.followedByViewer).toBe(true);
    expect(parseAuthor({ ...user, legacy: { following: false } })?.followedByViewer).toBe(false);
    expect(parseAuthor(user)).not.toHaveProperty('followedByViewer'); // signed out: unknown
  });
});
