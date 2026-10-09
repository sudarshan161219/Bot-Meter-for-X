// Trimmed-down copies of the shapes X's web client receives.
// Older GraphQL user (counts in legacy).
const user = (screenName, createdAt, statuses, extra = {}) => ({
  __typename: 'User',
  rest_id: '1000',
  is_blue_verified: false,
  core: { created_at: createdAt, name: screenName.toUpperCase(), screen_name: screenName },
  legacy: { followers_count: 100, friends_count: 200, statuses_count: statuses, media_count: 10, ...extra },
});

const tweetEntry = (id, author, quoted) => ({
  entryId: `tweet-${id}`,
  content: {
    entryType: 'TimelineTimelineItem',
    itemContent: {
      itemType: 'TimelineTweet',
      tweet_results: {
        result: {
          __typename: 'Tweet',
          rest_id: id,
          core: { user_results: { result: author } },
          legacy: { full_text: `post ${id}`, favorite_count: 3 },
          ...(quoted && { quoted_status_result: { result: quoted } }),
        },
      },
    },
  },
});

// Current GraphQL shape (screen_name/created_at under user.core).
const homeTimeline = {
  data: {
    home: {
      home_timeline_urt: {
        instructions: [
          {
            type: 'TimelineAddEntries',
            entries: [
              // ~66/day, the account in the Reddit screenshot
              tweetEntry('1', user('mishabot', 'Mon Mar 21 10:00:00 +0000 2022', 109671, { followers_count: 554, friends_count: 1135, media_count: 9697 })),
              // ~2/day, normal human
              tweetEntry('2', user('normal_human', 'Sat Jan 05 12:00:00 +0000 2013', 9000)),
              // ~400/day, obvious bot, quoting the normal human
              tweetEntry(
                '3',
                user('spam_machine', 'Thu Jan 01 00:00:00 +0000 2026', 107000),
                {
                  __typename: 'Tweet',
                  rest_id: '9',
                  core: { user_results: { result: user('normal_human', 'Sat Jan 05 12:00:00 +0000 2013', 9000) } },
                  legacy: { full_text: 'quoted' },
                }
              ),
            ],
          },
        ],
      },
    },
  },
};

// x-web (2026) post author: no join date, legacy is empty, counts moved out.
const xwebAuthor = (screenName, restId, tweets) => ({
  __typename: 'User',
  core: { name: screenName.toUpperCase(), screen_name: screenName },
  id: 'VXNlcjox',
  legacy: {},
  privacy: { protected: false },
  relationship_counts: { followers: 42, following: 7 },
  rest_id: restId,
  tweet_counts: { tweets },
  verification: { is_blue_verified: true, verified: false },
});

// x-web post: kind markers are reply_to_results, legacy.retweeted_status_results
// and quoted_tweet_results (field names from X's 2026 web client).
const xwebTweet = (id, author, extra = {}, legacy = {}) => ({
  __typename: 'Tweet',
  rest_id: id,
  core: { user_results: { result: author } },
  legacy: { full_text: `post ${id}`, ...legacy },
  ...extra,
});
const entry = (tweet) => ({ entryId: `tweet-${tweet.rest_id}`, content: { itemContent: { tweet_results: { result: tweet } } } });

// x-web api.x.com/graphql/<id>/HomeTimeline response.
const xwebTimeline = {
  data: {
    viewer: {
      timeline: {
        instructions: [
          {
            entries: [
              tweetEntry('20', xwebAuthor('fresh_bot', '1880000000000000000', 250000)),
              tweetEntry('21', xwebAuthor('old_timer', '11348282', 5000)),
              // @reposter reposted post 23 by @original_author.
              entry(
                xwebTweet('22', xwebAuthor('reposter', '1500000000000000000', 800), {}, {
                  retweeted_status_results: {
                    result: xwebTweet('23', xwebAuthor('original_author', '1400000000000000000', 3000)),
                  },
                })
              ),
              // A reply to post 20.
              entry(xwebTweet('24', xwebAuthor('replier', '1600000000000000000', 1200), { reply_to_results: { rest_id: '20' } })),
              // Sensitive: post 27 is flagged by X (and its author's account too);
              // post 28 only has media carrying X's adult-content warning.
              entry(
                xwebTweet('27', { ...xwebAuthor('spicy_account', '1750000000000000000', 5000), possibly_sensitive: true }, {}, {
                  possibly_sensitive: true,
                })
              ),
              entry(
                xwebTweet('28', xwebAuthor('media_poster', '1760000000000000000', 300), {
                  media_entities2: [{ type: 'photo', sensitive_media_warning: { adult_content: true } }],
                })
              ),
              // An ad: the timeline item carries promoted_metadata next to post 29.
              {
                entryId: 'promoted-tweet-29',
                content: {
                  itemContent: {
                    __typename: 'TimelineTweet',
                    tweet_results: { result: xwebTweet('29', xwebAuthor('advertiser', '1100000000000000000', 70)) },
                    promoted_metadata: { disclosure_type: 'NoDisclosure', impression_id: 'abc' },
                  },
                },
              },
              // A "Who to follow" module: user items, a header and a "Show more" footer.
              {
                entryId: 'who-to-follow-1',
                content: {
                  __typename: 'TimelineTimelineModule',
                  header: { text: 'Who to follow' },
                  footer: { landing_url: { url: '/i/connect_people?user_id=1', url_type: 'Url' } },
                  items: [
                    { entry_id: 'u1', item: { content: { __typename: 'TimelineUser', user_results: { result: xwebAuthor('suggested_one', '1200000000000000000', 10) } } } },
                    { entry_id: 'u2', item: { content: { __typename: 'TimelineUser', user_results: { result: xwebAuthor('suggested_two', '1210000000000000000', 20) } } } },
                  ],
                },
              },
              // A "What's happening" module: trend items.
              {
                entryId: 'trends-1',
                content: {
                  __typename: 'TimelineTimelineModule',
                  header: { text: 'What’s happening' },
                  footer: { landing_url: { url: 'https://x.com/explore/tabs/for-you', url_type: 'Url' } },
                  items: [{ entry_id: 't1', item: { content: { __typename: 'TimelineTrend', name: '#Starliner' } } }],
                },
              },
              // Post 25 quotes post 26 by @quoted_person (wrapped with visibility results).
              entry(
                xwebTweet('25', xwebAuthor('quoter', '1700000000000000000', 400), {
                  quoted_tweet_results: {
                    result: {
                      __typename: 'TweetWithVisibilityResults',
                      tweet: xwebTweet('26', xwebAuthor('quoted_person', '1300000000000000000', 90)),
                    },
                  },
                })
              ),
            ],
          },
        ],
      },
    },
  },
};

// Older GraphQL shape (everything in legacy).
const legacyUserByScreenName = {
  data: {
    user: {
      result: {
        __typename: 'User',
        rest_id: '12',
        legacy: {
          screen_name: 'old_schema',
          name: 'Old Schema',
          created_at: 'Tue Mar 21 20:50:14 +0000 2006',
          statuses_count: 30000,
          followers_count: 5,
          friends_count: 6,
        },
      },
    },
  },
};

// Flat REST / window.__INITIAL_STATE__ shape.
const initialState = {
  entities: {
    users: {
      entities: {
        99: { id_str: '99', screen_name: 'flat_user', name: 'Flat', created_at: 'Wed Oct 10 20:19:24 +0000 2018', statuses_count: 500 },
      },
    },
  },
};

// x-web AboutAccountQuery (the profile's "About this account" panel).
const aboutAccount = {
  data: {
    user_result_by_screen_name: {
      result: {
        __typename: 'User',
        core: { screen_name: 'fresh_bot', name: 'FRESH_BOT', created_at_ms: 1736900000000 },
        about_profile: {
          account_based_in: 'India',
          source: 'India Android App',
          username_changes: { count: '2', last_changed_at_msec: '1740787200000' },
        },
        verification: { is_blue_verified: true },
      },
    },
  },
};

const all = { homeTimeline, xwebTimeline, legacyUserByScreenName, initialState, aboutAccount };
if (typeof module !== 'undefined') module.exports = all;
else globalThis.BotMeterFixtures = all;
