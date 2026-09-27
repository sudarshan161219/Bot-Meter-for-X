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

const all = { homeTimeline, xwebTimeline, legacyUserByScreenName, initialState };
if (typeof module !== 'undefined') module.exports = all;
else globalThis.BotMeterFixtures = all;
