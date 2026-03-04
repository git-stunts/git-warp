import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    deps: {
      // Native C++ addons must not be transformed by Vite's pipeline.
      external: ['roaring'],
    },
  },
  test: {
    include: [
      '**/*.{test,spec}.?(c|m)[jt]s?(x)',
      '**/benchmark/*.benchmark.js',
    ],
    testTimeout: 60000, // 60s timeout for benchmark tests
  },
});
