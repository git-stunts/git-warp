import { describe, it, expect } from 'vitest';
import toBytes from '../../../../src/domain/utils/toBytes.ts';

describe('toBytes', () => {
  it('returns Uint8Array unchanged', () => {
    const input = new Uint8Array([1, 2, 3]);
    const result = toBytes(input);
    expect(result).toBe(input);
  });

  it('converts plain number[] to Uint8Array', () => {
    const result = toBytes([10, 20, 30]);
    expect(result).toBeInstanceOf(Uint8Array);
    expect([...result]).toEqual([10, 20, 30]);
  });

  it('converts Buffer to Uint8Array', () => {
    if (typeof Buffer === 'undefined') { return; }
    const buf = Buffer.from([4, 5, 6]);
    const result = toBytes(buf);
    expect(result).toBeInstanceOf(Uint8Array);
    expect([...result]).toEqual([4, 5, 6]);
  });

  it('handles empty input', () => {
    const result = toBytes([]);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(0);
  });
});
