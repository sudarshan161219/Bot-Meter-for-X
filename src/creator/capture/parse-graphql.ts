// Pure parsers: any X response (or server-rendered data) -> normalized Tweets
// and Authors. Shape-based, not operation-name-based, like Bot Meter's own
// collector in inject.js, because X renames operations and moves fields often.
//
// Handles both of X's formats:
//  - 2026 "x-web" client: details.full_text / created_at_ms, counts.*, views.count,
//    media_entities2, url_entities, reply_to_results, quoted_tweet_results,
//    user core / avatar / relationship_counts / profile_bio.
//  - Older GraphQL: legacy.full_text / created_at / favorite_count / entities /
//    extended_entities, conversation_id_str, in_reply_to_status_id_str, note_tweet.

import type { Author, Capture, Media, MediaType, Tweet } from '../types';
import { arr, get, isObj, num, parseDate, snowflakeTime, str, type Obj } from '../util';

/** Unwraps { result: … } and TweetWithVisibilityResults { tweet: … }. */
export function unwrapTweet(x: unknown): Obj | null {
  let t: unknown = isObj(x) && 'result' in x ? x.result : x;
  if (isObj(t) && isObj(t.tweet)) t = t.tweet;
  return isObj(t) ? t : null;
}

const unwrapUser = (x: unknown): Obj | null => {
  const u: unknown = isObj(x) && 'result' in x ? x.result : x;
  return isObj(u) ? u : null;
};

export function parseAuthor(node: Obj): Author | null {
  if (node.__typename !== 'User') return null;
  const core = node.core;
  const legacy = node.legacy;
  const id = str(node.rest_id) ?? str(node.id_str);
  const handle = str(get(core, 'screen_name')) ?? str(get(legacy, 'screen_name'));
  if (!id || !handle) return null;
  const author: Author = {
    id,
    handle,
    name: str(get(core, 'name')) ?? str(get(legacy, 'name')) ?? '',
    avatar: str(get(node, 'avatar', 'image_url')) ?? str(get(legacy, 'profile_image_url_https')),
    followers: num(get(node, 'relationship_counts', 'followers')) ?? num(get(legacy, 'followers_count')),
    following: num(get(node, 'relationship_counts', 'following')) ?? num(get(legacy, 'friends_count')),
    createdAt:
      num(get(core, 'created_at_ms')) ??
      parseDate(str(get(core, 'created_at')) ?? str(get(legacy, 'created_at'))) ??
      snowflakeTime(id),
    verified: get(node, 'verification', 'is_blue_verified') === true || node.is_blue_verified === true,
    bio: str(get(node, 'profile_bio', 'description')) ?? str(get(legacy, 'description')),
  };
  // Only in signed-in responses.
  const follows = get(node, 'relationship_perspectives', 'following') ?? get(legacy, 'following');
  if (typeof follows === 'boolean') author.followedByViewer = follows;
  return author;
}

const MEDIA_TYPES: Record<string, MediaType> = { photo: 'photo', video: 'video', animated_gif: 'gif' };

function parseMedia(item: unknown): Media | null {
  if (!isObj(item)) return null;
  const type = MEDIA_TYPES[str(item.type) ?? ''];
  const url = str(item.media_url_https);
  if (!type || !url) return null;
  let videoUrl: string | null = null;
  let bestBitrate = -1;
  for (const v of arr(get(item, 'video_info', 'variants'))) {
    const bitrate = num(get(v, 'bitrate')) ?? 0;
    const vurl = str(get(v, 'url'));
    if (vurl && str(get(v, 'content_type')) === 'video/mp4' && bitrate > bestBitrate) {
      bestBitrate = bitrate;
      videoUrl = vurl;
    }
  }
  return {
    type,
    url,
    videoUrl,
    alt: str(item.ext_alt_text),
    width: num(get(item, 'original_info', 'width')),
    height: num(get(item, 'original_info', 'height')),
  };
}

export function parseTweet(node: Obj): Tweet | null {
  if (node.__typename !== 'Tweet') return null;
  const id = str(node.rest_id);
  const legacy = node.legacy;
  const details = node.details;
  // A repost wrapper; its original is captured on its own.
  if (get(legacy, 'retweeted_status_results') || get(legacy, 'retweeted_status_result')) return null;
  const authorNode = unwrapUser(get(node, 'core', 'user_results'));
  const author = authorNode ? parseAuthor(authorNode) : null;
  if (!id || !author) return null;

  const counts = node.counts;
  const inReplyToId = str(get(node, 'reply_to_results', 'rest_id')) ?? str(get(legacy, 'in_reply_to_status_id_str'));
  const quotedId = unwrapTweet(node.quoted_tweet_results ?? node.quoted_status_result)?.rest_id;
  const mediaList = arr(node.media_entities2 ?? get(legacy, 'extended_entities', 'media') ?? get(legacy, 'entities', 'media'));
  const urlList = arr(node.url_entities ?? get(legacy, 'entities', 'urls'));

  const tweet: Tweet = {
    id,
    authorId: author.id,
    authorHandle: author.handle,
    authorName: author.name,
    authorAvatar: author.avatar,
    verified: author.verified,
    text:
      str(get(node, 'note_tweet', 'note_tweet_results', 'result', 'text')) ??
      str(get(details, 'full_text')) ??
      str(get(legacy, 'full_text')) ??
      '',
    createdAt: num(get(details, 'created_at_ms')) ?? parseDate(str(get(legacy, 'created_at'))) ?? snowflakeTime(id),
    media: mediaList.map(parseMedia).filter((m): m is Media => m !== null),
    conversationId: str(get(legacy, 'conversation_id_str')) ?? (inReplyToId ? null : id),
    metrics: {
      likes: num(get(counts, 'favorite_count')) ?? num(get(legacy, 'favorite_count')) ?? 0,
      reposts: num(get(counts, 'retweet_count')) ?? num(get(legacy, 'retweet_count')) ?? 0,
      replies: num(get(counts, 'reply_count')) ?? num(get(legacy, 'reply_count')) ?? 0,
      quotes: num(get(counts, 'quote_count')) ?? num(get(legacy, 'quote_count')) ?? 0,
      views: num(get(node, 'views', 'count')),
      bookmarks: num(get(counts, 'bookmark_count')) ?? num(get(legacy, 'bookmark_count')),
    },
    urls: urlList.map((u) => str(get(u, 'expanded_url'))).filter((u): u is string => u !== null),
    source: 'graphql',
  };
  if (inReplyToId) tweet.inReplyToId = inReplyToId;
  if (typeof quotedId === 'string') tweet.quoted = quotedId;
  return tweet;
}

/** Walks any value and returns every post and account found in it. Never throws. */
export function parseGraphQL(root: unknown): Capture {
  const tweets = new Map<string, Tweet>();
  const authors = new Map<string, Author>();
  const seen = new Set<object>();
  const stack: unknown[] = [root];
  try {
    while (stack.length) {
      const node = stack.pop();
      if (typeof node !== 'object' || node === null || seen.has(node)) continue;
      seen.add(node);
      if (!Array.isArray(node)) {
        const tweet = parseTweet(node as Obj);
        // The same post can appear twice (e.g. as a quote and on its own); keep the fuller one.
        if (tweet && (!tweets.has(tweet.id) || (tweets.get(tweet.id)?.text ?? '') === '')) tweets.set(tweet.id, tweet);
        const author = parseAuthor(node as Obj);
        if (author) {
          const known = authors.get(author.id);
          authors.set(author.id, known ? { ...known, ...withoutNulls(author) } : author);
        }
      }
      for (const key in node) {
        let child: unknown;
        try {
          child = (node as Obj)[key];
        } catch {
          continue;
        }
        if (typeof child === 'object' && child !== null) stack.push(child);
      }
    }
  } catch {
    // Unknown shapes must never break the page; return what was parsed so far.
  }
  return { tweets: [...tweets.values()], authors: [...authors.values()] };
}

// Keeps known values when the same account appears with fewer fields elsewhere.
function withoutNulls(a: Author): Partial<Author> {
  const out: Partial<Author> = {};
  for (const [k, v] of Object.entries(a) as [keyof Author, Author[keyof Author]][]) {
    if (v !== null) Object.assign(out, { [k]: v });
  }
  return out;
}
