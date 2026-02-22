import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadIndexFrontier, checkStaleness } from '../../../../src/domain/services/IndexStalenessChecker.js';
import { encode as cborEncode } from '../../../../src/infrastructure/codecs/CborCodec.js';
import IndexRebuildService from '../../../../src/domain/services/IndexRebuildService.js';

/**
 * GK/IDX/2 — Detect and report index staleness on load.
 */

describe('loadIndexFrontier', () => {
  it('with CBOR present → correct Map', async () => {
    const envelope = { version: 1, writerCount: 2, frontier: { alice: 'sha-a', bob: 'sha-b' } };
    const cborBuffer = Buffer.from(cborEncode(envelope));
    const storage = { readBlob: vi.fn().mockResolvedValue(cborBuffer) };
    const shardOids = { 'frontier.cbor': 'cbor-oid' };

    const result = await loadIndexFrontier(shardOids, /** @type {any} */ (storage));

    expect(result).toBeInstanceOf(Map);
    expect(/** @type {any} */ (result).get('alice')).toBe('sha-a');
    expect(/** @type {any} */ (result).get('bob')).toBe('sha-b');
    expect(/** @type {any} */ (result).size).toBe(2);
  });

  it('with JSON fallback → correct Map', async () => {
    const envelope = { version: 1, writerCount: 1, frontier: { alice: 'sha-a' } };
    const jsonBuffer = Buffer.from(JSON.stringify(envelope));
    const storage = { readBlob: vi.fn().mockResolvedValue(jsonBuffer) };
    const shardOids = { 'frontier.json': 'json-oid' };

    const result = await loadIndexFrontier(shardOids, /** @type {any} */ (storage));

    expect(result).toBeInstanceOf(Map);
    expect(/** @type {any} */ (result).get('alice')).toBe('sha-a');
  });

  it('with neither → null', async () => {
    const storage = { readBlob: vi.fn() };
    const result = await loadIndexFrontier({}, /** @type {any} */ (storage));
    expect(result).toBeNull();
  });
});

describe('checkStaleness', () => {
  it('identical → stale: false', () => {
    const index = new Map([['a', 'sha1'], ['b', 'sha2']]);
    const current = new Map([['a', 'sha1'], ['b', 'sha2']]);

    const result = checkStaleness(index, current);

    expect(result.stale).toBe(false);
    expect(result.advancedWriters).toEqual([]);
    expect(result.newWriters).toEqual([]);
    expect(result.removedWriters).toEqual([]);
  });

  it('writer advanced → stale: true, advancedWriters populated', () => {
    const index = new Map([['alice', 'sha-old']]);
    const current = new Map([['alice', 'sha-new']]);

    const result = checkStaleness(index, current);

    expect(result.stale).toBe(true);
    expect(result.advancedWriters).toEqual(['alice']);
  });

  it('new writer → newWriters populated', () => {
    const index = new Map([['alice', 'sha-a']]);
    const current = new Map([['alice', 'sha-a'], ['bob', 'sha-b']]);

    const result = checkStaleness(index, current);

    expect(result.stale).toBe(true);
    expect(result.newWriters).toEqual(['bob']);
  });

  it('writer removed → removedWriters populated', () => {
    const index = new Map([['alice', 'sha-a'], ['bob', 'sha-b']]);
    const current = new Map([['alice', 'sha-a']]);

    const result = checkStaleness(index, current);

    expect(result.stale).toBe(true);
    expect(result.removedWriters).toEqual(['bob']);
  });

  it('all changes combined', () => {
    const index = new Map([['alice', 'sha-old'], ['charlie', 'sha-c']]);
    const current = new Map([['alice', 'sha-new'], ['bob', 'sha-b']]);

    const result = checkStaleness(index, current);

    expect(result.stale).toBe(true);
    expect(result.advancedWriters).toEqual(['alice']);
    expect(result.newWriters).toEqual(['bob']);
    expect(result.removedWriters).toEqual(['charlie']);
  });

  it('reason string describes changes', () => {
    const index = new Map([['a', 'old']]);
    const current = new Map([['a', 'new'], ['b', 'sha-b']]);

    const result = checkStaleness(index, current);

    expect(result.reason).toContain('1 writer(s) advanced');
    expect(result.reason).toContain('1 new writer(s)');
  });
});

describe('IndexRebuildService.load() staleness integration', () => {
  /** @type {any} */
  let storage;
  /** @type {any} */
  let logger;
  /** @type {any} */
  let graphService;

  beforeEach(() => {
    storage = {
      readTreeOids: vi.fn(),
      readBlob: vi.fn(),
      writeBlob: vi.fn(),
      writeTree: vi.fn(),
    };
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    };
    graphService = {
      iterateNodes: vi.fn(),
    };
  });

  it('logs warning on stale index', async () => {
    const envelope = { version: 1, writerCount: 1, frontier: { alice: 'sha-old' } };
    const cborBuffer = Buffer.from(cborEncode(envelope));

    storage.readTreeOids.mockResolvedValue({
      'meta_aa.json': 'aaa1aaa2aaa3aaa4aaa5aaa6aaa7aaa8aaa9aaa0',
      'frontier.cbor': 'bbb1bbb2bbb3bbb4bbb5bbb6bbb7bbb8bbb9bbb0',
    });
    storage.readBlob.mockResolvedValue(cborBuffer);

    const service = new IndexRebuildService(/** @type {any} */ ({ graphService, storage, logger }));
    const currentFrontier = new Map([['alice', 'sha-new']]);

    await service.load('tree-oid', { currentFrontier });

    expect(logger.warn).toHaveBeenCalledWith(
      'Index is stale',
      expect.objectContaining({ reason: expect.stringContaining('1 writer(s) advanced') }),
    );
  });

  it('no warning on current index', async () => {
    const envelope = { version: 1, writerCount: 1, frontier: { alice: 'sha-a' } };
    const cborBuffer = Buffer.from(cborEncode(envelope));

    storage.readTreeOids.mockResolvedValue({
      'meta_aa.json': 'aaa1aaa2aaa3aaa4aaa5aaa6aaa7aaa8aaa9aaa0',
      'frontier.cbor': 'bbb1bbb2bbb3bbb4bbb5bbb6bbb7bbb8bbb9bbb0',
    });
    storage.readBlob.mockResolvedValue(cborBuffer);

    const service = new IndexRebuildService(/** @type {any} */ ({ graphService, storage, logger }));
    const currentFrontier = new Map([['alice', 'sha-a']]);

    await service.load('tree-oid', { currentFrontier });

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('no frontier (legacy) → debug log, no warning', async () => {
    storage.readTreeOids.mockResolvedValue({
      'meta_aa.json': 'aaa1aaa2aaa3aaa4aaa5aaa6aaa7aaa8aaa9aaa0',
    });

    const service = new IndexRebuildService(/** @type {any} */ ({ graphService, storage, logger }));
    const currentFrontier = new Map([['alice', 'sha-a']]);

    await service.load('tree-oid', { currentFrontier });

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('legacy'),
      expect.any(Object),
    );
  });

  it('autoRebuild: true triggers rebuild on stale index', async () => {
    const envelope = { version: 1, writerCount: 1, frontier: { alice: 'sha-old' } };
    const cborBuffer = Buffer.from(cborEncode(envelope));

    // First call: stale index
    storage.readTreeOids.mockResolvedValueOnce({
      'meta_aa.json': 'aaa1aaa2aaa3aaa4aaa5aaa6aaa7aaa8aaa9aaa0',
      'frontier.cbor': 'bbb1bbb2bbb3bbb4bbb5bbb6bbb7bbb8bbb9bbb0',
    });
    storage.readBlob.mockResolvedValueOnce(cborBuffer);

    // rebuild() returns new tree OID
    // Second call: rebuilt index (no frontier = no staleness check)
    storage.readTreeOids.mockResolvedValueOnce({
      'meta_aa.json': 'ccc1ccc2ccc3ccc4ccc5ccc6ccc7ccc8ccc9ccc0',
    });

    const currentFrontier = new Map([['alice', 'sha-new']]);

    // Mock graphService.iterateNodes to yield nothing (empty graph)
    graphService.iterateNodes = function* () { /* empty */ };

    const service = new IndexRebuildService(/** @type {any} */ ({ graphService, storage, logger }));

    const reader = await service.load('tree-oid', {
      currentFrontier,
      autoRebuild: true,
      rebuildRef: 'HEAD',
    });

    expect(reader).toBeDefined();
    // The warn should have been called for the stale detection
    expect(logger.warn).toHaveBeenCalled();
  });
});
