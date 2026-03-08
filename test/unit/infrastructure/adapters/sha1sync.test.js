import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { sha1sync } from '../../../../src/infrastructure/adapters/sha1sync.js';

describe('sha1sync', () => {
  it('matches node:crypto for empty input', () => {
    const expected = createHash('sha1').update(Buffer.alloc(0)).digest('hex');
    expect(sha1sync(new Uint8Array(0))).toBe(expected);
  });

  it('matches node:crypto for "hello"', () => {
    const data = new TextEncoder().encode('hello');
    const expected = createHash('sha1').update(data).digest('hex');
    expect(sha1sync(data)).toBe(expected);
  });

  it('matches node:crypto for a Git blob header', () => {
    const content = 'hello world';
    const blob = `blob ${content.length}\0${content}`;
    const data = new TextEncoder().encode(blob);
    const expected = createHash('sha1').update(data).digest('hex');
    expect(sha1sync(data)).toBe(expected);
  });

  it('matches node:crypto for binary data', () => {
    const data = new Uint8Array(256);
    for (let i = 0; i < 256; i++) data[i] = i;
    const expected = createHash('sha1').update(data).digest('hex');
    expect(sha1sync(data)).toBe(expected);
  });

  it('matches node:crypto for exactly 64-byte input (one block)', () => {
    const data = new Uint8Array(64).fill(0x41); // 64 'A' bytes
    const expected = createHash('sha1').update(data).digest('hex');
    expect(sha1sync(data)).toBe(expected);
  });

  it('matches node:crypto for multi-block input', () => {
    const data = new Uint8Array(1000).fill(0xFF);
    const expected = createHash('sha1').update(data).digest('hex');
    expect(sha1sync(data)).toBe(expected);
  });

  it('throws RangeError for inputs >= 512 MB', () => {
    // Don't actually allocate 512 MB — verify the guard triggers based on length
    const fakeHuge = { length: 0x20000000 };
    expect(() => sha1sync(/** @type {Uint8Array} */ (fakeHuge))).toThrow(RangeError);
    expect(() => sha1sync(/** @type {Uint8Array} */ (fakeHuge))).toThrow('512 MB');
  });
});
