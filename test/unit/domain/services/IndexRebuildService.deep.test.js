import { describe, it, expect, vi } from 'vitest';
import IndexRebuildService from '../../../../src/domain/services/IndexRebuildService.js';
import GraphNode from '../../../../src/domain/entities/GraphNode.js';

describe('IndexRebuildService Deep DAG Test', () => {
  it('handles 10,000 node chain without stack overflow', async () => {
    const CHAIN_LENGTH = 10_000;

    // Generate a linear chain: node0 <- node1 <- node2 <- ... <- node9999
    /** @type {GraphNode[]} */
    const chain = [];
    for (let i = 0; i < CHAIN_LENGTH; i++) {
      chain.push(new GraphNode({
        sha: `sha${i.toString().padStart(6, '0')}`,
        author: 'test',
        date: '2026-01-28',
        message: `Node ${i}`,
        parents: i > 0 ? [`sha${(i - 1).toString().padStart(6, '0')}`] : []
      }));
    }

    const mockGraphService = {
      async *iterateNodes(/** @type {any} */ { ref: _ref, limit: _limit }) {
        for (const node of chain) {
          yield node;
        }
      }
    };

    const _blobOids = new Map();
    let blobCounter = 0;

    const mockStorage = {
      writeBlob: vi.fn().mockImplementation(async () => {
        return `blob${++blobCounter}`;
      }),
      writeTree: vi.fn().mockResolvedValue('tree-oid-deep')
    };

    const service = new IndexRebuildService(/** @type {any} */ ({
      graphService: mockGraphService,
      storage: mockStorage
    }));

    // This should complete without stack overflow
    const treeOid = await service.rebuild('HEAD');

    expect(treeOid).toBe('tree-oid-deep');

    // Verify all nodes were processed
    // Should have meta shards + fwd shards + rev shards
    expect(mockStorage.writeBlob).toHaveBeenCalled();
    expect(mockStorage.writeTree).toHaveBeenCalledTimes(1);

    // Verify tree entries were created for all shards
    const treeEntries = mockStorage.writeTree.mock.calls[0][0];
    expect(treeEntries.length).toBeGreaterThan(0);

    // All entries should be valid tree format
    treeEntries.forEach(/** @param {any} entry */ entry => {
      expect(entry).toMatch(/^100644 blob blob\d+\t(meta|shards)_.+\.json$/);
    });
  }, 30000); // 30 second timeout for large test

  it('handles wide DAG (node with 1000 parents) without issues', async () => {
    const PARENT_COUNT = 1000;

    // Create 1000 parent nodes and 1 child with all of them as parents
    /** @type {GraphNode[]} */
    const nodes = [];
    const parentShas = [];

    for (let i = 0; i < PARENT_COUNT; i++) {
      const sha = `parent${i.toString().padStart(4, '0')}`;
      parentShas.push(sha);
      nodes.push(new GraphNode({
        sha,
        author: 'test',
        date: '2026-01-28',
        message: `Parent ${i}`,
        parents: []
      }));
    }

    // Add the mega-merge node
    nodes.push(new GraphNode({
      sha: 'megamerge',
      author: 'test',
      date: '2026-01-28',
      message: 'Mega merge commit',
      parents: parentShas
    }));

    const mockGraphService = {
      async *iterateNodes() {
        for (const node of nodes) {
          yield node;
        }
      }
    };

    const mockStorage = {
      writeBlob: vi.fn().mockResolvedValue('blob-oid'),
      writeTree: vi.fn().mockResolvedValue('tree-oid-wide')
    };

    const service = new IndexRebuildService(/** @type {any} */ ({
      graphService: mockGraphService,
      storage: mockStorage
    }));

    const treeOid = await service.rebuild('HEAD');

    expect(treeOid).toBe('tree-oid-wide');
    expect(mockStorage.writeBlob).toHaveBeenCalled();
  });
});
