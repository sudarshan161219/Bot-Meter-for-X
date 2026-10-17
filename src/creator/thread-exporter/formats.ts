// Text exports of a thread: Markdown (with frontmatter) and a plain "unrolled"
// copy for the clipboard. Pure functions.

import type { Tweet } from '../types';

export const postUrl = (t: Pick<Tweet, 'authorHandle' | 'id'>): string => `https://x.com/${t.authorHandle}/status/${t.id}`;

/** First line of the first post, trimmed to a title-sized length. */
export function threadTitle(tweets: readonly Tweet[]): string {
  const line = (tweets[0]?.text ?? '').split('\n').find((l) => l.trim())?.trim() ?? '';
  const chars = Array.from(line);
  return chars.length > 80 ? `${chars.slice(0, 79).join('').trimEnd()}…` : line || 'Thread';
}

const isoDate = (ms: number | null): string | null => (ms == null ? null : new Date(ms).toISOString().slice(0, 10));

const yamlString = (s: string): string => JSON.stringify(s);

// Keep posts as written, but stop lines that start with "#", ">", "-" or "1."
// from turning into headings, quotes or lists, and "<" from being read as HTML.
// Inline characters (_, *) are left alone so URLs stay intact.
const escapeMarkdown = (text: string): string =>
  text
    .split('\n')
    .map((line) => line.replace(/^(\s*)([#>]|[-*+](?=\s))/, '$1\\$2').replace(/^(\s*\d+)\.(?=\s)/, '$1\\.'))
    .join('\n')
    .replace(/</g, '&lt;');

const quoteBlock = (lines: string): string =>
  lines
    .split('\n')
    .map((l) => (l ? `> ${l}` : '>'))
    .join('\n');

export interface ExportOptions {
  /** Looks up quoted posts (they're captured as their own posts). */
  quoted?: (id: string) => Tweet | undefined;
}

export function toMarkdown(tweets: readonly Tweet[], options: ExportOptions = {}): string {
  const first = tweets[0];
  if (!first) return '';
  const date = isoDate(first.createdAt);
  const front = [
    '---',
    `title: ${yamlString(threadTitle(tweets))}`,
    `author: ${yamlString(`${first.authorName} (@${first.authorHandle})`)}`,
    ...(date ? [`date: ${date}`] : []),
    `source: ${postUrl(first)}`,
    `posts: ${tweets.length}`,
    '---',
  ];
  const body = tweets.map((t) => {
    const parts = [escapeMarkdown(t.text)];
    for (const m of t.media) {
      const alt = (m.alt ?? (m.type === 'photo' ? 'Image' : m.type === 'gif' ? 'GIF' : 'Video')).replace(/[[\]\s]+/g, ' ').trim();
      parts.push(m.type === 'photo' ? `![${alt}](${m.url})` : `[${alt}](${m.videoUrl ?? m.url})`);
    }
    const q = t.quoted ? options.quoted?.(t.quoted) : undefined;
    if (q) parts.push(quoteBlock(`**${escapeMarkdown(q.authorName)}** (@${q.authorHandle}):\n${escapeMarkdown(q.text)}\n${postUrl(q)}`));
    else if (t.quoted) parts.push(quoteBlock(`Quoted post: https://x.com/i/status/${t.quoted}`));
    return parts.filter(Boolean).join('\n\n');
  });
  return `${front.join('\n')}\n\n${body.join('\n\n')}\n`;
}

/** Plain text, numbered when there's more than one post, with the source link at the end. */
export function toPlainText(tweets: readonly Tweet[], options: ExportOptions = {}): string {
  const first = tweets[0];
  if (!first) return '';
  const n = tweets.length;
  const posts = tweets.map((t, i) => {
    const lines = [n > 1 ? `${i + 1}/${n} ${t.text}` : t.text];
    for (const m of t.media) lines.push(`[${m.type}: ${m.type === 'photo' ? m.url : (m.videoUrl ?? m.url)}]`);
    const q = t.quoted ? options.quoted?.(t.quoted) : undefined;
    if (q) lines.push(`> @${q.authorHandle}: ${q.text.replace(/\n/g, ' ')}`);
    return lines.join('\n');
  });
  const date = isoDate(first.createdAt);
  return `${posts.join('\n\n')}\n\n— ${first.authorName} (@${first.authorHandle})${date ? `, ${date}` : ''}\n${postUrl(first)}\n`;
}

/** A file-name-safe slug: "nasa-2103610284464316469". */
export const fileStem = (tweets: readonly Tweet[]): string => {
  const first = tweets[0];
  return first ? `${first.authorHandle.toLowerCase()}-${first.id}` : 'thread';
};
