import { defineConfig } from 'vitest/config';
import { shouldAutoUpdateCoverageRatchet } from './scripts/coverage-ratchet.ts';

export default defineConfig({
  // Externalize the roaring native module from Vite's transform pipeline.
  // roaring contains a .node C++ addon that Vite cannot bundle/transform.
  ssr: {
    external: ['roaring', 'roaring-wasm'],
  },
  test: {
    include: [
      '**/*.{test,spec}.?(c|m)[jt]s?(x)',
      '**/benchmark/*.benchmark.ts',
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
      include: ['src/**/*.ts'],
      exclude: ['src/ports/**/*.ts', 'src/**/*.d.ts'],
      thresholds: {
        lines: 91.74,
        autoUpdate: shouldAutoUpdateCoverageRatchet(),
      },
    },
  },
});
