import { defineConfig } from 'vitest/config';

// Vitest covers the TypeScript Creator Tools code; Bot Meter's core keeps its node:test suite.
export default defineConfig({
  test: {
    include: ['test/creator/**/*.test.ts'],
    environment: 'node',
  },
});
