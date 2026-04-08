const HEX_RE = /^[0-9a-fA-F]{40}$|^[0-9a-fA-F]{64}$/;

const encoder = new TextEncoder();

/**
 * FNV-1a 32-bit over raw bytes (Uint8Array).
 */
function fnv1aBytes(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i]!;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Computes a 2-character hex shard key for a given ID.
 *
 * For hex SHAs (exactly 40 or 64 hex chars), uses the first two characters (lowercased).
 * For all other strings, computes FNV-1a hash over UTF-8 bytes and takes the low byte.
 *
 * Returns '00' for null, undefined, or non-string inputs (graceful fallback).
 */
export default function computeShardKey(id: string): string {
  if (id === null || id === undefined || typeof id !== 'string') {
    return '00';
  }
  if (HEX_RE.test(id)) {
    return id.substring(0, 2).toLowerCase();
  }
  const hash = fnv1aBytes(encoder.encode(id));
  return (hash & 0xff).toString(16).padStart(2, '0');
}
