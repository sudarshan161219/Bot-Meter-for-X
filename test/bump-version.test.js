const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'scripts', 'bump-version.mjs')).href);

test('bumps patch, minor and major', async () => {
  const { nextVersion } = await load();
  assert.strictEqual(nextVersion('1.8.0', 'patch'), '1.8.1');
  assert.strictEqual(nextVersion('1.8.3', 'minor'), '1.9.0');
  assert.strictEqual(nextVersion('1.8.3', 'major'), '2.0.0');
  assert.strictEqual(nextVersion('1.8', 'patch'), '1.8.1');
});

test('accepts an exact version only if it is higher and valid for Chrome', async () => {
  const { nextVersion } = await load();
  assert.strictEqual(nextVersion('1.8.0', '2.0.0'), '2.0.0');
  assert.strictEqual(nextVersion('1.8.0', '1.8.0.1'), '1.8.0.1');
  assert.throws(() => nextVersion('1.8.0', '1.7.9'), /isn't higher/);
  assert.throws(() => nextVersion('1.8.0', '1.8.0'), /isn't higher/);
  assert.throws(() => nextVersion('1.8.0', '70000.0.0'), /valid Chrome/);
  assert.throws(() => nextVersion('1.8.0', 'huge'), /patch, minor, major/);
});
