// Store screenshot only: fills Bookmark Brain with sample bookmarks, then starts
// the real page (src/creator/bookmark-brain/app.ts). Built by store/build-previews.mjs.
// Uses an in-memory IndexedDB: headless Chrome's screenshot timer doesn't wait for the real one.
import 'fake-indexeddb/auto';
import { startApp } from '../../src/creator/bookmark-brain/app';
import { BookmarkDB, saveCaptured, updateBookmark } from '../../src/creator/bookmark-brain/db';
import type { Media, Tweet } from '../../src/creator/types';

(globalThis as { chrome?: unknown }).chrome = { runtime: { onMessage: { addListener() {} } } };
// The in-memory database reports almost no usage; show a typical figure instead.
navigator.storage.estimate = async () => ({ usage: 2.4 * 1024 * 1024, quota: 1e10 });

const svg = (body: string, w = 400, h = 400): string =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)}`;
const avatar = (a: string, b: string): string =>
  svg(`<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/>`);
const photo = (a: string, b: string, label: string): Media => ({
  type: 'photo',
  url: svg(
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="520" height="280" fill="url(#g)"/><text x="260" y="150" font-family="sans-serif" font-size="30" font-weight="700" fill="white" text-anchor="middle">${label}</text>`,
    520,
    280
  ),
  videoUrl: null,
  alt: label,
  width: 520,
  height: 280,
});

const people: Record<string, [string, string, string]> = {
  lena_builds: ['Lena Park', '#1d9bf0', '#0f4c81'],
  maya_writes: ['Maya Chen', '#f7a8b8', '#c56cf0'],
  devon_k: ['Devon Kim', '#7bd88f', '#2f9e44'],
  ana_designs: ['Ana Ruiz', '#fdba74', '#ea580c'],
  priya_ml: ['Priya Nair', '#a5b4fc', '#4f46e5'],
  sam_ships: ['Sam Okafor', '#5eead4', '#0f766e'],
};

const day = 864e5;
const now = Date.now();
const rows: [keyof typeof people, string, number, number, Media[], string[], string][] = [
  ['priya_ml', 'Evals are the new unit tests. If you ship LLM features without a fixed eval set, every prompt change is a coin flip. Here is the 40-case set we start every project with 👇 https://example.com/evals', 3, 4210, [], ['ai'], 'Adapt for the support bot before Q4'],
  ['ana_designs', 'Typography tip: body text at 16–18px, line height around 1.5, and no more than 75 characters per line. Readers will stay longer.', 9, 1880, [photo('#fde68a', '#f97316', 'Aa · 16px · 1.5')], ['design'], ''],
  ['lena_builds', 'We open-sourced the scheduler that runs our data platform. 3 years, 40k lines, MIT licensed https://github.com/example/scheduler', 12, 9600, [], ['dev'], 'Compare lease handling with ours'],
  ['maya_writes', 'Writing advice I wish I had at 20: finish the draft before you fix the draft. Momentum beats polish.', 20, 730, [], ['writing'], ''],
  ['devon_k', 'Our startup hit $10k MRR this week. 14 months, two pivots, zero ads. Lessons from year one, a thread 🧵', 26, 3120, [], ['startup'], ''],
  ['sam_ships', 'The best performance fix I made all year: delete the feature nobody used. Load time down 38%.', 33, 2250, [photo('#bbf7d0', '#15803d', '−38% load time')], ['dev'], ''],
  ['priya_ml', 'Small models + good retrieval beat big models + no retrieval on our internal docs QA. Numbers and setup https://example.com/rag', 41, 5480, [], ['ai'], ''],
  ['ana_designs', 'Design systems fail when they ship components without the "why". Document decisions, not just props.', 55, 990, [], [], ''],
  ['maya_writes', 'Read 52 books this year. The three that changed how I work: Deep Work, The Making of a Manager, and Four Thousand Weeks.', 70, 1420, [], [], ''],
];

const tweets: Tweet[] = rows.map(([handle, text, age, likes, media], i) => {
  const [name, a, b] = people[handle] ?? ['?', '#888', '#444'];
  return {
    id: String(1979000000000000000n + BigInt(i)),
    authorId: handle,
    authorHandle: handle,
    authorName: name,
    authorAvatar: avatar(a, b),
    verified: i % 3 === 0,
    text,
    createdAt: now - age * day,
    media,
    conversationId: null,
    metrics: { likes, reposts: Math.round(likes / 9), replies: Math.round(likes / 25), quotes: 0, views: likes * 61, bookmarks: Math.round(likes / 4) },
    urls: text.match(/https:\/\/\S+/g) ?? [],
    source: 'graphql',
  };
});

(async () => {
  const db = new BookmarkDB();
  await db.bookmarks.clear();
  await saveCaptured(db, tweets.map((tweet, i) => ({ tweet, order: now - i })));
  for (const [i, row] of rows.entries()) {
    const tags = row[5];
    const note = row[6];
    if (tags.length || note) await updateBookmark(db, tweets[i]!.id, { tags, note });
  }
  await startApp(db);
})();
