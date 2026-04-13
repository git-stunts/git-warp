/**
 * Synchronous SHA-1 for browser use with InMemoryGraphAdapter.
 *
 * This is a minimal, standards-compliant SHA-1 implementation used
 * solely for Git content addressing (blob/tree/commit object IDs).
 * It is NOT used for security purposes.
 *
 * @module infrastructure/adapters/sha1sync
 */

/**
 * Left-rotate a 32-bit integer by n bits.
 */
function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

/**
 * Pads and parses a message into 512-bit blocks for SHA-1.
 */
function preprocess(msg: Uint8Array): Uint32Array[] {
  const bitLen = msg.length * 8;
  const totalBytes = msg.length + 1 + ((119 - (msg.length % 64)) % 64) + 8;
  const padded = new Uint8Array(totalBytes);
  padded.set(msg);
  padded[msg.length] = 0x80;
  const dv = new DataView(padded.buffer);
  // Set low 32 bits of 64-bit big-endian message length (high 32 are zero-init).
  dv.setUint32(totalBytes - 4, bitLen, false);

  const blocks: Uint32Array[] = [];
  for (let i = 0; i < totalBytes; i += 64) {
    const block = new Uint32Array(80);
    for (let j = 0; j < 16; j++) {
      block[j] = dv.getUint32(i + j * 4, false);
    }
    for (let j = 16; j < 80; j++) {
      const b3 = block[j - 3] as number;
      const b8 = block[j - 8] as number;
      const b14 = block[j - 14] as number;
      const b16 = block[j - 16] as number;
      block[j] = rotl(b3 ^ b8 ^ b14 ^ b16, 1);
    }
    blocks.push(block);
  }
  return blocks;
}

/**
 * Returns the SHA-1 round constant for a given round index.
 */
function roundK(i: number): number {
  if (i < 20) { return 0x5A827999; }
  if (i < 40) { return 0x6ED9EBA1; }
  if (i < 60) { return 0x8F1BBCDC; }
  return 0xCA62C1D6;
}

/**
 * Computes the SHA-1 round function f(b, c, d) for a given round index.
 */
function roundF(i: number, vars: number[]): number {
  const b = vars[1] as number;
  const c = vars[2] as number;
  const d = vars[3] as number;
  if (i < 20) { return (b & c) | (~b & d); }
  if (i < 40) { return b ^ c ^ d; }
  if (i < 60) { return (b & c) | (b & d) | (c & d); }
  return b ^ c ^ d;
}

/**
 * Processes a single 512-bit block, updating the hash state in-place.
 */
function processBlock(state: number[], w: Uint32Array): void {
  const v: number[] = [
    state[0] as number,
    state[1] as number,
    state[2] as number,
    state[3] as number,
    state[4] as number,
  ];

  for (let i = 0; i < 80; i++) {
    const f = roundF(i, v);
    const k = roundK(i);
    const temp = (rotl(v[0] as number, 5) + f + (v[4] as number) + k + (w[i] as number)) >>> 0;
    v[4] = v[3] as number;
    v[3] = v[2] as number;
    v[2] = rotl(v[1] as number, 30);
    v[1] = v[0] as number;
    v[0] = temp;
  }

  for (let i = 0; i < 5; i++) {
    state[i] = ((state[i] as number) + (v[i] as number)) >>> 0;
  }
}

/**
 * Computes the SHA-1 hash of a Uint8Array, returning a 40-char hex string.
 *
 * @param data - The data to hash
 * @returns 40-character lowercase hex SHA-1 digest
 *
 * @example
 * import { sha1sync } from './sha1sync.ts';
 * const hex = sha1sync(new TextEncoder().encode('hello'));
 * // => 'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d'
 */
export function sha1sync(data: Uint8Array): string {
  if (data.length >= 0x20000000) {
    throw new RangeError('sha1sync: input exceeds 512 MB limit');
  }
  const blocks = preprocess(data);
  const state = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];

  for (const w of blocks) {
    processBlock(state, w);
  }

  return state.map(v => (v).toString(16).padStart(8, '0')).join('');
}
