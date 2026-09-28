// Run with: npm test
// Loads src/inject.js and src/stats.js into a sandbox with stubbed browser APIs.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { homeTimeline, xwebTimeline, legacyUserByScreenName, initialState } = require('./fixtures');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');

function sandbox() {
  const posted = [];
  const domListeners = {};

  class FakeXHR {
    constructor() {
      this.listeners = {};
      this.responseType = '';
    }
    open() {}
    send() {}
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    }
    respond(body) {
      this.responseText = JSON.stringify(body);
      for (const fn of this.listeners.load || []) fn.call(this);
    }
  }

  const window = {
    location: { origin: 'https://x.com' },
    fetch: async (url, body) => ({
      url,
      headers: { get: () => 'application/json; charset=utf-8' },
      clone: () => ({ json: async () => body }),
    }),
    postMessage: (msg) => posted.push(msg),
  };
  const ctx = {
    window,
    XMLHttpRequest: FakeXHR,
    document: { addEventListener: (t, fn) => (domListeners[t] = fn) },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src('inject.js'), ctx);
  vm.runInContext(src('stats.js'), ctx);
  return { ctx, window, posted, domListeners, FakeXHR };
}

const flush = () => new Promise((r) => setImmediate(r));
const byName = (posted) => Object.fromEntries(posted.flatMap((m) => m.users).map((u) => [u.screenName, u]));

test('reads users from XHR GraphQL timeline responses (current schema)', () => {
  const { ctx, posted } = sandbox();
  const xhr = new ctx.XMLHttpRequest();
  xhr.open('GET', 'https://x.com/i/api/graphql/abc/HomeTimeline?variables=1');
  xhr.send();
  xhr.respond(homeTimeline);

  assert.strictEqual(posted.length, 1);
  assert.strictEqual(posted[0].source, 'bot-meter-x');
  const users = byName(posted);
  assert.deepStrictEqual(Object.keys(users).sort(), ['mishabot', 'normal_human', 'spam_machine']);
  assert.deepStrictEqual(
    { ...users.mishabot },
    {
      screenName: 'mishabot',
      restId: '1000',
      name: 'MISHABOT',
      createdAt: 'Mon Mar 21 10:00:00 +0000 2022',
      statuses: 109671,
      media: 9697,
      followers: 554,
      following: 1135,
      verified: false,
    }
  );
});

test('reads x-web (2026) post authors, which have no join date', async () => {
  const { window, posted } = sandbox();
  await window.fetch('https://api.x.com/graphql/abc123/HomeTimeline?variables=%7B%7D', xwebTimeline);
  await flush();
  const users = byName(posted);
  assert.deepStrictEqual(
    { ...users.fresh_bot },
    {
      screenName: 'fresh_bot',
      restId: '1880000000000000000',
      name: 'FRESH_BOT',
      statuses: 250000,
      followers: 42,
      following: 7,
      verified: true,
    }
  );
  assert.strictEqual(users.old_timer.restId, '11348282');
});

test('reads users from fetch responses and the legacy schema', async () => {
  const { window, posted } = sandbox();
  await window.fetch('https://x.com/i/api/graphql/xyz/UserByScreenName', legacyUserByScreenName);
  await flush();
  const users = byName(posted);
  assert.strictEqual(users.old_schema.statuses, 30000);
  assert.strictEqual(users.old_schema.createdAt, 'Tue Mar 21 20:50:14 +0000 2006');
});

test('reads flat users from __INITIAL_STATE__', () => {
  const { window, posted, domListeners } = sandbox();
  window.__INITIAL_STATE__ = initialState;
  domListeners.DOMContentLoaded();
  assert.strictEqual(byName(posted).flat_user.statuses, 500);
});

test('ignores non-API requests', () => {
  const { ctx, posted } = sandbox();
  const xhr = new ctx.XMLHttpRequest();
  xhr.open('GET', 'https://abs.twimg.com/responsive-web/client-web/main.js');
  xhr.send();
  xhr.respond(homeTimeline);
  assert.strictEqual(posted.length, 0);
});

test('computes posts/day and levels', () => {
  const { ctx } = sandbox();
  const { computeStats, formatBadge, formatPhrase, formatAge } = ctx.BotMeterStats;
  const settings = { warnRate: 50, botRate: 150 };
  const now = Date.parse('2026-03-21T10:00:00Z');

  const misha = computeStats({ createdAt: 'Mon Mar 21 10:00:00 +0000 2022', statuses: 109671 }, settings, now);
  assert.strictEqual(Math.round(misha.ageDays), 1461);
  assert.strictEqual(formatBadge(misha.rate), '75/day');
  assert.strictEqual(formatPhrase(misha.rate), '75 posts a day');
  assert.strictEqual(misha.level, 'warn');
  assert.strictEqual(formatAge(misha.ageDays), '4.0 years');

  const human = computeStats({ createdAt: 'Sat Jan 05 12:00:00 +0000 2013', statuses: 9000 }, settings, now);
  assert.strictEqual(human.level, 'ok');
  assert.strictEqual(formatBadge(human.rate), '2/day');

  const bot = computeStats({ createdAt: 'Thu Jan 01 00:00:00 +0000 2026', statuses: 107000 }, settings, now);
  assert.strictEqual(bot.level, 'bot');

  // Brand-new account: age is floored to one day.
  const fresh = computeStats({ createdAt: new Date(now - 60_000).toUTCString(), statuses: 40 }, settings, now);
  assert.strictEqual(fresh.rate, 40);

  assert.strictEqual(computeStats({ createdAt: 'garbage', statuses: 1 }, settings, now), null);
});

test('shows quiet accounts per week or month, in whole numbers', () => {
  const { ctx } = sandbox();
  const { formatBadge, formatPhrase } = ctx.BotMeterStats;
  assert.strictEqual(formatBadge(412.4), '412/day');
  assert.strictEqual(formatBadge(1.4), '1/day');
  assert.strictEqual(formatPhrase(1.4), '1 post a day');
  assert.strictEqual(formatBadge(0.3), '2/week'); // 2.1 a week
  assert.strictEqual(formatPhrase(0.3), '2 posts a week');
  assert.strictEqual(formatBadge(0.1), '3/month'); // 0.7 a week
  assert.strictEqual(formatBadge(0.01), '<1/month');
  assert.strictEqual(formatPhrase(0.01), 'less than 1 post a month');
  assert.strictEqual(formatBadge(2500), '2,500/day');
});

test('reports replies, reposts and quotes', async () => {
  const { window, posted } = sandbox();
  await window.fetch('https://api.x.com/graphql/abc123/HomeTimeline', xwebTimeline);
  await flush();
  const posts = Object.fromEntries(posted.flatMap((m) => m.posts).map((p) => [p.id, { ...p }]));
  assert.deepStrictEqual(posts['22'], { id: '22', reply: false, repostOf: '23', quotedId: null, quotedAuthor: null });
  assert.deepStrictEqual(posts['24'], { id: '24', reply: true, repostOf: null, quotedId: null, quotedAuthor: null });
  assert.deepStrictEqual(posts['25'], { id: '25', reply: false, repostOf: null, quotedId: '26', quotedAuthor: 'quoted_person' });
  // Plain posts aren't reported.
  assert.strictEqual(posts['20'], undefined);
  assert.strictEqual(posts['23'], undefined);
});

test('derives join dates from account IDs', () => {
  const { ctx } = sandbox();
  const { joinDateFromId, computeStats } = ctx.BotMeterStats;
  const anchors = require('./anchors.json');
  for (const [handle, id, ms] of anchors) {
    const got = joinDateFromId(id);
    if (BigInt(id) >= 10n ** 15n) {
      // Snowflake IDs: exact to within a couple of minutes.
      assert.strictEqual(got.approx, false, handle);
      assert.ok(Math.abs(got.ms - ms) < 5 * 60_000, `${handle}: ${got.ms} vs ${ms}`);
    } else {
      // Sequential IDs are the interpolation anchors themselves.
      assert.strictEqual(got.approx, true, handle);
      assert.ok(Math.abs(got.ms - ms) < 1000, `${handle}: ${got.ms} vs ${ms}`);
    }
  }
  // Between anchors: stays within the anchor dates.
  const mid = joinDateFromId('30000000').ms;
  assert.ok(mid > Date.parse('2009-03-28') && mid < Date.parse('2009-04-19'));
  assert.strictEqual(joinDateFromId('abc'), null);
  assert.strictEqual(joinDateFromId(undefined), null);

  // computeStats falls back to the ID when there's no createdAt.
  const now = Date.parse('2026-09-27T00:00:00Z');
  const s = computeStats({ restId: '1880000000000000000', statuses: 250000 }, { warnRate: 50, botRate: 150 }, now);
  assert.strictEqual(s.level, 'bot');
  assert.strictEqual(s.approx, false);
});
