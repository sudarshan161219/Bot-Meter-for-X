// Bundles the Creator Tools entry points into single plain scripts the manifest
// can load as content scripts (no ES modules in content scripts).
//
//   src/creator/capture/main-world.ts -> src/gen/creator-main.js     (page world, before inject.js)
//   src/creator/content/index.ts      -> src/gen/creator-content.js  (extension world, after content.js)
import { build } from 'vite';

const entries = {
  'creator-main': 'src/creator/capture/main-world.ts',
  'creator-content': 'src/creator/content/index.ts',
};

for (const [name, entry] of Object.entries(entries)) {
  await build({
    configFile: false,
    logLevel: 'warn',
    build: {
      outDir: 'src/gen',
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      target: 'es2022',
      // IIFE needs a name; the entries export nothing, so no global is created.
      lib: { entry, formats: ['iife'], name: name.replace(/-/g, '_'), fileName: () => `${name}.js` },
    },
  });
  console.log(`built src/gen/${name}.js`);
}
