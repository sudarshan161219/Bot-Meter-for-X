const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('the service worker sets the uninstall feedback page, with the version', () => {
  const calls = [];
  const chrome = {
    runtime: {
      getManifest: () => ({ version: '1.8.0' }),
      setUninstallURL: (url) => calls.push(url),
    },
  };
  new Function('chrome', fs.readFileSync(path.join(root, 'src/background.js'), 'utf8'))(chrome);
  assert.deepStrictEqual(calls, ['https://sudarshan161219.github.io/Bot-Meter-for-X/uninstall.html?v=1.8.0']);
});

test('the manifest registers it, and the page it points to exists', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.background?.service_worker, 'src/background.js');
  assert.deepStrictEqual(manifest.permissions, ['storage']); // no new permission
  assert.ok(fs.existsSync(path.join(root, 'docs/uninstall.html')));
});
