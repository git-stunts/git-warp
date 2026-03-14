import { describe, it, expect, beforeEach, vi } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { createEmptyStateV5, encodeEdgeKey, encodeEdgePropKey } from '../../../src/domain/services/JoinReducer.js';
import { orsetAdd } from '../../../src/domain/crdt/ORSet.js';
import { createDot } from '../../../src/domain/crdt/Dot.js';
import { encodePropKey } from '../../../src/domain/services/KeyCodec.js';
import PersistenceError from '../../../src/domain/errors/PersistenceError.js';

function setupGraphState(/** @type {any} */ graph, /** @type {any} */ seedFn) {
  const state = createEmptyStateV5();
  /** @type {any} */ (graph)._cachedState = state;
  graph.materialize = vi.fn().mockResolvedValue(state);
  seedFn(state);
}

function addNode(/** @type {any} */ state, /** @type {any} */ nodeId, /** @type {any} */ counter) {
  orsetAdd(state.nodeAlive, nodeId, createDot('w1', counter));
}

function addEdge(/** @type {any} */ state, /** @type {any} */ from, /** @type {any} */ to, /** @type {any} */ label, /** @type {any} */ counter) {
  const edgeKey = encodeEdgeKey(from, to, label);
  orsetAdd(state.edgeAlive, edgeKey, createDot('w1', counter));
  state.edgeBirthEvent.set(edgeKey, { lamport: 1, writerId: 'w1', patchSha: 'aabbccdd', opIndex: 0 });
}

function attachmentEvent(
  /** @type {number} */ opIndex,
  /** @type {string} */ patchSha = 'aabbccdd',
  /** @type {number} */ lamport = 2,
  /** @type {string} */ writerId = 'w1',
) {
  return { lamport, writerId, patchSha, opIndex };
}

describe('WarpGraph content attachment (query methods)', () => {
  /** @type {any} */
  let mockPersistence;
  /** @type {any} */
  let graph;

  beforeEach(async () => {
    mockPersistence = {
      readRef: vi.fn().mockResolvedValue(null),
      listRefs: vi.fn().mockResolvedValue([]),
      updateRef: vi.fn().mockResolvedValue(undefined),
      configGet: vi.fn().mockResolvedValue(null),
      configSet: vi.fn().mockResolvedValue(undefined),
      readBlob: vi.fn().mockResolvedValue(new TextEncoder().encode('hello world')),
    };

    graph = await WarpGraph.open({
      persistence: mockPersistence,
      graphName: 'test',
      writerId: 'writer-1',
    });
  });

  describe('getContentOid()', () => {
    it('returns the _content property value for a node', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
        const propKey = encodePropKey('doc:1', '_content');
        state.prop.set(propKey, { eventId: null, value: 'abc123' });
      });

      const oid = await graph.getContentOid('doc:1');
      expect(oid).toBe('abc123');
    });

    it('returns null when node has no _content property', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
      });

      const oid = await graph.getContentOid('doc:1');
      expect(oid).toBeNull();
    });

    it('returns null when node does not exist', async () => {
      setupGraphState(graph, () => {});

      const oid = await graph.getContentOid('nonexistent');
      expect(oid).toBeNull();
    });

    it('returns null when _content is not a string', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
        const propKey = encodePropKey('doc:1', '_content');
        state.prop.set(propKey, { eventId: null, value: 42 });
      });

      const oid = await graph.getContentOid('doc:1');
      expect(oid).toBeNull();
    });
  });

  describe('getContentMeta()', () => {
    it('returns structured metadata for a node attachment', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
        state.prop.set(encodePropKey('doc:1', '_content'), { eventId: attachmentEvent(0), value: 'abc123' });
        state.prop.set(encodePropKey('doc:1', '_content.mime'), { eventId: attachmentEvent(1), value: 'text/markdown' });
        state.prop.set(encodePropKey('doc:1', '_content.size'), { eventId: attachmentEvent(2), value: 42 });
      });

      const meta = await graph.getContentMeta('doc:1');

      expect(meta).toEqual({
        oid: 'abc123',
        mime: 'text/markdown',
        size: 42,
      });
    });

    it('ignores stale metadata when _content is rewritten later', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
        state.prop.set(encodePropKey('doc:1', '_content'), {
          eventId: attachmentEvent(0, 'feedbabe', 3),
          value: 'new456',
        });
        state.prop.set(encodePropKey('doc:1', '_content.mime'), {
          eventId: attachmentEvent(1, 'aabbccdd', 2),
          value: 'text/markdown',
        });
        state.prop.set(encodePropKey('doc:1', '_content.size'), {
          eventId: attachmentEvent(2, 'aabbccdd', 2),
          value: 42,
        });
      });

      const meta = await graph.getContentMeta('doc:1');

      expect(meta).toEqual({
        oid: 'new456',
        mime: null,
        size: null,
      });
    });

    it('returns null metadata fields when only the oid exists', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
        state.prop.set(encodePropKey('doc:1', '_content'), { eventId: null, value: 'abc123' });
      });

      const meta = await graph.getContentMeta('doc:1');

      expect(meta).toEqual({
        oid: 'abc123',
        mime: null,
        size: null,
      });
    });

    it('returns null when no content is attached', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
      });

      expect(await graph.getContentMeta('doc:1')).toBeNull();
    });
  });

  describe('getContent()', () => {
    it('reads and returns the blob buffer', async () => {
      const buf = new TextEncoder().encode('# ADR 001\n\nSome content');
      mockPersistence.readBlob.mockResolvedValue(buf);

      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
        const propKey = encodePropKey('doc:1', '_content');
        state.prop.set(propKey, { eventId: null, value: 'abc123' });
      });

      const content = await graph.getContent('doc:1');
      expect(content).toEqual(buf);
      expect(mockPersistence.readBlob).toHaveBeenCalledWith('abc123');
    });

    it('returns null when no content attached', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
      });

      const content = await graph.getContent('doc:1');
      expect(content).toBeNull();
      expect(mockPersistence.readBlob).not.toHaveBeenCalled();
    });

    it('returns null for nonexistent node', async () => {
      setupGraphState(graph, () => {});

      const content = await graph.getContent('nonexistent');
      expect(content).toBeNull();
    });
  });

  describe('getContent() with blobStorage', () => {
    it('uses blobStorage.retrieve() when blobStorage is provided', async () => {
      const casBuf = new TextEncoder().encode('cas-stored content');
      const blobStorage = {
        store: vi.fn(),
        retrieve: vi.fn().mockResolvedValue(casBuf),
      };
      /** @type {any} */ (graph)._blobStorage = blobStorage;

      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
        const propKey = encodePropKey('doc:1', '_content');
        state.prop.set(propKey, { eventId: null, value: 'cas-tree-oid' });
      });

      const content = await graph.getContent('doc:1');

      expect(content).toEqual(casBuf);
      expect(blobStorage.retrieve).toHaveBeenCalledWith('cas-tree-oid');
      expect(mockPersistence.readBlob).not.toHaveBeenCalled();
    });

    it('falls back to persistence.readBlob() when blobStorage is not provided', async () => {
      const rawBuf = new TextEncoder().encode('raw blob');
      mockPersistence.readBlob.mockResolvedValue(rawBuf);

      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
        const propKey = encodePropKey('doc:1', '_content');
        state.prop.set(propKey, { eventId: null, value: 'raw-oid' });
      });

      const content = await graph.getContent('doc:1');

      expect(content).toEqual(rawBuf);
      expect(mockPersistence.readBlob).toHaveBeenCalledWith('raw-oid');
    });

    it('preserves E_MISSING_OBJECT from blobStorage.retrieve()', async () => {
      const blobStorage = {
        store: vi.fn(),
        retrieve: vi.fn().mockRejectedValue(
          new PersistenceError(
            'Missing Git object: cas-tree-oid',
            PersistenceError.E_MISSING_OBJECT,
            { context: { oid: 'cas-tree-oid' } },
          ),
        ),
      };
      /** @type {any} */ (graph)._blobStorage = blobStorage;

      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
        const propKey = encodePropKey('doc:1', '_content');
        state.prop.set(propKey, { eventId: null, value: 'cas-tree-oid' });
      });

      await expect(graph.getContent('doc:1'))
        .rejects.toMatchObject({ code: PersistenceError.E_MISSING_OBJECT });
    });
  });

  describe('getEdgeContent() with blobStorage', () => {
    it('uses blobStorage.retrieve() when blobStorage is provided', async () => {
      const casBuf = new TextEncoder().encode('cas-edge content');
      const blobStorage = {
        store: vi.fn(),
        retrieve: vi.fn().mockResolvedValue(casBuf),
      };
      /** @type {any} */ (graph)._blobStorage = blobStorage;

      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'a', 1);
        addNode(state, 'b', 2);
        addEdge(state, 'a', 'b', 'rel', 3);
        const propKey = encodeEdgePropKey('a', 'b', 'rel', '_content');
        state.prop.set(propKey, { eventId: { lamport: 2, writerId: 'w1', patchSha: 'aabbccdd', opIndex: 0 }, value: 'cas-edge-oid' });
      });

      const content = await graph.getEdgeContent('a', 'b', 'rel');

      expect(content).toEqual(casBuf);
      expect(blobStorage.retrieve).toHaveBeenCalledWith('cas-edge-oid');
      expect(mockPersistence.readBlob).not.toHaveBeenCalled();
    });

    it('preserves E_MISSING_OBJECT from blobStorage.retrieve()', async () => {
      const blobStorage = {
        store: vi.fn(),
        retrieve: vi.fn().mockRejectedValue(
          new PersistenceError(
            'Missing Git object: cas-edge-oid',
            PersistenceError.E_MISSING_OBJECT,
            { context: { oid: 'cas-edge-oid' } },
          ),
        ),
      };
      /** @type {any} */ (graph)._blobStorage = blobStorage;

      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'a', 1);
        addNode(state, 'b', 2);
        addEdge(state, 'a', 'b', 'rel', 3);
        const propKey = encodeEdgePropKey('a', 'b', 'rel', '_content');
        state.prop.set(propKey, {
          eventId: { lamport: 2, writerId: 'w1', patchSha: 'aabbccdd', opIndex: 0 },
          value: 'cas-edge-oid',
        });
      });

      await expect(graph.getEdgeContent('a', 'b', 'rel'))
        .rejects.toMatchObject({ code: PersistenceError.E_MISSING_OBJECT });
    });
  });

  describe('getEdgeContentOid()', () => {
    it('returns the _content property value for an edge', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'a', 1);
        addNode(state, 'b', 2);
        addEdge(state, 'a', 'b', 'rel', 3);
        const propKey = encodeEdgePropKey('a', 'b', 'rel', '_content');
        state.prop.set(propKey, { eventId: { lamport: 2, writerId: 'w1', patchSha: 'aabbccdd', opIndex: 0 }, value: 'def456' });
      });

      const oid = await graph.getEdgeContentOid('a', 'b', 'rel');
      expect(oid).toBe('def456');
    });

    it('returns null when edge has no _content', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'a', 1);
        addNode(state, 'b', 2);
        addEdge(state, 'a', 'b', 'rel', 3);
      });

      const oid = await graph.getEdgeContentOid('a', 'b', 'rel');
      expect(oid).toBeNull();
    });

    it('returns null when edge does not exist', async () => {
      setupGraphState(graph, () => {});

      const oid = await graph.getEdgeContentOid('a', 'b', 'rel');
      expect(oid).toBeNull();
    });
  });

  describe('getEdgeContentMeta()', () => {
    it('returns structured metadata for an edge attachment', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'a', 1);
        addNode(state, 'b', 2);
        addEdge(state, 'a', 'b', 'rel', 3);
        state.prop.set(encodeEdgePropKey('a', 'b', 'rel', '_content'), {
          eventId: attachmentEvent(0),
          value: 'def456',
        });
        state.prop.set(encodeEdgePropKey('a', 'b', 'rel', '_content.mime'), {
          eventId: attachmentEvent(1),
          value: 'application/octet-stream',
        });
        state.prop.set(encodeEdgePropKey('a', 'b', 'rel', '_content.size'), {
          eventId: attachmentEvent(2),
          value: 6,
        });
      });

      const meta = await graph.getEdgeContentMeta('a', 'b', 'rel');

      expect(meta).toEqual({
        oid: 'def456',
        mime: 'application/octet-stream',
        size: 6,
      });
    });

    it('ignores stale edge metadata when _content is rewritten later', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'a', 1);
        addNode(state, 'b', 2);
        addEdge(state, 'a', 'b', 'rel', 3);
        state.prop.set(encodeEdgePropKey('a', 'b', 'rel', '_content'), {
          eventId: attachmentEvent(0, 'feedbabe', 3),
          value: 'new-edge-oid',
        });
        state.prop.set(encodeEdgePropKey('a', 'b', 'rel', '_content.mime'), {
          eventId: attachmentEvent(1),
          value: 'application/octet-stream',
        });
        state.prop.set(encodeEdgePropKey('a', 'b', 'rel', '_content.size'), {
          eventId: attachmentEvent(2),
          value: 6,
        });
      });

      const meta = await graph.getEdgeContentMeta('a', 'b', 'rel');

      expect(meta).toEqual({
        oid: 'new-edge-oid',
        mime: null,
        size: null,
      });
    });

    it('returns null when no edge content is attached', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'a', 1);
        addNode(state, 'b', 2);
        addEdge(state, 'a', 'b', 'rel', 3);
      });

      expect(await graph.getEdgeContentMeta('a', 'b', 'rel')).toBeNull();
    });
  });

  describe('getEdgeContent()', () => {
    it('reads and returns the blob buffer', async () => {
      const buf = new TextEncoder().encode('edge content');
      mockPersistence.readBlob.mockResolvedValue(buf);

      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'a', 1);
        addNode(state, 'b', 2);
        addEdge(state, 'a', 'b', 'rel', 3);
        const propKey = encodeEdgePropKey('a', 'b', 'rel', '_content');
        state.prop.set(propKey, { eventId: { lamport: 2, writerId: 'w1', patchSha: 'aabbccdd', opIndex: 0 }, value: 'def456' });
      });

      const content = await graph.getEdgeContent('a', 'b', 'rel');
      expect(content).toEqual(buf);
      expect(mockPersistence.readBlob).toHaveBeenCalledWith('def456');
    });

    it('returns null when no content attached', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'a', 1);
        addNode(state, 'b', 2);
        addEdge(state, 'a', 'b', 'rel', 3);
      });

      const content = await graph.getEdgeContent('a', 'b', 'rel');
      expect(content).toBeNull();
    });
  });
});
