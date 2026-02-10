import { describe, it, expect } from 'vitest';
import defaultCrypto from '../../../../src/domain/utils/defaultCrypto.js';

describe('defaultCrypto', () => {
  describe('hash', () => {
    it('returns expected sha256 hex digest', async () => {
      const result = await defaultCrypto.hash('sha256', 'hello');
      expect(result).toBe(
        '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
      );
    });

    it('returns a string', async () => {
      const result = await defaultCrypto.hash('sha256', 'test-data');
      expect(typeof result).toBe('string');
    });

    it('produces different hashes for different inputs', async () => {
      const a = await defaultCrypto.hash('sha256', 'alpha');
      const b = await defaultCrypto.hash('sha256', 'beta');
      expect(a).not.toBe(b);
    });

    it('returns consistent results for the same input', async () => {
      const first = await defaultCrypto.hash('sha256', 'deterministic');
      const second = await defaultCrypto.hash('sha256', 'deterministic');
      expect(first).toBe(second);
    });
  });

  describe('hmac', () => {
    it('returns a Buffer', async () => {
      const result = await defaultCrypto.hmac('sha256', 'secret-key', 'data');
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('produces different results for different keys', async () => {
      const a = /** @type {any} */ (await defaultCrypto.hmac('sha256', 'key-1', 'same-data'));
      const b = /** @type {any} */ (await defaultCrypto.hmac('sha256', 'key-2', 'same-data'));
      expect(a.equals(b)).toBe(false);
    });

    it('produces consistent results', async () => {
      const first = /** @type {any} */ (await defaultCrypto.hmac('sha256', 'key', 'data'));
      const second = /** @type {any} */ (await defaultCrypto.hmac('sha256', 'key', 'data'));
      expect(first.equals(second)).toBe(true);
    });
  });

  describe('timingSafeEqual', () => {
    it('returns true for equal buffers', () => {
      const a = Buffer.from('identical');
      const b = Buffer.from('identical');
      expect(defaultCrypto.timingSafeEqual(a, b)).toBe(true);
    });

    it('returns false for unequal buffers of same length', () => {
      const a = Buffer.from('aaaabbbb');
      const b = Buffer.from('ccccdddd');
      expect(defaultCrypto.timingSafeEqual(a, b)).toBe(false);
    });

    it('throws for buffers of different lengths', () => {
      const a = Buffer.from('short');
      const b = Buffer.from('much longer');
      expect(() => defaultCrypto.timingSafeEqual(a, b)).toThrow();
    });
  });
});
