import { describe, expect, it } from 'vitest';
import { isBookmarkResponse, isBookmarksPage, timelineTweetIds } from '../../src/creator/bookmark-brain/detect';

const user = { result: { __typename: 'User', rest_id: '7', core: { screen_name: 'someone', name: 'S' } } };
const tweet = (id: string, extra: object = {}) => ({ result: { __typename: 'Tweet', rest_id: id, core: { user_results: user }, details: { full_text: id }, ...extra } });

describe('isBookmarksPage', () => {
  it("knows X's bookmarks page at its new address (/i/history) and the old one, but not Likes", () => {
    expect(isBookmarksPage('/i/history')).toBe(true);
    expect(isBookmarksPage('/i/history/')).toBe(true);
    expect(isBookmarksPage('/i/bookmarks')).toBe(true);
    expect(isBookmarksPage('/i/bookmarks/12345')).toBe(true);
    expect(isBookmarksPage('/i/history/likes')).toBe(false);
    expect(isBookmarksPage('/home')).toBe(false);
  });
});

describe('isBookmarkResponse', () => {
  it("matches X's bookmark-list operations, and the bookmarks page's first load", () => {
    expect(isBookmarkResponse('https://x.com/i/api/graphql/abc123/Bookmarks?variables=%7B%7D', '/home')).toBe(true);
    expect(isBookmarkResponse('https://api.x.com/graphql/abc123/BookmarkSearchTimeline', '/home')).toBe(true);
    expect(isBookmarkResponse('https://api.x.com/graphql/abc123/BookmarkFolderTimeline?x=1', '/home')).toBe(true);
    expect(isBookmarkResponse('https://api.x.com/graphql/abc123/HomeTimeline', '/i/bookmarks')).toBe(false);
    expect(isBookmarkResponse(null, '/i/bookmarks')).toBe(true);
    expect(isBookmarkResponse(null, '/i/bookmarks/12345')).toBe(true);
    expect(isBookmarkResponse(null, '/i/history')).toBe(true);
    expect(isBookmarkResponse(null, '/i/history/likes')).toBe(false);
    expect(isBookmarkResponse(null, '/home')).toBe(false);
  });
});

describe('timelineTweetIds', () => {
  it('returns timeline entries in order, skipping quoted posts and unwrapping reposts', () => {
    const response = {
      data: {
        bookmark_timeline_v2: {
          timeline: {
            instructions: [
              {
                entries: [
                  { content: { itemContent: { __typename: 'TimelineTweet', tweet_results: tweet('3', { quoted_tweet_results: tweet('99') }) } } },
                  { content: { itemContent: { __typename: 'TimelineTweet', tweet_results: tweet('2') } } },
                  {
                    content: {
                      itemContent: {
                        __typename: 'TimelineTweet',
                        tweet_results: tweet('50', { legacy: { retweeted_status_results: tweet('1') } }),
                      },
                    },
                  },
                  { content: { cursorType: 'Bottom', value: 'x' } },
                ],
              },
            ],
          },
        },
      },
    };
    expect(timelineTweetIds(response)).toEqual(['3', '2', '1']);
  });

  it('handles junk and cycles', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const junk of [null, 42, 'x', [], cyclic]) expect(timelineTweetIds(junk)).toEqual([]);
  });
});
