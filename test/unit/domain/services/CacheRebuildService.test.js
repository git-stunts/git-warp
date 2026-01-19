import { describe, it, expect, vi, beforeEach } from 'vitest';
import CacheRebuildService from '../../../../src/domain/services/CacheRebuildService.js';
import GraphNode from '../../../../src/domain/entities/GraphNode.js';

describe('CacheRebuildService', () => {
  let service;
  let mockPersistence;
  let mockGraphService;

  beforeEach(() => {
    mockPersistence = {
      writeBlob: vi.fn().mockResolvedValue('blob-oid'),
      writeTree: vi.fn().mockResolvedValue('tree-oid'),
    };

    // Mock iterateNodes as an async generator
    mockGraphService = {
      async *iterateNodes({ ref: _ref, limit: _limit }) {
        yield new GraphNode({ sha: 'sha1', author: 'test', date: '2026-01-08', message: 'msg1', parents: [] });
        yield new GraphNode({ sha: 'sha2', author: 'test', date: '2026-01-08', message: 'msg2', parents: ['sha1'] });
      }
    };

    service = new CacheRebuildService({
      persistence: mockPersistence,
      graphService: mockGraphService
    });
  });

  it('rebuilds the index and persists it', async () => {
    const treeOid = await service.rebuild('main');

    // Verify blobs are written (one per shard type)
    expect(mockPersistence.writeBlob).toHaveBeenCalled();
    expect(mockPersistence.writeBlob.mock.calls.length).toBeGreaterThan(0);
    expect(mockPersistence.writeTree).toHaveBeenCalled();
    expect(treeOid).toBe('tree-oid');
  });
});
