// Bumps the extension version everywhere it's written, in one step.
//
//   npm run bump -- patch            Bot Meter 1.8.0 -> 1.8.1 (manifest.json, package.json, package-lock.json)
//   npm run bump -- minor            1.8.0 -> 1.9.0
//   npm run bump -- major            1.8.0 -> 2.0.0
//   npm run bump -- 2.1.0            an exact version
//   npm run bump -- patch --tools    Creator Tools for X (creator-tools/manifest.json)
//
// Chrome versions are 1–4 dot-separated integers, each 0–65535, and the store
// only accepts a higher version than the one published, so going backwards is refused.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAX_PART = 65535;

/** "1.8.0" + "patch" -> "1.8.1". Throws on anything Chrome wouldn't accept. */
export function nextVersion(current, change) {
  const parts = parse(current);
  if (/^\d+(\.\d+){0,3}$/.test(change)) {
    const target = parse(change);
    if (compare(target, parts) <= 0) throw new Error(`${change} isn't higher than the current ${current}.`);
    return target.join('.');
  }
  const [major = 0, minor = 0, patch = 0] = parts;
  if (change === 'major') return `${major + 1}.0.0`;
  if (change === 'minor') return `${major}.${minor + 1}.0`;
  if (change === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Use patch, minor, major or an exact version like 2.1.0 (got "${change}").`);
}

function parse(version) {
  const parts = String(version).split('.').map(Number);
  if (parts.length > 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > MAX_PART)) {
    throw new Error(`"${version}" isn't a valid Chrome extension version.`);
  }
  return parts;
}

function compare(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Rewrites only the "version" values, keeping each file's formatting. */
function setVersion(file, version, { lockfile = false } = {}) {
  const text = readFileSync(file, 'utf8');
  const json = JSON.parse(text);
  json.version = version;
  if (lockfile && json.packages?.['']) json.packages[''].version = version;
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}

function main(args) {
  const tools = args.includes('--tools');
  const change = args.find((a) => !a.startsWith('--'));
  if (!change) throw new Error('Say how to bump: npm run bump -- patch | minor | major | <version> [--tools]');

  const manifest = tools ? 'creator-tools/manifest.json' : 'manifest.json';
  const current = JSON.parse(readFileSync(manifest, 'utf8')).version;
  const next = nextVersion(current, change);
  setVersion(manifest, next);
  const touched = [manifest];
  if (!tools) {
    setVersion('package.json', next);
    setVersion('package-lock.json', next, { lockfile: true });
    touched.push('package.json', 'package-lock.json');
  }
  const name = tools ? 'Creator Tools for X' : 'Bot Meter';
  console.log(`${name}: ${current} -> ${next}  (${touched.join(', ')})`);
  console.log(tools ? 'Next: npm run build:tools' : 'Next: npm run build');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
