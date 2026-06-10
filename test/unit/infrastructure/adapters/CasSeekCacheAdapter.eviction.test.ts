import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReadManifest = vi.fn();
const mockRestore = vi.fn();
const mockStore = vi.fn();
const mockCreateTree = vi.fn();

class MockContentAddressableStore {
  readManifest: any;
  restore: any;
  store: any;
  createTree: any;

  constructor() {
    this.readManifest = mockReadManifest;
    this.restore = mockRestore;
    this.store = mockStore;
    this.createTree = mockCreateTree;
  }
}

class MockCborCodec {}

vi.mock('@git-stunts/git-cas', () => ({
  default: MockContentAddressableStore,
  CborCodec: MockCborCodec,
}));

const { default: CasSeekCacheAdapter } = await import(
  '../../../../src/infrastructure/adapters/CasSeekCacheAdapter.ts'
);

function makePersistence() {
  return {
    readRef: vi.fn().mockResolvedValue(null),
    readBlob: vi.fn().mockResolvedValue(new TextEncoder().encode('{}')),
    writeBlob: vi.fn().mockResolvedValue('blob-oid-1'),
    updateRef: vi.fn().mockResolvedValue(undefined),
    deleteRef: vi.fn().mockResolvedValue(undefined),
  };
}

function makePlumbing() {
  return {};
}

function indexBuffer(entries = {}) {
  return new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, entries }));
}

const GRAPH_NAME = 'test-graph';

describe('CasSeekCacheAdapter LRU eviction', () => {
  let persistence;
  let plumbing;

  beforeEach(() => {
    vi.clearAllMocks();
    persistence = makePersistence();
    plumbing = makePlumbing();
  });

  it('does not evict when under maxEntries', () => {
    const smallAdapter = new CasSeekCacheAdapter({
      persistence,
      plumbing,
      graphName: GRAPH_NAME,
      maxEntries: 5,
    });

    const index = {
      schemaVersion: 1,
      entries: {
        'v1:t1-a': { createdAt: '2025-01-01T00:00:00Z' },
        'v1:t2-b': { createdAt: '2025-01-02T00:00:00Z' },
      },
    };

    const result = (smallAdapter as any)._enforceMaxEntries(index);
    expect(Object.keys(result.entries)).toHaveLength(2);
  });

  it('evicts oldest entries when exceeding maxEntries', () => {
    const smallAdapter = new CasSeekCacheAdapter({
      persistence,
      plumbing,
      graphName: GRAPH_NAME,
      maxEntries: 2,
    });

    const index = {
      schemaVersion: 1,
      entries: {
        'v1:t1-oldest': { createdAt: '2025-01-01T00:00:00Z' },
        'v1:t2-middle': { createdAt: '2025-01-02T00:00:00Z' },
        'v1:t3-newest': { createdAt: '2025-01-03T00:00:00Z' },
        'v1:t4-latest': { createdAt: '2025-01-04T00:00:00Z' },
      },
    };

    const result = (smallAdapter as any)._enforceMaxEntries(index);
    const remaining = Object.keys(result.entries);
    expect(remaining).toHaveLength(2);
    expect(remaining).toContain('v1:t3-newest');
    expect(remaining).toContain('v1:t4-latest');
    expect(remaining).not.toContain('v1:t1-oldest');
    expect(remaining).not.toContain('v1:t2-middle');
  });

  it('evicts exactly the overshoot count', () => {
    const smallAdapter = new CasSeekCacheAdapter({
      persistence,
      plumbing,
      graphName: GRAPH_NAME,
      maxEntries: 3,
    });

    const index = {
      schemaVersion: 1,
      entries: {
        'v1:t1-a': { createdAt: '2025-01-01T00:00:00Z' },
        'v1:t2-b': { createdAt: '2025-01-02T00:00:00Z' },
        'v1:t3-c': { createdAt: '2025-01-03T00:00:00Z' },
        'v1:t4-d': { createdAt: '2025-01-04T00:00:00Z' },
        'v1:t5-e': { createdAt: '2025-01-05T00:00:00Z' },
      },
    };

    const result = (smallAdapter as any)._enforceMaxEntries(index);
    expect(Object.keys(result.entries)).toHaveLength(3);
  });

  it('prefers lastAccessedAt over createdAt for LRU ordering', () => {
    const smallAdapter = new CasSeekCacheAdapter({
      persistence,
      plumbing,
      graphName: GRAPH_NAME,
      maxEntries: 2,
    });

    const index = {
      schemaVersion: 1,
      entries: {
        'v1:t1-old-but-used': {
          createdAt: '2025-01-01T00:00:00Z',
          lastAccessedAt: '2025-01-10T00:00:00Z',
        },
        'v1:t2-new-unused': {
          createdAt: '2025-01-05T00:00:00Z',
        },
        'v1:t3-newest': {
          createdAt: '2025-01-06T00:00:00Z',
        },
      },
    };

    const result = (smallAdapter as any)._enforceMaxEntries(index);
    const remaining = Object.keys(result.entries);
    expect(remaining).toHaveLength(2);
    expect(remaining).toContain('v1:t1-old-but-used');
    expect(remaining).toContain('v1:t3-newest');
    expect(remaining).not.toContain('v1:t2-new-unused');
  });

  it('handles entries with missing createdAt gracefully', () => {
    const smallAdapter = new CasSeekCacheAdapter({
      persistence,
      plumbing,
      graphName: GRAPH_NAME,
      maxEntries: 1,
    });

    const index = {
      schemaVersion: 1,
      entries: {
        'v1:t1-nodate': {},
        'v1:t2-hasdate': { createdAt: '2025-06-01T00:00:00Z' },
      },
    };

    const result = (smallAdapter as any)._enforceMaxEntries(index);
    expect(Object.keys(result.entries)).toHaveLength(1);
  });

  it('evicts via set() when maxEntries exceeded', async () => {
    const tinyAdapter = new CasSeekCacheAdapter({
      persistence,
      plumbing,
      graphName: GRAPH_NAME,
      maxEntries: 1,
    });

    const existing = {
      'v1:t1-old': {
        treeOid: 'old-tree',
        createdAt: '2025-01-01T00:00:00Z',
        ceiling: 1,
        frontierHash: 'old',
        sizeBytes: 10,
        codec: 'cbor-v1',
        schemaVersion: 1,
      },
    };

    persistence.readRef.mockResolvedValue('idx-oid');
    persistence.readBlob.mockResolvedValue(indexBuffer(existing));
    mockStore.mockResolvedValue({ chunks: [] });
    mockCreateTree.mockResolvedValue('new-tree');

    await tinyAdapter.set('v1:t99-newhash', new TextEncoder().encode('new'));

    const writtenJson = JSON.parse(
      new TextDecoder().decode(persistence.writeBlob.mock.calls[0][0])
    );
    expect(Object.keys(writtenJson.entries)).toHaveLength(1);
    expect(writtenJson.entries['v1:t99-newhash']).toBeDefined();
    expect(writtenJson.entries['v1:t1-old']).toBeUndefined();
  });
});
