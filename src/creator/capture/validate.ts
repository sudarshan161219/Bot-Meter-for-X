// The extension-side half receives captures over window.postMessage, which the
// page itself could also send. Re-check every field before anything is cached
// or stored, and drop whatever doesn't fit.

import type { Author, Capture, Media, MediaType, Metrics, Tweet } from '../types';
import { arr, isObj, num, str } from '../util';

const ID = /^\d{1,20}$/;
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const MEDIA_TYPES = new Set<MediaType>(['photo', 'video', 'gif']);
const MAX_TEXT = 30_000; // long posts ("notes") run to 25k characters
const httpsUrl = (x: unknown): string | null => {
  const s = str(x);
  return s && /^https:\/\//.test(s) && s.length < 2048 ? s : null;
};

function coerceMedia(x: unknown): Media | null {
  if (!isObj(x)) return null;
  const type = str(x.type) as MediaType | null;
  const url = httpsUrl(x.url);
  if (!type || !MEDIA_TYPES.has(type) || !url) return null;
  return { type, url, videoUrl: httpsUrl(x.videoUrl), alt: str(x.alt), width: num(x.width), height: num(x.height) };
}

function coerceMetrics(x: unknown): Metrics {
  const m = isObj(x) ? x : {};
  return {
    likes: num(m.likes) ?? 0,
    reposts: num(m.reposts) ?? 0,
    replies: num(m.replies) ?? 0,
    quotes: num(m.quotes) ?? 0,
    views: num(m.views),
    bookmarks: num(m.bookmarks),
  };
}

export function coerceTweet(x: unknown): Tweet | null {
  if (!isObj(x)) return null;
  const id = str(x.id);
  const authorId = str(x.authorId);
  const authorHandle = str(x.authorHandle);
  const text = str(x.text);
  if (!id || !ID.test(id) || !authorId || !ID.test(authorId) || !authorHandle || !HANDLE.test(authorHandle)) return null;
  if (text === null || text.length > MAX_TEXT) return null;
  const source = x.source === 'dom' ? 'dom' : 'graphql';
  const tweet: Tweet = {
    id,
    authorId,
    authorHandle,
    authorName: str(x.authorName) ?? '',
    authorAvatar: httpsUrl(x.authorAvatar),
    verified: x.verified === true,
    text,
    createdAt: num(x.createdAt),
    media: arr(x.media).slice(0, 10).map(coerceMedia).filter((m): m is Media => m !== null),
    conversationId: str(x.conversationId) !== null && ID.test(str(x.conversationId) ?? '') ? str(x.conversationId) : null,
    metrics: coerceMetrics(x.metrics),
    urls: arr(x.urls).slice(0, 20).map(httpsUrl).filter((u): u is string => u !== null),
    source,
  };
  const inReplyToId = str(x.inReplyToId);
  if (inReplyToId && ID.test(inReplyToId)) tweet.inReplyToId = inReplyToId;
  const quoted = str(x.quoted);
  if (quoted && ID.test(quoted)) tweet.quoted = quoted;
  return tweet;
}

export function coerceAuthor(x: unknown): Author | null {
  if (!isObj(x)) return null;
  const id = str(x.id);
  const handle = str(x.handle);
  if (!id || !ID.test(id) || !handle || !HANDLE.test(handle)) return null;
  const author: Author = {
    id,
    handle,
    name: str(x.name) ?? '',
    avatar: httpsUrl(x.avatar),
    followers: num(x.followers),
    following: num(x.following),
    createdAt: num(x.createdAt),
    verified: x.verified === true,
    bio: str(x.bio),
  };
  if (typeof x.followedByViewer === 'boolean') author.followedByViewer = x.followedByViewer;
  return author;
}

export function coerceCapture(x: unknown): Capture {
  if (!isObj(x)) return { tweets: [], authors: [] };
  return {
    tweets: arr(x.tweets).map(coerceTweet).filter((t): t is Tweet => t !== null),
    authors: arr(x.authors).map(coerceAuthor).filter((a): a is Author => a !== null),
  };
}
