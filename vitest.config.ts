import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./src/test-setup.ts'],
    environment: 'happy-dom',
    coverage: {
      reporter: ['text', 'json-summary', 'json'],
      provider: 'istanbul',
      thresholds: {
        lines: 60,
        branches: 50,
        functions: 60,
        statements: 60,
        // Fork-authored files must be fully covered.
        '{src/lib/data-merge.ts,src/lib/util/folder-note.ts}': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
      },
    },
  },
  resolve: {
    alias: [
      { find: '@app', replacement: resolve(__dirname, './src') },
      { find: '@lib', replacement: resolve(__dirname, './src/lib') },
    ],
  },
});
