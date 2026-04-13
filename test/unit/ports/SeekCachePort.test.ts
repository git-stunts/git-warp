import { describe, it, expect } from 'vitest';
import SeekCachePort, {
  type SeekCacheEntry,
  type SeekCacheSetOptions,
} from '../../../src/ports/SeekCachePort.ts';

describe('SeekCachePort', () => {
  it('abstract methods are not callable on base prototype', () => {
    expect(SeekCachePort.prototype.get).toBeUndefined();
    expect(SeekCachePort.prototype.set).toBeUndefined();
    expect(SeekCachePort.prototype.has).toBeUndefined();
    expect(SeekCachePort.prototype.keys).toBeUndefined();
    expect(SeekCachePort.prototype.delete).toBeUndefined();
    expect(SeekCachePort.prototype.clear).toBeUndefined();
  });

  it('concrete subclass satisfies the contract', async () => {
    class TestCache extends SeekCachePort {
      async get(_key: string): Promise<SeekCacheEntry | null> { return null; }
      async set(_key: string, _buffer: Uint8Array, _options?: SeekCacheSetOptions) { /* no-op */ }
      async has(_key: string) { return false; }
      async keys() { return []; }
      async delete(_key: string) { return false; }
      async clear() { /* no-op */ }
    }
    const cache = new TestCache();
    expect(cache).toBeInstanceOf(SeekCachePort);
    expect(await cache.get('key')).toBeNull();
    expect(await cache.keys()).toEqual([]);
  });
});
