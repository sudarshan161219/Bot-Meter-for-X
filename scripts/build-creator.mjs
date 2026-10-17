// Bundles the Creator Tools entry points into single plain scripts the
// manifests can load (no ES modules in content scripts).
//
// Bot Meter (this repo's root extension):
//   src/creator/capture/main-world.ts -> src/gen/creator-main.js     (page world, before inject.js)
//   src/creator/content/index.ts      -> src/gen/creator-content.js  (extension world, after content.js)
//
// Creator Tools for X (creator-tools/, a separate extension):
//   src/creator/tools/main-world.ts   -> creator-tools/gen/main.js        (page world)
//   src/creator/tools/content.ts      -> creator-tools/gen/content.js     (extension world)
//   src/creator/tools/background.ts   -> creator-tools/gen/background.js  (service worker)
//   src/creator/tools/print.ts        -> creator-tools/gen/print.js       (print.html)
import { cpSync } from 'node:fs';
import { build } from 'vite';

const entries = [
  ['src/gen', 'creator-main', 'src/creator/capture/main-world.ts'],
  ['src/gen', 'creator-content', 'src/creator/content/index.ts'],
  ['creator-tools/gen', 'main', 'src/creator/tools/main-world.ts'],
  ['creator-tools/gen', 'content', 'src/creator/tools/content.ts'],
  ['creator-tools/gen', 'background', 'src/creator/tools/background.ts'],
  ['creator-tools/gen', 'print', 'src/creator/tools/print.ts'],
];

for (const [outDir, name, entry] of entries) {
  await build({
    configFile: false,
    logLevel: 'warn',
    build: {
      outDir,
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      target: 'es2022',
      // IIFE needs a name; the entries export nothing, so no global is created.
      lib: { entry, formats: ['iife'], name: name.replace(/-/g, '_'), fileName: () => `${name}.js` },
    },
  });
  console.log(`built ${outDir}/${name}.js`);
}

// Creator Tools uses Bot Meter's icons until it has its own.
cpSync('icons', 'creator-tools/icons', { recursive: true });
