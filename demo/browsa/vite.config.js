import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

/**
 * Vite plugin that replaces `Buffer.byteLength(...)` with a
 * TextEncoder-based equivalent in @git-stunts/trailer-codec.
 *
 * The trailer-codec MessageNormalizer uses Buffer.byteLength() to
 * guard message size. Buffer doesn't exist in browsers, but a
 * global Buffer polyfill would break cbor-x which detects Buffer
 * and then expects Buffer.prototype.utf8Write (a V8-only method).
 *
 * This targeted replacement avoids both problems.
 */
function trailerCodecBufferShim() {
  return {
    name: 'trailer-codec-buffer-shim',
    transform(code, id) {
      if (!id.includes('trailer-codec')) {
        return null;
      }
      if (!code.includes('Buffer.byteLength')) {
        return null;
      }
      return {
        code: code.replace(
          /Buffer\.byteLength\(([^,)]+)(?:,\s*['"]utf8['"])?\)/g,
          'new TextEncoder().encode(String($1 ?? "")).byteLength',
        ),
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [vue(), trailerCodecBufferShim()],
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
  // elkjs resolves from the parent git-warp node_modules
  server: {
    allowedHosts: true,
    fs: {
      allow: [resolve(__dirname, '../..')],
    },
  },
});
