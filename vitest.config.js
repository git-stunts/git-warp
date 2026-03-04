import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Externalize the roaring native module from Vite's transform pipeline.
  // roaring contains a .node C++ addon that Vite cannot bundle/transform.
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
