import { describe, it, expect } from 'vitest';
import CryptoPort from '../../../src/ports/CryptoPort.js';
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.js';

describe('CryptoPort', () => {
  it('throws on direct call to hash()', () => {
    const port = new CryptoPort();
    expect(() => port.hash('sha256', 'data')).toThrow('not implemented');
  });

  it('throws on direct call to hmac()', () => {
    const port = new CryptoPort();
    expect(() => port.hmac('sha256', 'key', 'data')).toThrow('not implemented');
  });

  it('throws on direct call to timingSafeEqual()', () => {
    const port = new CryptoPort();
    expect(() => port.timingSafeEqual(Buffer.from('a'), Buffer.from('b'))).toThrow('not implemented');
  });
});

describe('NodeCryptoAdapter', () => {
  const adapter = new NodeCryptoAdapter();

  it('is an instance of CryptoPort', () => {
    expect(adapter).toBeInstanceOf(CryptoPort);
  });

  it('hash("sha1", "hello") matches known digest', () => {
    const digest = adapter.hash('sha1', 'hello');
    expect(digest).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
  });

  it('hash("sha256", "hello") matches known digest', () => {
    const digest = adapter.hash('sha256', 'hello');
    expect(digest).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('hash with empty input', () => {
    const digest = adapter.hash('sha256', '');
    expect(digest).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hmac round-trip matches crypto.createHmac', async () => {
    const { createHmac } = await import('node:crypto');
    const key = 'secret';
    const data = 'hello world';
    const expected = createHmac('sha256', key).update(data).digest();
    const actual = adapter.hmac('sha256', key, data);
    expect(Buffer.compare(actual, expected)).toBe(0);
  });

  it('timingSafeEqual returns true for matching buffers', () => {
    const a = Buffer.from('test-data');
    const b = Buffer.from('test-data');
    expect(adapter.timingSafeEqual(a, b)).toBe(true);
  });

  it('timingSafeEqual returns false for non-matching buffers', () => {
    const a = Buffer.from('test-data');
    const b = Buffer.from('diff-data');
    expect(adapter.timingSafeEqual(a, b)).toBe(false);
  });
});
