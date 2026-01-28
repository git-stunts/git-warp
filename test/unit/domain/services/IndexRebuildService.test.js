import { describe, it, expect, vi, beforeEach } from 'vitest';
import IndexRebuildService from '../../../../src/domain/services/IndexRebuildService.js';
import GraphNode from '../../../../src/domain/entities/GraphNode.js';

describe('IndexRebuildService', () => {
  let service;
  let mockStorage;
  let mockGraphService;

  beforeEach(() => {
    mockStorage = {
      writeBlob: vi.fn().mockResolvedValue('blob-oid'),
      writeTree: vi.fn().mockResolvedValue('tree-oid'),
      readTreeOids: vi.fn().mockResolvedValue({}),
      readBlob: vi.fn().mockResolvedValue(Buffer.from('{}')),
    };

    // Mock iterateNodes as an async generator
    mockGraphService = {
      async *iterateNodes({ ref: _ref, limit: _limit }) {
        yield new GraphNode({ sha: 'sha1', author: 'test', date: '2026-01-08', message: 'msg1', parents: [] });
        yield new GraphNode({ sha: 'sha2', author: 'test', date: '2026-01-08', message: 'msg2', parents: ['sha1'] });
      }
    };

    service = new IndexRebuildService({
      storage: mockStorage,
      graphService: mockGraphService
    });
  });

  it('rebuilds the index and persists it', async () => {
    const treeOid = await service.rebuild('main');

    // Verify blobs are written (one per shard type)
    expect(mockStorage.writeBlob).toHaveBeenCalled();
    expect(mockStorage.writeBlob.mock.calls.length).toBeGreaterThan(0);
    expect(mockStorage.writeTree).toHaveBeenCalled();
    expect(treeOid).toBe('tree-oid');
  });

  it('loads an index from a tree OID', async () => {
    const reader = await service.load('tree-oid');

    expect(mockStorage.readTreeOids).toHaveBeenCalledWith('tree-oid');
    expect(reader).toBeDefined();
    expect(typeof reader.getParents).toBe('function');
    expect(typeof reader.getChildren).toBe('function');
  });
});
