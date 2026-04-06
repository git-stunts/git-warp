import { defineConfig } from 'vitest/config';
import { shouldAutoUpdateCoverageRatchet } from './scripts/coverage-ratchet.js';

export default defineConfig({
  // Externalize the roaring native module from Vite's transform pipeline.
  // roaring contains a .node C++ addon that Vite cannot bundle/transform.
  ssr: {
    external: ['roaring', 'roaring-wasm'],
  },
  test: {
    include: [
      '**/*.{test,spec}.?(c|m)[jt]s?(x)',
      '**/benchmark/*.benchmark.js',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'test/runtime/deno/**',
      '.claude/**',
    ],
    testTimeout: 60000, // 60s timeout for benchmark tests
    server: {
      deps: {
        external: [/roaring/],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: [
        'src/visualization/index.js',
        'src/visualization/renderers/ascii/index.js',
        'src/visualization/renderers/browser/index.js',
      ],
      thresholds: {
        lines: 96.49,
        autoUpdate: shouldAutoUpdateCoverageRatchet(),
      },
    },
  },
});
