import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Externalize native C++ addons from Vite's SSR transform pipeline.
  // Without this, Vite 7 (vitest 4) intercepts dynamic import('roaring')
  // and fails to load the .node binary, breaking Bun integration tests.
  ssr: {
    external: ['roaring'],
  },
  test: {
    include: [
      '**/*.{test,spec}.?(c|m)[jt]s?(x)',
      '**/benchmark/*.benchmark.js',
    ],
    testTimeout: 60000, // 60s timeout for benchmark tests
    server: {
      deps: {
        external: [/roaring/],
      },
    },
  },
});
