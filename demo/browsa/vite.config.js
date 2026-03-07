import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [vue()],
  build: {
    // Top-level await (used by InMemoryGraphAdapter and defaultCrypto lazy-loading)
    // requires modern browser targets.
    target: 'es2022',
  },
  resolve: {
    alias: {
      '@git-stunts/git-warp/browser': resolve(__dirname, '../../browser.js'),
      '@git-stunts/git-warp/sha1sync': resolve(
        __dirname,
        '../../src/infrastructure/adapters/sha1sync.js',
      ),
      // Stub out Node-only packages that are lazy-loaded but never
      // actually invoked in the browser code path.
      'roaring': resolve(__dirname, 'src/stubs/empty.js'),
      'roaring-wasm': resolve(__dirname, 'src/stubs/empty.js'),
      '@git-stunts/plumbing': resolve(__dirname, 'src/stubs/empty.js'),
      '@git-stunts/git-cas': resolve(__dirname, 'src/stubs/empty.js'),
      'node:crypto': resolve(__dirname, 'src/stubs/node-crypto.js'),
      'node:stream': resolve(__dirname, 'src/stubs/node-stream.js'),
      'node:module': resolve(__dirname, 'src/stubs/node-module.js'),
    },
  },
  optimizeDeps: {
    include: ['cbor-x'],
    exclude: ['roaring', 'roaring-wasm'],
  },
});
