/**
 * Crypto adapter for insecure contexts (non-HTTPS) where crypto.subtle
 * is unavailable. Uses sha1sync for hashing. HMAC and timingSafeEqual
 * throw — they are not needed for the demo's code path.
 */
import { sha1sync } from '@git-stunts/git-warp/sha1sync';

const encoder = new TextEncoder();

function toBytes(data) {
  if (data instanceof Uint8Array) { return data; }
  if (typeof data === 'string') { return encoder.encode(data); }
  throw new Error('Expected string or Uint8Array');
}

function hexFromBytes(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default class InsecureCryptoAdapter {
  async hash(algorithm, data) {
    const bytes = toBytes(data);
    // sha1sync only does SHA-1; for SHA-256 fall back to crypto.subtle if available
    if (algorithm === 'sha1' || algorithm === 'sha-1') {
      return sha1sync(bytes);
    }
    // Try crypto.subtle for other algorithms (available on localhost/HTTPS)
    if (globalThis.crypto?.subtle) {
      const algoMap = { 'sha256': 'SHA-256', 'sha-256': 'SHA-256', 'sha512': 'SHA-512', 'sha-512': 'SHA-512' };
      const mapped = algoMap[algorithm.toLowerCase()];
      if (mapped) {
        const digest = await globalThis.crypto.subtle.digest(mapped, bytes);
        return hexFromBytes(digest);
      }
    }
    // Last resort: return sha1 anyway (only used for content addressing, not security)
    return sha1sync(bytes);
  }

  async hmac(_algorithm, _key, _data) {
    throw new Error('HMAC not available in insecure context');
  }

  timingSafeEqual(_a, _b) {
    throw new Error('timingSafeEqual not available in insecure context');
  }
}
