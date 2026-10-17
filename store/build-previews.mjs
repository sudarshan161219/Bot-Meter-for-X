// Builds store-screenshot-only pages: the real Bookmark Brain page
// (creator-tools/bookmarks.html) with a script that seeds sample data first.
// Output goes to store/previews/gen/ (git-ignored).
import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'vite';

await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    outDir: 'store/previews/gen',
    emptyOutDir: false,
    minify: false,
    lib: { entry: 'store/previews/bookmarks.ts', formats: ['iife'], name: 'preview_bookmarks', fileName: () => 'bookmarks.js' },
  },
});

const page = readFileSync('creator-tools/bookmarks.html', 'utf8')
  .replace('href="bookmarks.css"', 'href="../../../creator-tools/bookmarks.css"')
  .replaceAll('"icons/', '"../../../creator-tools/icons/')
  .replace('src="gen/bookmarks.js"', 'src="bookmarks.js"');
writeFileSync('store/previews/gen/bookmarks.html', page);
