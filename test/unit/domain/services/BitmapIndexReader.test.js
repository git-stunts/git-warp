import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import BitmapIndexReader from '../../../../src/domain/services/BitmapIndexReader.js';
import BitmapIndexBuilder, { SHARD_VERSION } from '../../../../src/domain/services/BitmapIndexBuilder.js';
import { ShardLoadError, ShardCorruptionError, ShardValidationError } from '../../../../src/domain/errors/index.js';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.js';

const crypto = new NodeCryptoAdapter();

/**
 * Creates a v1 shard envelope using JSON.stringify for checksum (legacy format).
 */
const createV1Shard = (/** @type {any} */ data) => ({
  version: 1,
  checksum: createHash('sha256').update(JSON.stringify(data)).digest('hex'),
  data,
});

/**
 * Produces a canonical JSON string with deterministic key ordering.
 * Mirrors the canonicalStringify function used in BitmapIndexBuilder.
 */
/** @type {(obj: any) => string} */
const canonicalStringify = (obj) => {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}';
};

/**
 * Creates a v2 shard envelope using canonicalStringify for checksum (current format).
 */
const createV2Shard = (/** @type {any} */ data) => ({
  version: 2,
  checksum: createHash('sha256').update(canonicalStringify(data)).digest('hex'),
  data,
});

describe('BitmapIndexReader', () => {
  /** @type {any} */
  /** @type {any} */
  let mockStorage;
  /** @type {any} */
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
      expect(() => new BitmapIndexReader()).toThrow('BitmapIndexReader requires a storage adapter');
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

  describe('setup', () => {
    it('stores shard OIDs for lazy loading', () => {
      reader.setup({ 'meta_aa.json': 'oid1', 'shards_fwd_aa.json': 'oid2' });
      expect(reader.shardOids.size).toBe(2);
    });

    it('clears cache when called', () => {
      reader._idToShaCache = ['test'];
      reader.loadedShards.set('test', {});

      reader.setup({});

      expect(reader._idToShaCache).toBeNull();
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
      builder.addEdge('aabbccdd', 'eeffgghh');
      const tree = await builder.serialize();

      // Mock storage to return serialized data
      mockStorage.readBlob.mockImplementation(async (/** @type {any} */ oid) => {
        if (oid === 'meta-oid') return tree['meta_aa.json'] || tree['meta_ee.json'];
        if (oid === 'rev-oid') return tree['shards_rev_ee.json'];
        return Buffer.from('{}');
      });

      reader.setup({
        'meta_aa.json': 'meta-oid',
        'meta_ee.json': 'meta-oid',
        'shards_rev_ee.json': 'rev-oid',
      });

      const parents = await reader.getParents('eeffgghh');
      expect(parents).toContain('aabbccdd');
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
        'meta_ab.json': 'nonexistent-oid',
        'shards_rev_ab.json': 'also-nonexistent'
      });

      await expect(reader.getParents('abcd1234')).rejects.toThrow(ShardLoadError);
    });

    it('returns empty array when shard contains invalid JSON', async () => {
      mockStorage.readBlob.mockResolvedValue(Buffer.from('not valid json {{{'));

      reader.setup({
        'meta_ab.json': 'corrupt-oid',
        'shards_rev_ab.json': 'corrupt-oid'
      });

      const parents = await reader.getParents('abcd1234');
      expect(parents).toEqual([]);
    });

    it('returns empty array when shard contains wrong data type', async () => {
      // Valid JSON but wrong structure (array instead of object)
      mockStorage.readBlob.mockResolvedValue(Buffer.from('[1,2,3]'));

      reader.setup({
        'shards_rev_ab.json': 'wrong-type-oid'
      });

      const parents = await reader.getParents('abcd1234');
      expect(parents).toEqual([]);
    });

    it('throws ShardLoadError on storage failure but continues after', async () => {
      // Build a real index for comparison
      const builder = new BitmapIndexBuilder();
      builder.addEdge('aabbccdd', 'eeffgghh');
      const tree = await builder.serialize();

      let callCount = 0;
      mockStorage.readBlob.mockImplementation(async (/** @type {any} */ oid) => {
        callCount++;
        // First call fails, subsequent calls succeed
        if (callCount === 1) {
          throw new Error('transient failure');
        }
        // Return real data for subsequent calls
        if (oid === 'meta-oid') return tree['meta_aa.json'] || tree['meta_ee.json'];
        if (oid === 'rev-oid') return tree['shards_rev_ee.json'];
        return Buffer.from('{}');
      });

      reader.setup({
        'meta_aa.json': 'meta-oid',
        'meta_ee.json': 'meta-oid',
        'shards_rev_ee.json': 'rev-oid',
        'shards_rev_aa.json': 'corrupt-oid' // This one fails
      });

      // First query hits storage error - should throw ShardLoadError
      await expect(reader.getParents('aabbccdd')).rejects.toThrow(ShardLoadError);

      // Reader should still be functional for other queries
      // (the reader wasn't corrupted by the error)
      expect(reader.shardOids.size).toBe(4);
    });

    it('in strict mode throws ShardValidationError on version mismatch', async () => {
      const strictReader = new BitmapIndexReader(/** @type {any} */ ({ storage: mockStorage, strict: true }));
      mockStorage.readBlob.mockResolvedValue(Buffer.from(JSON.stringify({
        version: 999, // Wrong version
        checksum: 'abc',
        data: {}
      })));

      strictReader.setup({
        'shards_rev_ab.json': 'bad-version-oid'
      });

      await expect(strictReader.getParents('abcd1234')).rejects.toThrow(ShardValidationError);
    });

    it('in strict mode throws ShardCorruptionError on invalid format', async () => {
      const strictReader = new BitmapIndexReader(/** @type {any} */ ({ storage: mockStorage, strict: true }));
      mockStorage.readBlob.mockResolvedValue(Buffer.from('not valid json {{{'));

      strictReader.setup({
        'shards_rev_ab.json': 'corrupt-oid'
      });

      await expect(strictReader.getParents('abcd1234')).rejects.toThrow(ShardCorruptionError);
    });

    it('in strict mode throws ShardValidationError on checksum mismatch', async () => {
      const strictReader = new BitmapIndexReader(/** @type {any} */ ({ storage: mockStorage, strict: true, crypto }));
      mockStorage.readBlob.mockResolvedValue(Buffer.from(JSON.stringify({
        version: 1,
        checksum: 'wrong-checksum-value',
        data: { someKey: 'someValue' }
      })));

      strictReader.setup({
        'meta_ab.json': 'bad-checksum-oid'
      });

      await expect(strictReader.lookupId('abcd1234')).rejects.toThrow(ShardValidationError);
    });

    it('error objects contain useful context for debugging', async () => {
      const strictReader = new BitmapIndexReader(/** @type {any} */ ({ storage: mockStorage, strict: true }));
      mockStorage.readBlob.mockResolvedValue(Buffer.from(JSON.stringify({
        version: 999,
        checksum: 'abc',
        data: {}
      })));

      strictReader.setup({
        'shards_fwd_cd.json': 'context-test-oid'
      });

      try {
        await strictReader.getChildren('cdcd1234');
        expect.fail('Should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err).toBeInstanceOf(ShardValidationError);
        expect(err.code).toBe('SHARD_VALIDATION_ERROR');
        expect(err.field).toBe('version');
        expect(err.expected).toEqual([1, 2]);
        expect(err.actual).toBe(999);
        expect(err.shardPath).toBe('shards_fwd_cd.json');
      }
    });

    it('ShardLoadError contains cause and context', async () => {
      const originalError = new Error('network timeout');
      mockStorage.readBlob.mockRejectedValue(originalError);

      reader.setup({
        'meta_ef.json': 'network-fail-oid'
      });

      try {
        await reader.lookupId('efgh5678');
        expect.fail('Should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err).toBeInstanceOf(ShardLoadError);
        expect(err.code).toBe('SHARD_LOAD_ERROR');
        expect(err.shardPath).toBe('meta_ef.json');
        expect(err.oid).toBe('network-fail-oid');
        expect(err.cause).toBe(originalError);
      }
    });

    it('non-strict mode returns empty but strict mode throws for same corruption', async () => {
      const corruptData = Buffer.from('{"not": "a valid shard format"}');

      // Non-strict reader (default)
      const nonStrictReader = new BitmapIndexReader(/** @type {any} */ ({ storage: mockStorage, strict: false }));
      mockStorage.readBlob.mockResolvedValue(corruptData);
      nonStrictReader.setup({ 'shards_rev_ab.json': 'corrupt-oid' });

      const nonStrictResult = await nonStrictReader.getParents('abcd1234');
      expect(nonStrictResult).toEqual([]); // Graceful degradation

      // Strict reader
      const strictReader = new BitmapIndexReader(/** @type {any} */ ({ storage: mockStorage, strict: true }));
      strictReader.setup({ 'shards_rev_ab.json': 'corrupt-oid' });

      await expect(strictReader.getParents('abcd1234')).rejects.toThrow(ShardCorruptionError);
    });

    it('caches empty shard on validation failure to avoid repeated I/O and log spam', async () => {
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

      // Return data with wrong version (validation failure)
      mockStorage.readBlob.mockResolvedValue(Buffer.from(JSON.stringify({
        version: 999,
        checksum: 'abc',
        data: {}
      })));

      nonStrictReader.setup({ 'shards_rev_ab.json': 'bad-version-oid' });

      // First access - should log warning
      const result1 = await nonStrictReader.getParents('abcd1234');
      expect(result1).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith('Shard validation warning', expect.objectContaining({
        shardPath: 'shards_rev_ab.json',
      }));

      // Second access to same shard - should NOT log again (cached)
      const result2 = await nonStrictReader.getParents('abcd1234');
      expect(result2).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledTimes(1); // Still only 1 call

      // Verify storage was only called once (not on second access)
      expect(mockStorage.readBlob).toHaveBeenCalledTimes(1);
    });

    it('caches empty shard on JSON parse error to avoid repeated I/O and log spam', async () => {
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

      // Return invalid JSON (parse error)
      mockStorage.readBlob.mockResolvedValue(Buffer.from('not valid json {{{'));

      nonStrictReader.setup({ 'shards_rev_ab.json': 'corrupt-oid' });

      // First access - should log warning
      const result1 = await nonStrictReader.getParents('abcd1234');
      expect(result1).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith('Shard validation warning', expect.objectContaining({
        shardPath: 'shards_rev_ab.json',
        error: 'Failed to parse shard JSON',
      }));

      // Second access to same shard - should NOT log again (cached)
      const result2 = await nonStrictReader.getParents('abcd1234');
      expect(result2).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledTimes(1); // Still only 1 call

      // Verify storage was only called once (not on second access)
      expect(mockStorage.readBlob).toHaveBeenCalledTimes(1);
    });
  });

  describe('shard versioning', () => {
    it('accepts v1 shards for backward compatibility', async () => {
      const v1Data = { 'abcd1234': 42 };
      const v1Shard = createV1Shard(v1Data);

      mockStorage.readBlob.mockResolvedValue(Buffer.from(JSON.stringify(v1Shard)));

      reader.setup({
        'meta_ab.json': 'v1-shard-oid'
      });

      const id = await reader.lookupId('abcd1234');
      expect(id).toBe(42);
    });

    it('accepts v2 shards', async () => {
      const v2Data = { 'abcd1234': 99 };
      const v2Shard = createV2Shard(v2Data);

      mockStorage.readBlob.mockResolvedValue(Buffer.from(JSON.stringify(v2Shard)));

      reader.setup({
        'meta_ab.json': 'v2-shard-oid'
      });

      const id = await reader.lookupId('abcd1234');
      expect(id).toBe(99);
    });

    it('v2 checksum mismatch throws ShardValidationError in strict mode', async () => {
      const strictReader = new BitmapIndexReader(/** @type {any} */ ({ storage: mockStorage, strict: true, crypto }));

      // Create v2 shard with intentionally wrong checksum
      const v2ShardWithBadChecksum = {
        version: 2,
        checksum: 'intentionally-wrong-checksum-value',
        data: { 'abcd1234': 123 }
      };

      mockStorage.readBlob.mockResolvedValue(Buffer.from(JSON.stringify(v2ShardWithBadChecksum)));

      strictReader.setup({
        'meta_ab.json': 'bad-checksum-v2-oid'
      });

      await expect(strictReader.lookupId('abcd1234')).rejects.toThrow(ShardValidationError);

      // Verify the error contains the expected context
      try {
        await strictReader.lookupId('abcd1234');
      } catch (/** @type {any} */ err) {
        expect(err.field).toBe('checksum');
        expect(err.shardPath).toBe('meta_ab.json');
      }
    });

    it('v2 checksum mismatch logs warning in non-strict mode (graceful degradation)', async () => {
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
        crypto,
      }));

      // Create v2 shard with intentionally wrong checksum
      const v2ShardWithBadChecksum = {
        version: 2,
        checksum: 'intentionally-wrong-checksum-value',
        data: { 'abcd1234': 123 }
      };

      mockStorage.readBlob.mockResolvedValue(Buffer.from(JSON.stringify(v2ShardWithBadChecksum)));

      nonStrictReader.setup({
        'meta_ab.json': 'bad-checksum-v2-oid'
      });

      // Should not throw, but return undefined (empty shard cached)
      const result = await nonStrictReader.lookupId('abcd1234');
      expect(result).toBeUndefined();

      // Should have logged a warning
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith('Shard validation warning', expect.objectContaining({
        shardPath: 'meta_ab.json',
        field: 'checksum',
        error: 'Checksum mismatch',
      }));
    });

    it('v1 checksum uses JSON.stringify, not canonicalStringify', async () => {
      // This test verifies backward compatibility: v1 shards use JSON.stringify
      // for checksum computation, which may produce different results than
      // canonicalStringify for objects with unsorted keys.

      // Data with keys in non-alphabetical order
      const v1Data = { 'zebra': 1, 'alpha': 2 };

      // v1 checksum computed with JSON.stringify (key order preserved)
      const v1Checksum = createHash('sha256')
        .update(JSON.stringify(v1Data))
        .digest('hex');

      const v1Shard = {
        version: 1,
        checksum: v1Checksum,
        data: v1Data
      };

      mockStorage.readBlob.mockResolvedValue(Buffer.from(JSON.stringify(v1Shard)));

      reader.setup({
        'meta_ze.json': 'v1-key-order-oid'
      });

      // Should succeed because v1 uses JSON.stringify for verification
      const id = await reader.lookupId('zebra');
      expect(id).toBe(1);
    });

    it('v2 checksum uses canonicalStringify for deterministic ordering', async () => {
      // Data with keys in non-alphabetical order
      const v2Data = { 'zebra': 1, 'alpha': 2 };

      // v2 checksum computed with canonicalStringify (keys sorted)
      const v2Checksum = createHash('sha256')
        .update(canonicalStringify(v2Data))
        .digest('hex');

      const v2Shard = {
        version: 2,
        checksum: v2Checksum,
        data: v2Data
      };

      mockStorage.readBlob.mockResolvedValue(Buffer.from(JSON.stringify(v2Shard)));

      reader.setup({
        'meta_ze.json': 'v2-canonical-oid'
      });

      // Should succeed because v2 uses canonicalStringify for verification
      const id = await reader.lookupId('zebra');
      expect(id).toBe(1);
    });
  });

  describe('LRU cache eviction', () => {
    it('evicts least recently used shards when exceeding maxCachedShards', async () => {
      // Create reader with small cache size
      const smallCacheReader = new BitmapIndexReader(/** @type {any} */ ({
        storage: mockStorage,
        maxCachedShards: 2
      }));

      // Create valid shard data
      const createValidShard = (/** @type {any} */ id) => Buffer.from(JSON.stringify({
        version: 1,
        checksum: createHash('sha256').update(JSON.stringify({ id })).digest('hex'),
        data: { id }
      }));

      mockStorage.readBlob.mockImplementation(async (/** @type {any} */ oid) => {
        return createValidShard(oid);
      });

      smallCacheReader.setup({
        'meta_aa.json': 'oid-aa',
        'meta_bb.json': 'oid-bb',
        'meta_cc.json': 'oid-cc',
      });

      // Load first shard
      await smallCacheReader.lookupId('aabbccdd');
      expect(smallCacheReader.loadedShards.size).toBe(1);
      expect(mockStorage.readBlob).toHaveBeenCalledTimes(1);

      // Load second shard
      await smallCacheReader.lookupId('bbccddee');
      expect(smallCacheReader.loadedShards.size).toBe(2);
      expect(mockStorage.readBlob).toHaveBeenCalledTimes(2);

      // Load third shard - should evict first
      await smallCacheReader.lookupId('ccddeeff');
      expect(smallCacheReader.loadedShards.size).toBe(2); // Still 2 due to LRU eviction

      // First shard should be evicted, accessing it again should reload
      await smallCacheReader.lookupId('aabbccdd');
      expect(mockStorage.readBlob).toHaveBeenCalledTimes(4); // 3 + 1 reload
    });

    it('marks accessed shards as recently used', async () => {
      const smallCacheReader = new BitmapIndexReader(/** @type {any} */ ({
        storage: mockStorage,
        maxCachedShards: 2
      }));

      const createValidShard = (/** @type {any} */ id) => Buffer.from(JSON.stringify({
        version: 1,
        checksum: createHash('sha256').update(JSON.stringify({ id })).digest('hex'),
        data: { id }
      }));

      mockStorage.readBlob.mockImplementation(async (/** @type {any} */ oid) => {
        return createValidShard(oid);
      });

      smallCacheReader.setup({
        'meta_aa.json': 'oid-aa',
        'meta_bb.json': 'oid-bb',
        'meta_cc.json': 'oid-cc',
      });

      // Load first two shards
      await smallCacheReader.lookupId('aabbccdd'); // Load aa
      await smallCacheReader.lookupId('bbccddee'); // Load bb

      // Access 'aa' again to make it recently used
      await smallCacheReader.lookupId('aabbccdd');

      // Load third shard - should evict 'bb' (now oldest)
      await smallCacheReader.lookupId('ccddeeff'); // Load cc

      // 'aa' should still be in cache (was recently used)
      expect(smallCacheReader.loadedShards.has('meta_aa.json')).toBe(true);
      // 'bb' should have been evicted
      expect(smallCacheReader.loadedShards.has('meta_bb.json')).toBe(false);
      // 'cc' should be in cache
      expect(smallCacheReader.loadedShards.has('meta_cc.json')).toBe(true);
    });
  });
});
