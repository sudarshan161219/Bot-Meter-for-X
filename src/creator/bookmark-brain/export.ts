// Bookmark exports (JSON for moving machines, CSV for spreadsheets, Markdown
// grouped by tag) and JSON import. Pure.

import { postUrl } from '../thread-exporter/formats';
import { arr, isObj } from '../util';
import { type Bookmark, coerceBookmark } from './model';

const FORMAT = 'bookmark-brain';
const VERSION = 1;

export function toJSON(list: readonly Bookmark[], now = Date.now()): string {
  return JSON.stringify({ format: FORMAT, version: VERSION, exportedAt: new Date(now).toISOString(), bookmarks: list }, null, 2);
}

/** Reads a Bookmark Brain JSON export; invalid entries are skipped. Throws if the file isn't one. */
export function parseImport(text: string): { bookmarks: Bookmark[]; skipped: number } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file isn't valid JSON.");
  }
  if (!isObj(data) || data.format !== FORMAT) throw new Error("This isn't a Bookmark Brain export.");
  if (typeof data.version !== 'number' || data.version > VERSION) {
    throw new Error('This export comes from a newer version of Creator Tools. Update the extension first.');
  }
  const raw = arr(data.bookmarks);
  const bookmarks = raw.map(coerceBookmark).filter((b): b is Bookmark => b !== null);
  return { bookmarks, skipped: raw.length - bookmarks.length };
}

const isoDate = (ms: number | null): string => (ms == null ? '' : new Date(ms).toISOString().slice(0, 10));

/** A CSV cell: quoted, and safe to open in a spreadsheet (no formulas). */
function cell(value: string | number | null): string {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCSV(list: readonly Bookmark[]): string {
  const header = ['url', 'author_handle', 'author_name', 'posted', 'saved', 'text', 'likes', 'reposts', 'replies', 'views', 'tags', 'note', 'links', 'media'];
  const rows = list.map(({ tweet: t, tags, note, capturedAt }) =>
    [
      postUrl(t),
      t.authorHandle,
      t.authorName,
      isoDate(t.createdAt),
      isoDate(capturedAt),
      t.text,
      t.metrics.likes,
      t.metrics.reposts,
      t.metrics.replies,
      t.metrics.views,
      tags.join(' '),
      note,
      t.urls.join(' '),
      t.media.map((m) => m.url).join(' '),
    ]
      .map(cell)
      .join(',')
  );
  // BOM so spreadsheet apps read it as UTF-8.
  return `﻿${[header.join(','), ...rows].join('\r\n')}\r\n`;
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

function markdownItem(b: Bookmark): string {
  const t = b.tweet;
  const text = oneLine(t.text).replace(/</g, '&lt;');
  const date = isoDate(t.createdAt);
  let line = `- [@${t.authorHandle}](${postUrl(t)})${date ? ` (${date})` : ''}: ${text || '(media)'}`;
  if (b.note.trim()) line += `\n  - Note: ${oneLine(b.note).replace(/</g, '&lt;')}`;
  return line;
}

/** Markdown with one section per tag (a bookmark with several tags appears in each), untagged last. */
export function toMarkdownByTag(list: readonly Bookmark[], now = Date.now()): string {
  const byTag = new Map<string, Bookmark[]>();
  const untagged: Bookmark[] = [];
  for (const b of list) {
    if (!b.tags.length) untagged.push(b);
    for (const tag of b.tags) {
      const group = byTag.get(tag);
      if (group) group.push(b);
      else byTag.set(tag, [b]);
    }
  }
  const sections = [...byTag.keys()].sort().map((tag) => `## ${tag}\n\n${(byTag.get(tag) ?? []).map(markdownItem).join('\n')}`);
  if (untagged.length) sections.push(`## Untagged\n\n${untagged.map(markdownItem).join('\n')}`);
  return `# Bookmarks\n\nExported ${isoDate(now)} · ${list.length} bookmark${list.length === 1 ? '' : 's'}\n\n${sections.join('\n\n')}\n`;
}
