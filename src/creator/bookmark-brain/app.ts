// The Bookmark Brain page (bookmarks.html): search, filter, tag, annotate and
// export saved bookmarks. Everything runs on this device; the data lives in
// this extension's IndexedDB.

import { allowed } from '../entitlements';
import { appendLinked } from '../thread-exporter/reading';
import { postUrl } from '../thread-exporter/formats';
import { BookmarkDB, deleteAll, importBookmarks, updateBookmark } from './db';
import { parseImport, toCSV, toJSON, toMarkdownByTag } from './export';
import type { Bookmark } from './model';
import { applyFilters, authorCounts, type Filters, NO_FILTERS, type SortKey, sortBookmarks, tagCounts } from './query';
import { BookmarkSearch } from './search';
import { DEFAULT_RULES, formatRules, parseRules, suggestTags, type TagRule } from './tags';

const PAGE = 100;
const RULES_KEY = 'tagRules';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { dataset?: Record<string, string> } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const { dataset, ...rest } = props;
  const node = document.createElement(tag);
  Object.assign(node, rest);
  if (dataset) Object.assign(node.dataset, dataset);
  node.append(...children);
  return node;
}

const fmt = (n: number): string => n.toLocaleString('en-US');
const shortDate = (ms: number | null): string =>
  ms == null ? '' : new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

function download(text: string, type: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function startApp(db = new BookmarkDB()): Promise<void> {
  const extras = allowed('bookmarkExtras');
  const search = new BookmarkSearch();
  let all: Bookmark[] = [];
  let rules: readonly TagRule[] = DEFAULT_RULES;
  let filters: Filters = { ...NO_FILTERS, tags: [] };
  let query = '';
  let sort: SortKey = 'bookmarked';
  let limit = PAGE;
  let reloadQueued = false;

  const list = $<HTMLDivElement>('list');
  const more = $<HTMLButtonElement>('more');
  const summary = $<HTMLParagraphElement>('summary');
  const message = $<HTMLParagraphElement>('message');
  const searchInput = $<HTMLInputElement>('search');
  const sortSelect = $<HTMLSelectElement>('sort');
  const authorSelect = $<HTMLSelectElement>('author');
  const tagFilter = $<HTMLDivElement>('tag-filter');

  const say = (text: string): void => {
    message.textContent = text;
    message.hidden = !text;
  };

  async function load(): Promise<void> {
    all = await db.bookmarks.toArray();
    const stored = (await db.meta.get(RULES_KEY))?.value;
    rules = typeof stored === 'string' ? parseRules(stored) : DEFAULT_RULES;
    search.rebuild(all);
    render();
  }

  // Background changes (new bookmarks captured on x.com): reload, but never
  // while the reader is typing a note or tag.
  function reloadSoon(): void {
    if (reloadQueued) return;
    reloadQueued = true;
    const attempt = (): void => {
      if (list.contains(document.activeElement)) {
        setTimeout(attempt, 1000);
        return;
      }
      reloadQueued = false;
      void load();
    };
    setTimeout(attempt, 300);
  }
  chrome.runtime.onMessage.addListener((msg: unknown) => {
    if (typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'bookmarks:changed') reloadSoon();
  });

  // --- rendering ---

  function render(): void {
    const ranks = search.search(query);
    const shown = sortBookmarks(applyFilters(all, filters, ranks ? new Set(ranks.keys()) : null), sort === 'relevance' && !ranks ? 'bookmarked' : sort, ranks);
    void updateSummary(shown.length);
    renderAuthors();
    renderTagFilter();

    list.replaceChildren();
    if (!all.length) {
      const link = h('a', { href: 'https://x.com/i/bookmarks', target: '_blank', rel: 'noopener', textContent: 'your bookmarks on X' });
      list.append(
        h(
          'div',
          { className: 'empty muted' },
          h('p', {}, 'Nothing saved yet. Open ', link, ' and they’re saved here as they load.'),
          h('p', { textContent: 'Use “Sync all” on that page to save every bookmark in one go.' })
        )
      );
    } else if (!shown.length) {
      list.append(h('div', { className: 'empty muted', textContent: 'No bookmarks match these filters.' }));
    }
    for (const b of shown.slice(0, limit)) list.append(card(b));
    more.hidden = shown.length <= limit;
    more.textContent = `Show more (${fmt(shown.length - limit)} left)`;
  }

  async function updateSummary(shown: number): Promise<void> {
    let text = all.length === shown ? `${fmt(all.length)} bookmarks` : `Showing ${fmt(shown)} of ${fmt(all.length)} bookmarks`;
    try {
      const { usage } = await navigator.storage.estimate();
      if (usage != null) text += ` · ${(usage / 1024 / 1024).toFixed(1)} MB on this device`;
    } catch {}
    summary.textContent = text;
  }

  function renderAuthors(): void {
    const counts = authorCounts(all).slice(0, 300);
    authorSelect.replaceChildren(h('option', { value: '', textContent: 'Everyone' }));
    for (const c of counts) authorSelect.append(h('option', { value: c.key, textContent: `${c.label} · ${c.count}` }));
    authorSelect.value = filters.author;
  }

  function renderTagFilter(): void {
    tagFilter.replaceChildren();
    const counts = tagCounts(all);
    for (const c of counts) {
      const on = filters.tags.includes(c.key);
      const chip = h('button', { type: 'button', className: 'chip', dataset: { filterTag: c.key } }, c.key, h('span', { className: 'count', textContent: ` ${c.count}` }));
      chip.setAttribute('aria-pressed', String(on));
      tagFilter.append(chip);
    }
    const untagged = h('button', { type: 'button', className: 'chip', dataset: { filterTag: '' } }, 'untagged');
    untagged.setAttribute('aria-pressed', String(filters.untagged));
    tagFilter.append(untagged);
    if (!counts.length && !extras) tagFilter.append(h('span', { className: 'muted pro', textContent: 'Tags are part of Creator Tools Pro.' }));
  }

  function card(b: Bookmark): HTMLElement {
    const t = b.tweet;
    const el = h('article', { className: 'card', dataset: { id: b.id } });
    const avatar = h('img', { className: 'avatar', alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' });
    if (t.authorAvatar) avatar.src = t.authorAvatar;
    const who = h('div', { className: 'who' }, h('b', { textContent: t.authorName || t.authorHandle }), h('span', { className: 'muted', textContent: `@${t.authorHandle} · ${shortDate(t.createdAt)}` }));
    el.append(h('header', {}, avatar, who, h('a', { className: 'open', href: postUrl(t), target: '_blank', rel: 'noopener', textContent: 'Open on X ↗' })));

    const text = h('p', { className: 'text' });
    appendLinked(text, t.text);
    if (t.text) el.append(text);

    const photos = t.media.slice(0, 4);
    if (photos.length) {
      const media = h('div', { className: 'media' });
      for (const m of photos) {
        const link = h('a', { href: postUrl(t), target: '_blank', rel: 'noopener' });
        link.append(h('img', { src: m.url, alt: m.alt ?? (m.type === 'photo' ? 'Photo' : 'Video'), loading: 'lazy', referrerPolicy: 'no-referrer' }));
        media.append(link);
      }
      el.append(media);
    }

    const m = t.metrics;
    const stats = [`${fmt(m.likes)} likes`, `${fmt(m.reposts)} reposts`, `${fmt(m.replies)} replies`];
    if (m.views != null) stats.push(`${fmt(m.views)} views`);
    if (t.source === 'dom') stats.push('partial copy (open it on X to refresh)');
    el.append(h('div', { className: 'stats', textContent: stats.join(' · ') }));

    if (!extras) {
      el.append(h('div', { className: 'muted pro', textContent: 'Tags and notes are part of Creator Tools Pro.' }));
      return el;
    }
    const tags = h('div', { className: 'tags' });
    for (const tag of b.tags) {
      const remove = h('button', { type: 'button', className: 'remove', title: `Remove ${tag}`, textContent: '×', dataset: { removeTag: tag } });
      tags.append(h('span', { className: 'chip' }, tag, remove));
    }
    tags.append(h('input', { className: 'tag-input', placeholder: '+ tag', dataset: { addTag: '1' }, maxLength: 32 }));
    for (const tag of suggestTags(t, rules, b.tags)) {
      tags.append(h('button', { type: 'button', className: 'chip suggested', title: 'Suggested from your tag rules', textContent: `+ ${tag}`, dataset: { suggest: tag } }));
    }
    el.append(tags);
    el.append(h('textarea', { className: 'note', placeholder: 'Add a note…', value: b.note, rows: b.note ? 3 : 1, maxLength: 5000 }));
    return el;
  }

  // --- edits ---

  const find = (id: string | undefined): Bookmark | undefined => all.find((b) => b.id === id);

  async function setTags(b: Bookmark, tags: string[]): Promise<void> {
    await updateBookmark(db, b.id, { tags });
    const fresh = await db.bookmarks.get(b.id);
    if (!fresh) return;
    Object.assign(b, fresh);
    search.rebuild(all);
    list.querySelector(`.card[data-id="${b.id}"]`)?.replaceWith(card(b));
    renderTagFilter();
  }

  list.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const b = find(target.closest<HTMLElement>('.card')?.dataset.id);
    if (!b) return;
    const remove = target.closest<HTMLElement>('[data-remove-tag]')?.dataset.removeTag;
    const suggested = target.closest<HTMLElement>('[data-suggest]')?.dataset.suggest;
    if (remove !== undefined) void setTags(b, b.tags.filter((t) => t !== remove));
    else if (suggested) void setTags(b, [...b.tags, suggested]);
  });

  list.addEventListener('keydown', (e) => {
    const input = e.target as HTMLInputElement;
    if (!input.dataset.addTag || (e.key !== 'Enter' && e.key !== ',')) return;
    e.preventDefault();
    const b = find(input.closest<HTMLElement>('.card')?.dataset.id);
    if (b && input.value.trim()) void setTags(b, [...b.tags, ...input.value.split(',')]);
  });

  const noteTimers = new Map<string, ReturnType<typeof setTimeout>>();
  list.addEventListener('input', (e) => {
    const area = e.target as HTMLTextAreaElement;
    if (!area.classList.contains('note')) return;
    const b = find(area.closest<HTMLElement>('.card')?.dataset.id);
    if (!b) return;
    clearTimeout(noteTimers.get(b.id));
    noteTimers.set(
      b.id,
      setTimeout(() => {
        b.note = area.value;
        void updateBookmark(db, b.id, { note: area.value }).then(() => search.rebuild(all));
      }, 400)
    );
  });

  // --- search, sort and filters ---

  searchInput.addEventListener('input', () => {
    const had = query.trim();
    query = searchInput.value;
    // Typing a search switches to best match; clearing it goes back.
    if (!had && query.trim() && sort === 'bookmarked') sort = sortSelect.value = 'relevance' as SortKey;
    if (had && !query.trim() && sort === 'relevance') sort = sortSelect.value = 'bookmarked' as SortKey;
    limit = PAGE;
    render();
  });
  sortSelect.addEventListener('change', () => {
    sort = sortSelect.value as SortKey;
    render();
  });
  const onFilter = (fn: () => void) => () => {
    fn();
    limit = PAGE;
    render();
  };
  authorSelect.addEventListener('change', onFilter(() => (filters.author = authorSelect.value)));
  $<HTMLInputElement>('from').addEventListener('change', onFilter(() => (filters.from = $<HTMLInputElement>('from').value)));
  $<HTMLInputElement>('to').addEventListener('change', onFilter(() => (filters.to = $<HTMLInputElement>('to').value)));
  $<HTMLInputElement>('has-media').addEventListener('change', onFilter(() => (filters.hasMedia = $<HTMLInputElement>('has-media').checked)));
  $<HTMLInputElement>('has-links').addEventListener('change', onFilter(() => (filters.hasLinks = $<HTMLInputElement>('has-links').checked)));
  $<HTMLInputElement>('min-likes').addEventListener(
    'input',
    onFilter(() => (filters.minLikes = Math.max(0, Number($<HTMLInputElement>('min-likes').value) || 0)))
  );
  tagFilter.addEventListener('click', (e) => {
    const tag = (e.target as HTMLElement).closest<HTMLElement>('[data-filter-tag]')?.dataset.filterTag;
    if (tag === undefined) return;
    onFilter(() => {
      if (tag === '') filters.untagged = !filters.untagged;
      else filters.tags = filters.tags.includes(tag) ? filters.tags.filter((t) => t !== tag) : [...filters.tags, tag];
    })();
  });
  $('clear-filters').addEventListener('click', () => {
    filters = { ...NO_FILTERS, tags: [] };
    for (const id of ['from', 'to']) $<HTMLInputElement>(id).value = '';
    for (const id of ['has-media', 'has-links']) $<HTMLInputElement>(id).checked = false;
    $<HTMLInputElement>('min-likes').value = '0';
    limit = PAGE;
    render();
  });
  more.addEventListener('click', () => {
    limit += PAGE;
    render();
  });

  // --- export, import, rules, delete ---

  const exportMenu = $<HTMLDetailsElement>('export-menu');
  // Close the menu when clicking anywhere else.
  document.addEventListener('click', (e) => {
    if (exportMenu.open && !exportMenu.contains(e.target as Node)) exportMenu.open = false;
  });
  exportMenu.addEventListener('click', (e) => {
    const kind = (e.target as HTMLElement).closest<HTMLElement>('[data-export]')?.dataset.export;
    if (!kind) return;
    exportMenu.open = false;
    if (!extras) return say('Export is part of Creator Tools Pro.');
    const sorted = sortBookmarks(all, 'bookmarked');
    const day = new Date().toISOString().slice(0, 10);
    if (kind === 'json') download(toJSON(sorted), 'application/json', `bookmark-brain-${day}.json`);
    else if (kind === 'csv') download(toCSV(sorted), 'text/csv;charset=utf-8', `bookmark-brain-${day}.csv`);
    else download(toMarkdownByTag(sorted), 'text/markdown;charset=utf-8', `bookmark-brain-${day}.md`);
  });

  const importInput = $<HTMLInputElement>('import');
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    try {
      const { bookmarks, skipped } = parseImport(await file.text());
      const { added, updated } = await importBookmarks(db, bookmarks);
      say(`Imported ${fmt(added)} new and merged ${fmt(updated)} existing bookmarks${skipped ? ` (${fmt(skipped)} invalid entries skipped)` : ''}.`);
      await load();
    } catch (error) {
      say(error instanceof Error ? error.message : 'Import failed.');
    }
  });

  const dialog = $<HTMLDialogElement>('rules');
  const rulesText = $<HTMLTextAreaElement>('rules-text');
  $('rules-button').addEventListener('click', () => {
    rulesText.value = formatRules(rules);
    dialog.showModal();
  });
  $('rules-reset').addEventListener('click', () => {
    rulesText.value = formatRules(DEFAULT_RULES);
  });
  dialog.addEventListener('close', async () => {
    if (dialog.returnValue !== 'save') return;
    rules = parseRules(rulesText.value);
    await db.meta.put({ key: RULES_KEY, value: formatRules(rules) });
    render();
  });

  $('delete-all').addEventListener('click', async () => {
    if (!confirm(`Delete all ${fmt(all.length)} saved bookmarks, tags, notes and tag rules from this device? This can't be undone. (Your bookmarks on X aren't affected.)`)) return;
    await deleteAll(db);
    say('All Bookmark Brain data was deleted from this device.');
    await load();
  });

  await load();
}
