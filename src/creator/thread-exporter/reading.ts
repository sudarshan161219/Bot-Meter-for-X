// Reading layout for the PDF export: the thread as one clean article, built
// with DOM APIs (text is never parsed as HTML). Shown in the extension's print
// page, where the browser's "Save as PDF" turns it into a PDF with selectable
// text, any script or emoji, and images.

import type { Tweet } from '../types';
import { postUrl, threadTitle } from './formats';

const LINK = /https:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'’”]/g;

/** Appends text with its https links made clickable. */
function appendLinked(parent: HTMLElement, text: string): void {
  const doc = parent.ownerDocument;
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    const at = m.index ?? 0;
    if (at > last) parent.append(text.slice(last, at));
    const a = doc.createElement('a');
    a.href = m[0];
    a.textContent = m[0].replace(/^https:\/\/(www\.)?/, '');
    parent.append(a);
    last = at + m[0].length;
  }
  if (last < text.length) parent.append(text.slice(last));
}

function paragraphs(doc: Document, text: string): HTMLElement[] {
  return text
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => {
      const el = doc.createElement('p');
      p.split('\n').forEach((line, i) => {
        if (i) el.append(doc.createElement('br'));
        appendLinked(el, line);
      });
      return el;
    });
}

export function renderReading(doc: Document, tweets: readonly Tweet[], quoted: (id: string) => Tweet | undefined): HTMLElement {
  const article = doc.createElement('article');
  const first = tweets[0];
  if (!first) return article;

  const h1 = doc.createElement('h1');
  h1.textContent = threadTitle(tweets);
  const meta = doc.createElement('p');
  meta.className = 'meta';
  const date = first.createdAt ? new Date(first.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : '';
  meta.append(`${first.authorName} (@${first.authorHandle})${date ? ` · ${date}` : ''} · `);
  const source = doc.createElement('a');
  source.href = postUrl(first);
  source.textContent = 'View on X';
  meta.append(source);
  article.append(h1, meta);

  for (const t of tweets) {
    const section = doc.createElement('section');
    section.append(...paragraphs(doc, t.text));
    for (const m of t.media) {
      if (m.type === 'photo') {
        const fig = doc.createElement('figure');
        const img = doc.createElement('img');
        img.src = m.url;
        img.alt = m.alt ?? '';
        img.referrerPolicy = 'no-referrer';
        fig.append(img);
        if (m.alt) {
          const cap = doc.createElement('figcaption');
          cap.textContent = m.alt;
          fig.append(cap);
        }
        section.append(fig);
      } else {
        const p = doc.createElement('p');
        p.className = 'media';
        const a = doc.createElement('a');
        a.href = postUrl(t);
        a.textContent = m.type === 'gif' ? 'GIF (view on X)' : 'Video (view on X)';
        p.append(a);
        section.append(p);
      }
    }
    const q = t.quoted ? quoted(t.quoted) : undefined;
    if (q) {
      const bq = doc.createElement('blockquote');
      const who = doc.createElement('strong');
      who.textContent = `${q.authorName} (@${q.authorHandle})`;
      bq.append(who, ...paragraphs(doc, q.text));
      section.append(bq);
    }
    article.append(section);
  }
  return article;
}
