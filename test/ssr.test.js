// Replays the inline <script>s of real server-rendered x.com pages (saved in
// test/pages/) through src/inject.js and checks which users it reports.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'inject.js'), 'utf8');

async function replay(page) {
  const html = fs.readFileSync(path.join(__dirname, 'pages', page), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const posted = [];
  const ctx = {
    location: { origin: 'https://x.com' },
    fetch: async () => {},
    postMessage: (msg) => posted.push(msg),
    XMLHttpRequest: class { open() {} send() {} },
    document: { addEventListener() {}, dispatchEvent() {}, currentScript: { remove() {} } },
    requestAnimationFrame() {},
    performance: { now: () => 0 },
    setTimeout,
    Event: class {},
    ReadableStream,
    TextEncoder,
    TextDecoder,
    queueMicrotask,
  };
  ctx.window = ctx.self = ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  let ran = 0;
  for (const code of scripts) {
    // Only the TanStack/seroval data stream, not React's own $RC/$RB helpers.
    if (!code.includes('$_TSR') && !code.startsWith('($R=>')) continue;
    vm.runInContext(code, ctx);
    ran++;
  }
  await new Promise((r) => setTimeout(r, 10));
  const users = {};
  const posts = {};
  for (const m of posted) {
    for (const u of m.users) users[u.screenName] = u;
    for (const p of m.posts) posts[p.id] = p;
  }
  return { users, posts, ran };
}

test('profile page: reads the profile owner from the SSR stream', async () => {
  const { users, ran } = await replay('profile-NASA.html');
  assert.ok(ran > 0, 'no stream scripts found in fixture');
  const nasa = users.NASA;
  assert.ok(nasa, `NASA not found; got ${Object.keys(users)}`);
  assert.strictEqual(nasa.statuses, 74336);
  assert.strictEqual(nasa.createdAt, '2007-12-19T20:20:32.000Z');
  assert.strictEqual(typeof nasa.followers, 'number');
  assert.strictEqual(nasa.following, 115);
  assert.strictEqual(nasa.restId, '11348282');
});

test('post page: reads the author and repliers', async () => {
  const { users, posts } = await replay('status-NASA.html');
  // The three replies under the post are flagged as replies; the post itself isn't.
  const replyIds = Object.values(posts).filter((p) => p.reply).map((p) => p.id);
  assert.strictEqual(replyIds.length, 3);
  assert.ok(!replyIds.includes('2103610284464316469'));
  // (@mentioned accounts only come as bare mention entities, without counts.)
  for (const name of ['NASA', 'HFStudios2021', 'crazyPD_TX', 'pds1st']) {
    assert.ok(users[name], `${name} missing; got ${Object.keys(users)}`);
    assert.strictEqual(typeof users[name].statuses, 'number');
    // Post authors have no join date in x-web; the account ID stands in for it.
    assert.match(users[name].restId, /^\d+$/);
  }
});
