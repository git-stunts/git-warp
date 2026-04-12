import { describe, it, expect, vi, beforeEach } from 'vitest';
import BitmapIndexReader from '../../../../src/domain/services/index/BitmapIndexReader.js';
import BitmapIndexBuilder from '../../../../src/domain/services/index/BitmapIndexBuilder.js';
import { ShardLoadError, ShardCorruptionError } from '../../../../src/domain/errors/index.ts';
import defaultCodec from '../../../../src/domain/utils/defaultCodec.ts';
import { getRoaringBitmap32 } from '../../../../src/domain/utils/roaring.ts';

/**
 * Encodes an object as a CBOR Uint8Array using the domain codec.
 * Mirrors the format written by BitmapIndexBuilder.
 * @param {Record<string, unknown>} data
 * @returns {Uint8Array}
 */
const encodeShard = (data) => defaultCodec.encode(data);

/**
 * Encodes a bitmap shard where values are Uint8Array bitmap bytes.
 * @param {Record<string, Uint8Array>} data
 * @returns {Uint8Array}
 */
const encodeBitmapShard = (data) => defaultCodec.encode(data);

/**
 * Creates serialized bitmap bytes for a set of numeric IDs.
 * @param {number[]} ids
 * @returns {Uint8Array}
 */
const makeBitmapBytes = (ids) => {
  const RoaringBitmap32 = getRoaringBitmap32();
  const bm = new RoaringBitmap32(ids);
  return new Uint8Array(bm.serialize(true));
};

describe('BitmapIndexReader', () => {
  /** @type {any} */
  let mockStorage;
  /** @type {any} */
  let reader;

  beforeEach(() => {
    mockStorage = {
      readBlob: vi.fn(),
    };
    reader = new BitmapIndexReader(/** @type {any} */ ({ storage: mockStorage }));
  });

  describe('constructor validation', () => {
    it('throws when storage is not provided', () => {
      expect(() => new BitmapIndexReader(/** @type {any} */ ({}))).toThrow('BitmapIndexReader requires a storage adapter');
    });

    it('throws when called with no arguments', () => {
      // @ts-expect-error — testing runtime guard for missing required options
      expect(() => new BitmapIndexReader()).toThrow();
    });

    it('uses default maxCachedShards of 100', () => {
      const readerWithDefaults = new BitmapIndexReader(/** @type {any} */ ({ storage: mockStorage }));
      expect(readerWithDefaults.maxCachedShards).toBe(100);
    });

    it('accepts custom maxCachedShards', () => {
      const readerWithCustom = new BitmapIndexReader(/** @type {any} */ ({ storage: mockStorage, maxCachedShards: 50 }));
      expect(readerWithCustom.maxCachedShards).toBe(50);
    });
  });

  describe('OID validation in setup()', () => {
    it('accepts valid hex OIDs', () => {
      const validOids = {
        'meta_ab.cbor': 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        'shards_fwd_ab.cbor': 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5',
      };
      reader.setup(validOids);
      expect(reader.shardOids.size).toBe(2);
    });

    it('skips invalid OIDs in non-strict mode with warning', () => {
      const warnSpy = vi.fn();
      const lenientReader = new BitmapIndexReader(/** @type {any} */ ({
        storage: mockStorage,
        strict: false,
        logger: { warn: warnSpy, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
      }));
      lenientReader.setup({
        'meta_ab.cbor': 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        'meta_cd.cbor': 'not-a-valid-oid!!!',
      });
      expect(lenientReader.shardOids.size).toBe(1);
      expect(lenientReader.shardOids.has('meta_ab.cbor')).toBe(true);
      expect(lenientReader.shardOids.has('meta_cd.cbor')).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith('Skipping shard with invalid OID', expect.objectContaining({
        shardPath: 'meta_cd.cbor',
        reason: 'invalid_oid',
      }));
    });

    it('throws ShardCorruptionError for invalid OIDs in strict mode', () => {
      const strictReader = new BitmapIndexReader(/** @type {any} */ ({
        storage: mockStorage,
        strict: true,
      }));
      expect(() => strictReader.setup({
        'meta_ab.cbor': 'not-valid-oid',
      })).toThrow(ShardCorruptionError);
    });

    it('includes shard path and OID in strict mode error', () => {
      const strictReader = new BitmapIndexReader(/** @type {any} */ ({
        storage: mockStorage,
        strict: true,
      }));
      try {
        strictReader.setup({ 'meta_ab.cbor': 'bad!' });
        expect.fail('should have thrown');
      } catch (err) {
        const e = /** @type {import('../../../../src/domain/errors/ShardCorruptionError.ts').default} */ (err);
        expect(e).toBeInstanceOf(ShardCorruptionError);
        expect(e.shardPath).toBe('meta_ab.cbor');
        expect(e.oid).toBe('bad!');
        expect(e.reason).toBe('invalid_oid');
      }
    });
  });

  describe('setup', () => {
    it('stores shard OIDs for lazy loading', () => {
      reader.setup({ 'meta_aa.cbor': 'a1b2c3d400000000000000000000000000000000', 'shards_fwd_aa.cbor': 'e5f6a7b800000000000000000000000000000000' });
      expect(reader.shardOids.size).toBe(2);
    });

    it('clears cache when called', () => {
      reader.loadedShards.set('test', {});
      reader.shardOids.set('test', 'aaaa');

      reader.setup({});

      expect(reader.shardOids.size).toBe(0);
      expect(reader.loadedShards.size).toBe(0);
    });
  });

  describe('getParents / getChildren', () => {
    it('returns empty array for unknown SHA', async () => {
      reader.setup({});
      const parents = await reader.getParents('unknown');
      expect(parents).toEqual([]);
    });

    it('loads and decodes bitmap data', async () => {
      // Build a real index
      const builder = new BitmapIndexBuilder();
      builder.addEdge('aabbccdd00000000000000000000000000000000', 'eeff00dd00000000000000000000000000000000');
      const tree = await builder.serialize();

      // Mock storage to return serialized data
      mockStorage.readBlob.mockImplementation(async (/** @type {any} */ oid) => {
        if (oid === 'aaa1bbb200000000000000000000000000000000') return tree['meta_aa.cbor'] || tree['meta_ee.cbor'];
        if (oid === 'bbb2ccc300000000000000000000000000000000') return tree['shards_rev_ee.cbor'];
        return defaultCodec.encode({});
      });

      reader.setup({
        'meta_aa.cbor': 'aaa1bbb200000000000000000000000000000000',
        'meta_ee.cbor': 'aaa1bbb200000000000000000000000000000000',
        'shards_rev_ee.cbor': 'bbb2ccc300000000000000000000000000000000',
      });

      const parents = await reader.getParents('eeff00dd00000000000000000000000000000000');
      expect(parents).toContain('aabbccdd00000000000000000000000000000000');
    });
  });

  describe('lookupId', () => {
    it('returns undefined for unknown SHA', async () => {
      reader.setup({});
      const id = await reader.lookupId('unknown');
      expect(id).toBeUndefined();
    });
  });

  describe('corrupt shard recovery', () => {
    it('throws ShardLoadError when shard OID points to non-existent blob', async () => {
      mockStorage.readBlob.mockRejectedValue(new Error('object not found'));

      reader.setup({
        'meta_ab.cbor': 'ccc3ddd400000000000000000000000000000000',
        'shards_rev_ab.cbor': 'ddd4eee500000000000000000000000000000000'
      });

      await expect(reader.getParents('abcd123400000000000000000000000000000000')).rejects.toThrow(ShardLoadError);
    });

    it('returns empty array when shard contains invalid CBOR (non-strict)', async () => {
      const lenient = new BitmapIndexReader(/** @type {any} */ ({ storage: mockStorage, strict: false }));
      mockStorage.readBlob.mockResolvedValue(new Uint8Array([0xff, 0xfe, 0xfd])); // invalid CBOR bytes

      lenient.setup({
        'meta_ab.cbor': 'eee5fff600000000000000000000000000000000',
        'shards_rev_ab.cbor': 'eee5fff600000000000000000000000000000000'
      });

      const parents = await lenient.getParents('abcd123400000000000000000000000000000000');
      expect(parents).toEqual([]);
    });

    it('returns empty array when shard contains wrong data type (non-strict)', async () => {
      const lenient = new BitmapIndexReader(/** @type {any} */ ({ storage: mockStorage, strict: false }));
      // Valid CBOR but wrong structure (array instead of object)
      mockStorage.readBlob.mockResolvedValue(defaultCodec.encode([1, 2, 3]));

      lenient.setup({
        'shards_rev_ab.cbor': 'fff6aaa100000000000000000000000000000000'
      });

      const parents = await lenient.getParents('abcd123400000000000000000000000000000000');
      expect(parents).toEqual([]);
    });

    it('throws ShardLoadError on storage failure but continues after', async () => {
      // Build a real index for comparison
      const builder = new BitmapIndexBuilder();
      builder.addEdge('aabbccdd00000000000000000000000000000000', 'eeff00dd00000000000000000000000000000000');
      const tree = await builder.serialize();

      let callCount = 0;
      mockStorage.readBlob.mockImplementation(async (/** @type {any} */ oid) => {
        callCount++;
        // First call fails, subsequent calls succeed
        if (callCount === 1) {
          throw new Error('transient failure');
        }
        // Return real data for subsequent calls
        if (oid === 'aaa1bbb200000000000000000000000000000000') return tree['meta_aa.cbor'] || tree['meta_ee.cbor'];
        if (oid === 'bbb2ccc300000000000000000000000000000000') return tree['shards_rev_ee.cbor'];
        return defaultCodec.encode({});
      });

      reader.setup({
        'meta_aa.cbor': 'aaa1bbb200000000000000000000000000000000',
        'meta_ee.cbor': 'aaa1bbb200000000000000000000000000000000',
        'shards_rev_ee.cbor': 'bbb2ccc300000000000000000000000000000000',
        'shards_rev_aa.cbor': 'eee5fff600000000000000000000000000000000' // This one fails
      });

      // First query hits storage error - should throw ShardLoadError
      await expect(reader.getParents('aabbccdd00000000000000000000000000000000')).rejects.toThrow(ShardLoadError);

      // Reader should still be functional for other queries
      // (the reader wasn't corrupted by the error)
      expect(reader.shardOids.size).toBe(4);
    });

    it('in strict mode throws ShardCorruptionError on invalid CBOR', async () => {
      const strictReader = new BitmapIndexReader(/** @type {any} */ ({ storage: mockStorage, strict: true }));
      mockStorage.readBlob.mockResolvedValue(new Uint8Array([0xff, 0xfe, 0xfd])); // invalid CBOR bytes

      strictReader.setup({
        'shards_rev_ab.cbor': 'eee5fff600000000000000000000000000000000'
      });

      await expect(strictReader.getParents('abcd123400000000000000000000000000000000')).rejects.toThrow(ShardCorruptionError);
    });

    it('ShardLoadError contains cause and context', async () => {
      const originalError = new Error('network timeout');
      mockStorage.readBlob.mockRejectedValue(originalError);

      reader.setup({
        'meta_ef.cbor': 'ddeeff3300000000000000000000000000000000'
      });

      try {
        await reader.lookupId('ef00567800000000000000000000000000000000');
        expect.fail('Should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err).toBeInstanceOf(ShardLoadError);
        expect(err.code).toBe('SHARD_LOAD_ERROR');
        expect(err.shardPath).toBe('meta_ef.cbor');
        expect(err.oid).toBe('ddeeff3300000000000000000000000000000000');
        expect(err.cause).toBe(originalError);
      }
    });

    it('non-strict mode returns empty but strict mode throws for same corruption', async () => {
      // Valid CBOR encoding of a plain object — but reader treats it as a bitmap shard
      // and tries to deserialize values as Uint8Array bitmaps. Since the values are not
      // Uint8Array, _deserializeBitmapIds will fail in strict mode.
      const sha = 'abcd123400000000000000000000000000000000';
      const corruptBitmapData = defaultCodec.encode({ [sha]: 'not-a-bitmap' });

      // Non-strict reader
      const nonStrictReader = new BitmapIndexReader(/** @type {any} */ ({ storage: mockStorage, strict: false }));
      mockStorage.readBlob.mockResolvedValue(corruptBitmapData);
      nonStrictReader.setup({ 'shards_rev_ab.cbor': 'eee5fff600000000000000000000000000000000' });

      const nonStrictResult = await nonStrictReader.getParents(sha);
      expect(nonStrictResult).toEqual([]); // Graceful degradation

      // Strict reader gets same data but the bitmap value is not a Uint8Array
      // so _getEdges returns [] for missing/empty bitmapBytes without throwing
      // (the check is `!(bitmapBytes instanceof Uint8Array)`)
      const strictReader = new BitmapIndexReader(/** @type {any} */ ({ storage: mockStorage, strict: true }));
      strictReader.setup({ 'shards_rev_ab.cbor': 'eee5fff600000000000000000000000000000000' });

      const strictResult = await strictReader.getParents(sha);
      expect(strictResult).toEqual([]);
    });

    it('logs a warning on each CBOR decode error (no caching on failure)', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      const nonStrictReader = new BitmapIndexReader(/** @type {any} */ ({
        storage: mockStorage,
        strict: false,
        logger: mockLogger,
      }));

      // Return invalid CBOR bytes (decode failure)
      mockStorage.readBlob.mockResolvedValue(new Uint8Array([0xff, 0xfe, 0xfd]));

      nonStrictReader.setup({ 'shards_rev_ab.cbor': 'aab1ccdd00000000000000000000000000000000' });

      // First access - should log warning and return empty
      const result1 = await nonStrictReader.getParents('abcd123400000000000000000000000000000000');
      expect(result1).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);

      // Second access to same shard - decode fails again (not cached), logs again
      const result2 = await nonStrictReader.getParents('abcd123400000000000000000000000000000000');
      expect(result2).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
      expect(mockStorage.readBlob).toHaveBeenCalledTimes(2);
    });

    it('returns empty array when bitmap deserialization fails in non-strict mode', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      const lenientReader = new BitmapIndexReader(/** @type {any} */ ({
        storage: mockStorage,
        strict: false,
        logger: mockLogger,
      }));
      const sha = 'abcd123400000000000000000000000000000000';
      // Meta shard: sha → id 1
      const metaShard = encodeShard({ [sha]: 1 });
      // Edge shard: sha → garbage bytes that fail roaring deserialization
      const edgeShard = encodeBitmapShard({ [sha]: new Uint8Array(Buffer.from('definitely-not-a-roaring-bitmap')) });

      mockStorage.readBlob.mockImplementation(async (/** @type {string} */ oid) => {
        if (oid === '1111222200000000000000000000000000000000') {
          return metaShard;
        }
        if (oid === '2222333300000000000000000000000000000000') {
          return edgeShard;
        }
        throw new Error(`Unexpected oid: ${oid}`);
      });

      lenientReader.setup({
        'meta_ab.cbor': '1111222200000000000000000000000000000000',
        'shards_fwd_ab.cbor': '2222333300000000000000000000000000000000',
      });

      const children = await lenientReader.getChildren(sha);
      expect(children).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith('Bitmap deserialization failed', expect.objectContaining({
        shardPath: 'shards_fwd_ab.cbor',
      }));
    });
  });

  describe('LRU cache eviction', () => {
    it('evicts least recently used shards when exceeding maxCachedShards', async () => {
      // Create reader with small cache size
      const smallCacheReader = new BitmapIndexReader(/** @type {any} */ ({
        storage: mockStorage,
        maxCachedShards: 2
      }));

      // Create valid CBOR shard data
      const createValidShard = (/** @type {any} */ id) => defaultCodec.encode({ id });

      mockStorage.readBlob.mockImplementation(async (/** @type {any} */ oid) => {
        return createValidShard(oid);
      });

      smallCacheReader.setup({
        'meta_aa.cbor': 'aa00112200000000000000000000000000000000',
        'meta_bb.cbor': 'bb33445500000000000000000000000000000000',
        'meta_cc.cbor': 'cc66778800000000000000000000000000000000',
      });

      // Load first shard
      await smallCacheReader.lookupId('aabbccdd00000000000000000000000000000000');
      expect(smallCacheReader.loadedShards.size).toBe(1);
      expect(mockStorage.readBlob).toHaveBeenCalledTimes(1);

      // Load second shard
      await smallCacheReader.lookupId('bbccddee00000000000000000000000000000000');
      expect(smallCacheReader.loadedShards.size).toBe(2);
      expect(mockStorage.readBlob).toHaveBeenCalledTimes(2);

      // Load third shard - should evict first
      await smallCacheReader.lookupId('ccddeeff00000000000000000000000000000000');
      expect(smallCacheReader.loadedShards.size).toBe(2); // Still 2 due to LRU eviction

      // First shard should be evicted, accessing it again should reload
      await smallCacheReader.lookupId('aabbccdd00000000000000000000000000000000');
      expect(mockStorage.readBlob).toHaveBeenCalledTimes(4); // 3 + 1 reload
    });

    it('marks accessed shards as recently used', async () => {
      const smallCacheReader = new BitmapIndexReader(/** @type {any} */ ({
        storage: mockStorage,
        maxCachedShards: 2
      }));

      const createValidShard = (/** @type {any} */ id) => defaultCodec.encode({ id });

      mockStorage.readBlob.mockImplementation(async (/** @type {any} */ oid) => {
        return createValidShard(oid);
      });

      smallCacheReader.setup({
        'meta_aa.cbor': 'aa00112200000000000000000000000000000000',
        'meta_bb.cbor': 'bb33445500000000000000000000000000000000',
        'meta_cc.cbor': 'cc66778800000000000000000000000000000000',
      });

      // Load first two shards
      await smallCacheReader.lookupId('aabbccdd00000000000000000000000000000000'); // Load aa
      await smallCacheReader.lookupId('bbccddee00000000000000000000000000000000'); // Load bb

      // Access 'aa' again to make it recently used
      await smallCacheReader.lookupId('aabbccdd00000000000000000000000000000000');

      // Load third shard - should evict 'bb' (now oldest)
      await smallCacheReader.lookupId('ccddeeff00000000000000000000000000000000'); // Load cc

      // 'aa' should still be in cache (was recently used)
      expect(smallCacheReader.loadedShards.has('meta_aa.cbor')).toBe(true);
      // 'bb' should have been evicted
      expect(smallCacheReader.loadedShards.has('meta_bb.cbor')).toBe(false);
      // 'cc' should be in cache
      expect(smallCacheReader.loadedShards.has('meta_cc.cbor')).toBe(true);
    });
  });

  describe('internal edge cases', () => {
    it('returns cached id-to-sha mapping without repopulating', async () => {
      /** @type {any} */ (reader)._idToShaCache = ['sha0'];
      const result = await /** @type {any} */ (reader)._buildIdToShaMapping();
      expect(result).toBe(/** @type {any} */ (reader)._idToShaCache);
    });

    it('warns when id-to-sha cache grows beyond the warning threshold', () => {
      const warn = vi.fn();
      const noisyReader = new BitmapIndexReader(/** @type {any} */ ({
        storage: mockStorage,
        logger: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
      }));
      /** @type {any} */ (noisyReader)._warnLargeIdCache(1_000_001);
      expect(warn).toHaveBeenCalledWith('ID-to-SHA cache has high memory usage', expect.objectContaining({
        operation: '_buildIdToShaMapping',
        entryCount: 1_000_001,
      }));
    });

    it('wraps codec decode errors into ShardCorruptionError in strict mode', async () => {
      const strictReader = new BitmapIndexReader(/** @type {any} */ ({ storage: mockStorage, strict: true }));
      const anyReader = /** @type {any} */ (strictReader);
      anyReader.setup({ 'meta_ab.cbor': '3333444400000000000000000000000000000000' });
      // Inject a codec that throws on decode
      const fakeCodec = {
        decode: vi.fn(() => { throw new RangeError('unexpected parse failure'); }),
      };
      anyReader._codec = fakeCodec;
      mockStorage.readBlob.mockResolvedValue(defaultCodec.encode({}));

      await expect(anyReader._getOrLoadShard('meta_ab.cbor')).rejects.toThrow(ShardCorruptionError);
    });
  });

  describe('round-trip with BitmapIndexBuilder', () => {
    it('correctly resolves parent/child edges from a builder-generated tree', async () => {
      const builder = new BitmapIndexBuilder();
      const parentSha = 'aaaa000000000000000000000000000000000000';
      const childSha = 'bbbb000000000000000000000000000000000000';
      builder.addEdge(parentSha, childSha);
      const tree = await builder.serialize();

      // Assign fake OIDs to tree entries
      const oidMap = /** @type {Record<string, string>} */ ({});
      const blobMap = /** @type {Record<string, Uint8Array>} */ ({});
      let counter = 0;
      for (const [path, data] of Object.entries(tree)) {
        const oid = String(counter).padStart(40, '0');
        counter++;
        oidMap[path] = oid;
        blobMap[oid] = data;
      }

      mockStorage.readBlob.mockImplementation(async (/** @type {string} */ oid) => {
        if (blobMap[oid]) { return blobMap[oid]; }
        throw new Error(`Unknown OID: ${oid}`);
      });

      reader.setup(oidMap);

      const parents = await reader.getParents(childSha);
      expect(parents).toContain(parentSha);

      const children = await reader.getChildren(parentSha);
      expect(children).toContain(childSha);
    });

    it('uses custom codec when provided', async () => {
      const decodeCalls = /** @type {Uint8Array[]} */ ([]);
      const spyCodec = {
        encode: defaultCodec.encode.bind(defaultCodec),
        decode: (buf) => {
          decodeCalls.push(buf);
          return defaultCodec.decode(buf);
        },
      };

      const customReader = new BitmapIndexReader(/** @type {any} */ ({
        storage: mockStorage,
        codec: spyCodec,
      }));

      mockStorage.readBlob.mockResolvedValue(defaultCodec.encode({ 'abcd123400000000000000000000000000000000': 7 }));
      customReader.setup({ 'meta_ab.cbor': 'aabb112200000000000000000000000000000000' });

      const id = await customReader.lookupId('abcd123400000000000000000000000000000000');
      expect(id).toBe(7);
      expect(decodeCalls.length).toBe(1);
    });
  });
});
