import { bench, describe, beforeAll } from 'vitest';
import BitmapIndexService from '../../src/domain/services/BitmapIndexService.js';
import GraphNode from '../../src/domain/entities/GraphNode.js';
import GraphService from '../../src/domain/services/GraphService.js';

/**
 * Domain-level benchmarks that run without Git.
 * These test the pure computational performance of the domain layer.
 */

// Mock persistence for GraphService benchmarks
const mockPersistence = {
  commitNode: async () => 'mock-sha',
  showNode: async () => 'mock-message',
  logNodesStream: async function* () { yield ''; }
};

describe('GraphService', () => {
  bench('service initialization', () => {
    new GraphService({ persistence: mockPersistence });
  });
});

describe('GraphNode', () => {
  const validProps = {
    sha: 'a'.repeat(40),
    author: 'Test Author',
    date: '2026-01-18',
    message: 'Test message',
    parents: ['b'.repeat(40)]
  };

  bench('create valid node', () => {
    new GraphNode(validProps);
  });

  bench('create node with multiple parents', () => {
    new GraphNode({
      ...validProps,
      parents: ['b'.repeat(40), 'c'.repeat(40), 'd'.repeat(40)]
    });
  });

  bench('property access (immutable getters)', () => {
    const node = new GraphNode(validProps);
    const _ = node.sha + node.author + node.date + node.message;
  });
});

describe('BitmapIndexService - Build', () => {
  bench('addEdge (100 edges)', () => {
    const state = BitmapIndexService.createRebuildState();
    for (let i = 0; i < 100; i++) {
      const src = i.toString(16).padStart(40, '0');
      const tgt = (i + 1).toString(16).padStart(40, '0');
      BitmapIndexService.addEdge(src, tgt, state);
    }
  });

  bench('addEdge (1000 edges)', () => {
    const state = BitmapIndexService.createRebuildState();
    for (let i = 0; i < 1000; i++) {
      const src = i.toString(16).padStart(40, '0');
      const tgt = (i + 1).toString(16).padStart(40, '0');
      BitmapIndexService.addEdge(src, tgt, state);
    }
  });

  bench('addEdge (10000 edges)', () => {
    const state = BitmapIndexService.createRebuildState();
    for (let i = 0; i < 10000; i++) {
      const src = i.toString(16).padStart(40, '0');
      const tgt = (i + 1).toString(16).padStart(40, '0');
      BitmapIndexService.addEdge(src, tgt, state);
    }
  });
});

describe('BitmapIndexService - Serialize', () => {
  // Pre-build states of various sizes
  const buildState = (edgeCount) => {
    const state = BitmapIndexService.createRebuildState();
    for (let i = 0; i < edgeCount; i++) {
      const src = i.toString(16).padStart(40, '0');
      const tgt = (i + 1).toString(16).padStart(40, '0');
      BitmapIndexService.addEdge(src, tgt, state);
    }
    return state;
  };

  const state100 = buildState(100);
  const state1000 = buildState(1000);
  const state10000 = buildState(10000);

  bench('serialize 100 edges', () => {
    BitmapIndexService.serialize(state100);
  });

  bench('serialize 1000 edges', () => {
    BitmapIndexService.serialize(state1000);
  });

  bench('serialize 10000 edges', () => {
    BitmapIndexService.serialize(state10000);
  });
});

describe('BitmapIndexService - Query (O(1) lookup)', () => {
  // Build and setup a loaded index for query benchmarks
  const buildLoadedIndex = (edgeCount) => {
    const state = BitmapIndexService.createRebuildState();
    for (let i = 0; i < edgeCount; i++) {
      const src = i.toString(16).padStart(40, '0');
      const tgt = (i + 1).toString(16).padStart(40, '0');
      BitmapIndexService.addEdge(src, tgt, state);
    }

    const tree = BitmapIndexService.serialize(state);

    // Mock persistence that reads from our serialized tree
    const blobReader = {
      readBlob: async (oid) => tree[oid]
    };

    const index = new BitmapIndexService({ persistence: blobReader });
    // Setup with path -> path mapping (our mock uses path as oid)
    const shardOids = {};
    for (const path of Object.keys(tree)) {
      shardOids[path] = path;
    }
    index.setup(shardOids);
    return { index, state };
  };

  let index1000;
  let index10000;
  let midSha1000;
  let midSha10000;

  beforeAll(async () => {
    const result1000 = buildLoadedIndex(1000);
    const result10000 = buildLoadedIndex(10000);
    index1000 = result1000.index;
    index10000 = result10000.index;
    midSha1000 = result1000.state.idToSha[500];
    midSha10000 = result10000.state.idToSha[5000];

    // Pre-warm the index caches
    await index1000.getParents(midSha1000);
    await index1000.getChildren(midSha1000);
    await index10000.getParents(midSha10000);
    await index10000.getChildren(midSha10000);
  });

  bench('getParents (1000 node index)', async () => {
    await index1000.getParents(midSha1000);
  });

  bench('getChildren (1000 node index)', async () => {
    await index1000.getChildren(midSha1000);
  });

  bench('getParents (10000 node index)', async () => {
    await index10000.getParents(midSha10000);
  });

  bench('getChildren (10000 node index)', async () => {
    await index10000.getChildren(midSha10000);
  });
});

describe('BitmapIndexService - ID Lookup', () => {
  let index10000;
  let midSha;

  beforeAll(async () => {
    const state = BitmapIndexService.createRebuildState();
    for (let i = 0; i < 10000; i++) {
      const sha = i.toString(16).padStart(40, '0');
      BitmapIndexService.registerNode(sha, state);
    }

    const tree = BitmapIndexService.serialize(state);

    const blobReader = {
      readBlob: async (oid) => tree[oid]
    };

    index10000 = new BitmapIndexService({ persistence: blobReader });
    const shardOids = {};
    for (const path of Object.keys(tree)) {
      shardOids[path] = path;
    }
    index10000.setup(shardOids);
    midSha = state.idToSha[5000];
  });

  bench('lookupId (10000 nodes)', async () => {
    await index10000.lookupId(midSha);
  });
});

describe('Memory Profile - Large Index Build', () => {
  bench('build 50000 edge index', () => {
    const state = BitmapIndexService.createRebuildState();
    for (let i = 0; i < 50000; i++) {
      const src = i.toString(16).padStart(40, '0');
      const tgt = (i + 1).toString(16).padStart(40, '0');
      BitmapIndexService.addEdge(src, tgt, state);
    }
  });
});
