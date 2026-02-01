/**
 * Tests for WriterId SPEC (CRDT-safe identity).
 *
 * @see src/domain/utils/WriterId.js
 */

import { describe, it, expect } from 'vitest';
import {
  generateWriterId,
  validateWriterIdCanonical,
  resolveWriterId,
  WriterIdError,
} from '../../../../src/domain/utils/WriterId.js';
import { validateWriterId } from '../../../../src/domain/utils/RefLayout.js';

/**
 * Creates a seeded deterministic random bytes generator for testing.
 * Uses a simple xorshift32 PRNG.
 *
 * @param {number} seed - Initial seed value
 * @returns {(n: number) => Uint8Array} Deterministic random bytes function
 */
function seededRandomBytes(seed = 123456789) {
  let x = seed >>> 0;
  return (n) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      x ^= x << 13; x >>>= 0;
      x ^= x >> 17; x >>>= 0;
      x ^= x << 5;  x >>>= 0;
      out[i] = x & 0xff;
    }
    return out;
  };
}

describe('WriterId SPEC', () => {
  describe('generateWriterId', () => {
    it('produces canonical, ref-safe IDs', () => {
      const id = generateWriterId({ randomBytes: seededRandomBytes(1) });
      expect(id).toMatch(/^w_[0-9a-hjkmnp-tv-z]{26}$/);
      expect(() => validateWriterId(id)).not.toThrow(); // ref-safe
      expect(() => validateWriterIdCanonical(id)).not.toThrow();
      expect(id.length).toBe(28);
    });

    it('produces different IDs with different seeds', () => {
      const id1 = generateWriterId({ randomBytes: seededRandomBytes(1) });
      const id2 = generateWriterId({ randomBytes: seededRandomBytes(2) });
      expect(id1).not.toBe(id2);
    });

    it('produces consistent IDs with same seed', () => {
      const id1 = generateWriterId({ randomBytes: seededRandomBytes(42) });
      const id2 = generateWriterId({ randomBytes: seededRandomBytes(42) });
      expect(id1).toBe(id2);
    });

    it('throws if RNG returns wrong size', () => {
      expect(() => generateWriterId({ randomBytes: () => new Uint8Array(15) }))
        .toThrow(WriterIdError);
      expect(() => generateWriterId({ randomBytes: () => new Uint8Array(15) }))
        .toThrow('randomBytes() must return Uint8Array(16)');
    });

    it('throws if RNG returns wrong type', () => {
      expect(() => generateWriterId({ randomBytes: () => [1, 2, 3] }))
        .toThrow(WriterIdError);
    });

    it('has extremely low collision risk (no duplicates over 10k)', () => {
      const rb = seededRandomBytes(42);
      const seen = new Set();
      for (let i = 0; i < 10_000; i++) {
        const id = generateWriterId({ randomBytes: rb });
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    });

    it('uses real CSPRNG when no randomBytes provided', () => {
      // This test verifies the default path works in Node.js
      const id = generateWriterId();
      expect(id).toMatch(/^w_[0-9a-hjkmnp-tv-z]{26}$/);
      expect(id.length).toBe(28);
    });
  });

  describe('validateWriterIdCanonical', () => {
    it('accepts valid canonical IDs', () => {
      const id = generateWriterId({ randomBytes: seededRandomBytes(123) });
      expect(() => validateWriterIdCanonical(id)).not.toThrow();
    });

    it('rejects non-string input', () => {
      expect(() => validateWriterIdCanonical(123)).toThrow(WriterIdError);
      expect(() => validateWriterIdCanonical(123)).toThrow('writerId must be a string');
      expect(() => validateWriterIdCanonical(null)).toThrow(WriterIdError);
      expect(() => validateWriterIdCanonical(undefined)).toThrow(WriterIdError);
    });

    it('rejects non-canonical forms', () => {
      // User-provided IDs (valid ref-safe but not canonical)
      expect(() => validateWriterIdCanonical('alice')).toThrow(WriterIdError);
      expect(() => validateWriterIdCanonical('node-1')).toThrow(WriterIdError);

      // Wrong prefix
      expect(() => validateWriterIdCanonical('x_' + 'a'.repeat(26))).toThrow();

      // Wrong case (uppercase)
      expect(() => validateWriterIdCanonical('w_ABCDEFGHJKMNPQRSTVWXYZ0123')).toThrow();

      // Too short
      expect(() => validateWriterIdCanonical('w_' + 'a'.repeat(25))).toThrow();

      // Too long
      expect(() => validateWriterIdCanonical('w_' + 'a'.repeat(27))).toThrow();

      // Invalid characters (i, l, o, u not in Crockford alphabet)
      expect(() => validateWriterIdCanonical('w_iiiiiiiiiiiiiiiiiiiiiiiiii')).toThrow();
      expect(() => validateWriterIdCanonical('w_llllllllllllllllllllllllll')).toThrow();
      expect(() => validateWriterIdCanonical('w_oooooooooooooooooooooooooo')).toThrow();
      expect(() => validateWriterIdCanonical('w_uuuuuuuuuuuuuuuuuuuuuuuuuu')).toThrow();
    });

    it('includes the invalid ID in error message', () => {
      try {
        validateWriterIdCanonical('bad-id');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e.message).toContain('bad-id');
        expect(e.code).toBe('INVALID_CANONICAL');
      }
    });
  });

  describe('resolveWriterId', () => {
    it('explicit writerId wins and is only ref-safe validated', async () => {
      const id = await resolveWriterId({
        graphName: 'g',
        explicitWriterId: 'alice',
        configGet: async () => null,
        configSet: async () => { throw new Error('should not write'); },
      });
      expect(id).toBe('alice');
    });

    it('explicit writerId is validated for ref-safety', async () => {
      await expect(resolveWriterId({
        graphName: 'g',
        explicitWriterId: 'a/b', // Invalid: contains slash
        configGet: async () => null,
        configSet: async () => {},
      })).rejects.toThrow('Invalid writer ID');
    });

    it('loads from config if present and valid', async () => {
      const id = await resolveWriterId({
        graphName: 'g',
        explicitWriterId: undefined,
        configGet: async () => 'node-1',
        configSet: async () => { throw new Error('should not write'); },
      });
      expect(id).toBe('node-1');
    });

    it('uses correct config key based on graphName', async () => {
      let readKey;
      await resolveWriterId({
        graphName: 'my-graph',
        explicitWriterId: undefined,
        configGet: async (key) => { readKey = key; return 'existing'; },
        configSet: async () => {},
      });
      expect(readKey).toBe('warp.writerId.my-graph');
    });

    it('regenerates if config value is invalid (contains slash)', async () => {
      let stored;
      const id = await resolveWriterId({
        graphName: 'g',
        explicitWriterId: undefined,
        configGet: async () => 'a/b', // Invalid due to slash
        configSet: async (_k, v) => { stored = v; },
      });
      expect(id).toMatch(/^w_[0-9a-hjkmnp-tv-z]{26}$/);
      expect(stored).toBe(id);
    });

    it('regenerates if config value is invalid (path traversal)', async () => {
      let stored;
      const id = await resolveWriterId({
        graphName: 'g',
        explicitWriterId: undefined,
        configGet: async () => 'a..b', // Invalid due to ..
        configSet: async (_k, v) => { stored = v; },
      });
      expect(id).toMatch(/^w_[0-9a-hjkmnp-tv-z]{26}$/);
      expect(stored).toBe(id);
    });

    it('regenerates if config value is empty', async () => {
      let stored;
      const id = await resolveWriterId({
        graphName: 'g',
        explicitWriterId: undefined,
        configGet: async () => '', // Invalid: empty
        configSet: async (_k, v) => { stored = v; },
      });
      expect(id).toMatch(/^w_[0-9a-hjkmnp-tv-z]{26}$/);
      expect(stored).toBe(id);
    });

    it('generates and persists new ID when config is missing', async () => {
      let stored;
      let storedKey;
      const id = await resolveWriterId({
        graphName: 'events',
        explicitWriterId: undefined,
        configGet: async () => null,
        configSet: async (k, v) => { storedKey = k; stored = v; },
      });
      expect(id).toMatch(/^w_[0-9a-hjkmnp-tv-z]{26}$/);
      expect(stored).toBe(id);
      expect(storedKey).toBe('warp.writerId.events');
    });

    it('throws CONFIG_READ_FAILED if configGet throws and no explicit writerId', async () => {
      await expect(resolveWriterId({
        graphName: 'g',
        explicitWriterId: undefined,
        configGet: async () => { throw new Error('nope'); },
        configSet: async () => {},
      })).rejects.toMatchObject({ code: 'CONFIG_READ_FAILED' });
    });

    it('includes cause in CONFIG_READ_FAILED error', async () => {
      const cause = new Error('disk full');
      try {
        await resolveWriterId({
          graphName: 'g',
          explicitWriterId: undefined,
          configGet: async () => { throw cause; },
          configSet: async () => {},
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e.cause).toBe(cause);
      }
    });

    it('throws CONFIG_WRITE_FAILED if cannot persist generated id', async () => {
      await expect(resolveWriterId({
        graphName: 'g',
        explicitWriterId: undefined,
        configGet: async () => null,
        configSet: async () => { throw new Error('permission denied'); },
      })).rejects.toMatchObject({ code: 'CONFIG_WRITE_FAILED' });
    });

    it('includes cause in CONFIG_WRITE_FAILED error', async () => {
      const cause = new Error('read-only filesystem');
      try {
        await resolveWriterId({
          graphName: 'g',
          explicitWriterId: undefined,
          configGet: async () => null,
          configSet: async () => { throw cause; },
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e.cause).toBe(cause);
      }
    });
  });

  describe('WriterIdError', () => {
    it('has correct name and code properties', () => {
      const err = new WriterIdError('TEST_CODE', 'test message');
      expect(err.name).toBe('WriterIdError');
      expect(err.code).toBe('TEST_CODE');
      expect(err.message).toBe('test message');
    });

    it('preserves cause', () => {
      const cause = new Error('original');
      const err = new WriterIdError('WRAPPED', 'wrapped error', cause);
      expect(err.cause).toBe(cause);
    });

    it('is instanceof Error', () => {
      const err = new WriterIdError('CODE', 'msg');
      expect(err instanceof Error).toBe(true);
      expect(err instanceof WriterIdError).toBe(true);
    });
  });

  describe('ref-safety compatibility', () => {
    // These tests verify generated IDs work with existing validateWriterId

    it('generated IDs pass ref-safe validation', () => {
      for (let i = 0; i < 100; i++) {
        const id = generateWriterId({ randomBytes: seededRandomBytes(i) });
        expect(() => validateWriterId(id)).not.toThrow();
      }
    });

    it('generated IDs are within max length (64)', () => {
      const id = generateWriterId();
      expect(id.length).toBeLessThanOrEqual(64);
      expect(id.length).toBe(28); // Exactly 28 chars
    });

    it('generated IDs contain only ref-safe characters', () => {
      const id = generateWriterId();
      // ref-safe: [A-Za-z0-9._-]
      expect(id).toMatch(/^[A-Za-z0-9._-]+$/);
    });
  });
});
