// Normalized shapes shared by every Creator Tools feature. The capture layer
// turns X's GraphQL responses (or, as a fallback, the page itself) into these.

export type MediaType = 'photo' | 'video' | 'gif';

export interface Media {
  type: MediaType;
  /** Image URL (for videos and GIFs, the poster frame). */
  url: string;
  /** Best MP4 for videos and GIFs, when X sent one. */
  videoUrl: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
}

export interface Metrics {
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
  views: number | null;
  bookmarks: number | null;
}

export interface Tweet {
  id: string;
  authorId: string;
  authorHandle: string;
  authorName: string;
  authorAvatar: string | null;
  verified: boolean;
  text: string;
  /** Milliseconds since epoch. */
  createdAt: number | null;
  media: Media[];
  /** ID of the quoted post (the quoted post itself is captured as its own Tweet). */
  quoted?: string;
  inReplyToId?: string;
  /**
   * ID of the conversation's first post. X's 2026 client no longer sends it, so it
   * is known up front only for posts that aren't replies (their own ID); for
   * replies the cache resolves it by following inReplyToId.
   */
  conversationId: string | null;
  metrics: Metrics;
  /** Expanded URLs of links in the post. */
  urls: string[];
  /** Where it came from; GraphQL data wins over DOM fallback when both exist. */
  source: 'graphql' | 'dom';
}

export interface Author {
  id: string;
  handle: string;
  name: string;
  avatar: string | null;
  followers: number | null;
  following: number | null;
  /** Milliseconds since epoch, when known. */
  createdAt: number | null;
  verified: boolean;
  bio: string | null;
  /** Whether the signed-in viewer follows this account; only set when X sent it. */
  followedByViewer?: boolean;
}

export interface Capture {
  tweets: Tweet[];
  authors: Author[];
}
