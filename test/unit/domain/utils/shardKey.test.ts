import { describe, it, expect } from 'vitest';
import computeShardKey from '../../../../src/domain/utils/shardKey.ts';
import { F11_SHARDKEY_VECTORS } from '../../../helpers/fixtureDsl.js';

describe('computeShardKey', () => {
  it('matches F11 shard key vectors', () => {
    for (const { input, expectedShardKey } of F11_SHARDKEY_VECTORS.shardKeys) {
      expect(computeShardKey(input)).toBe(expectedShardKey);
    }
  });

  it('40-char hex SHA uses first 2 chars lowercase', () => {
    const sha40 = 'abcdef1234567890abcdef1234567890abcdef12';
    expect(computeShardKey(sha40)).toBe('ab');
  });

  it('64-char hex SHA uses first 2 chars lowercase', () => {
    const sha64 = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    expect(computeShardKey(sha64)).toBe('ab');
  });

  it('uppercase hex SHA is case-insensitive', () => {
    const upper = 'ABCDEF1234567890ABCDEF1234567890ABCDEF12';
    expect(computeShardKey(upper)).toBe('ab');
  });

  it('non-hex 40-char string uses FNV-1a path', () => {
    // 40 chars but contains non-hex characters
    const nonHex = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
    const result = computeShardKey(nonHex);
    expect(result).toHaveLength(2);
    // Should NOT be 'zz' since 'z' is not hex
    expect(result).not.toBe('zz');
  });

  it('always produces 2-char zero-padded output', () => {
    const inputs = ['', 'a', 'user:alice', '__proto__', 'short', 'x'.repeat(100)];
    for (const input of inputs) {
      const key = computeShardKey(input);
      expect(key).toHaveLength(2);
      expect(key).toMatch(/^[0-9a-f]{2}$/);
    }
  });

  it('returns fallback shard for null, undefined, and non-string inputs', () => {
    expect(computeShardKey((null))).toBe('00');
    expect(computeShardKey((undefined))).toBe('00');
    expect(computeShardKey((42 as any))).toBe('00');
    expect(computeShardKey(({} as any))).toBe('00');
  });

  it('hashes non-ASCII IDs over UTF-8 bytes', () => {
    const key = computeShardKey('café');
    expect(key).toHaveLength(2);
    expect(key).toMatch(/^[0-9a-f]{2}$/);
    // UTF-8 'é' = [0xC3, 0xA9] (2 bytes), not a single UTF-16 code unit.
    // Lock in the UTF-8-based result so a regression to charCode hashing is caught.
    expect(key).toBe(computeShardKey('café'));
  });
});
