import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openMemoryRuntimeHostProduct as openRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';
import { createEmptyState, encodeEdgeKey, encodeEdgePropKey } from '../../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import { encodePropKey } from '../../../src/domain/services/KeyCodec.ts';
import PersistenceError from '../../../src/domain/errors/PersistenceError.ts';

function setupGraphState(/** @type {any} */ graph, /** @type {any} */ seedFn) {
  const state = createEmptyState();
  (graph)._cachedState = state;
  graph.materialize = vi.fn().mockResolvedValue(state);
  seedFn(state);
}

function addNode(/** @type {any} */ state, /** @type {any} */ nodeId, /** @type {any} */ counter) {
  state.nodeAlive.add(nodeId, Dot.create('w1', counter));
}

function addEdge(/** @type {any} */ state, /** @type {any} */ from, /** @type {any} */ to, /** @type {any} */ label, /** @type {any} */ counter) {
  const edgeKey = encodeEdgeKey(from, to, label);
  state.edgeAlive.add(edgeKey, Dot.create('w1', counter));
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

function assetStorageWith(...chunks: Uint8Array[]) {
  return {
    stage: vi.fn(),
    open: vi.fn().mockImplementation(() => (async function* () {
      yield* chunks;
    })()),
  };
}

function expectOpenedHandle(assetStorage: ReturnType<typeof assetStorageWith>, token: string) {
  expect(assetStorage.open).toHaveBeenCalledOnce();
  expect(assetStorage.open.mock.calls[0]?.[0]?.toString()).toBe(token);
}

describe('WarpGraph content attachment queries', () => {
    let mockPersistence;
    let graph;

  beforeEach(async () => {
    mockPersistence = {
      readRef: vi.fn().mockResolvedValue(null),
      listRefs: vi.fn().mockResolvedValue([]),
      updateRef: vi.fn().mockResolvedValue(undefined),
      configGet: vi.fn().mockResolvedValue(null),
      configSet: vi.fn().mockResolvedValue(undefined),
      readBlob: vi.fn().mockResolvedValue(new TextEncoder().encode('hello world')),
      writeBlob: vi.fn().mockResolvedValue('a'.repeat(40)),
      getNodeInfo: vi.fn().mockResolvedValue({ message: '', parents: [] }),
      readTreeOids: vi.fn().mockResolvedValue({}),
      writeTree: vi.fn().mockResolvedValue('a'.repeat(40)),
    };

    graph = await openRuntimeHostProduct({
      persistence: mockPersistence,
      graphName: 'test',
      writerId: 'writer-1',
    });
  });

  describe('getContentHandle()', () => {
    it('returns the _content property value for a node', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
        const propKey = encodePropKey('doc:1', '_content');
        state.prop.set(propKey, { eventId: null, value: 'abc123' });
      });

      const handle = await graph.getContentHandle('doc:1');
      expect(handle).toBe('abc123');
    });

    it('returns null when node has no _content property', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
      });

      const handle = await graph.getContentHandle('doc:1');
      expect(handle).toBeNull();
    });

    it('returns null when node does not exist', async () => {
      setupGraphState(graph, () => {});

      const handle = await graph.getContentHandle('nonexistent');
      expect(handle).toBeNull();
    });

    it('returns null when _content is not a string', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
        const propKey = encodePropKey('doc:1', '_content');
        state.prop.set(propKey, { eventId: null, value: 42 });
      });

      const handle = await graph.getContentHandle('doc:1');
      expect(handle).toBeNull();
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
        handle: 'abc123',
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
        handle: 'new456',
        mime: null,
        size: null,
      });
    });

    it('returns null metadata fields when only the handle exists', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
        state.prop.set(encodePropKey('doc:1', '_content'), { eventId: null, value: 'abc123' });
      });

      const meta = await graph.getContentMeta('doc:1');

      expect(meta).toEqual({
        handle: 'abc123',
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
    it('collects and returns bytes from the configured asset store', async () => {
      const buf = new TextEncoder().encode('# ADR 001\n\nSome content');
      const assetStorage = assetStorageWith(buf);
      (graph)._assetStorage = assetStorage;

      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
        const propKey = encodePropKey('doc:1', '_content');
        state.prop.set(propKey, { eventId: null, value: 'abc123' });
      });

      const content = await graph.getContent('doc:1');
      expect(content).toEqual(buf);
      expectOpenedHandle(assetStorage, 'abc123');
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

  describe('getContent() asset storage failures', () => {
    it('resolves opaque handles through the asset storage port', async () => {
      const casBuf = new TextEncoder().encode('cas-stored content');
      const assetStorage = assetStorageWith(casBuf);
      (graph)._assetStorage = assetStorage;

      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
        const propKey = encodePropKey('doc:1', '_content');
        state.prop.set(propKey, { eventId: null, value: 'asset:document' });
      });

      const content = await graph.getContent('doc:1');

      expect(content).toEqual(casBuf);
      expectOpenedHandle(assetStorage, 'asset:document');
      expect(mockPersistence.readBlob).not.toHaveBeenCalled();
    });

    it('uses the runtime-provided asset store without reading Git directly', async () => {
      const rawBuf = new TextEncoder().encode('raw blob');
      const assetStorage = assetStorageWith(rawBuf);
      (graph)._assetStorage = assetStorage;

      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
        const propKey = encodePropKey('doc:1', '_content');
        state.prop.set(propKey, { eventId: null, value: 'asset:runtime-provided' });
      });

      const content = await graph.getContent('doc:1');

      expect(content).toEqual(rawBuf);
      expectOpenedHandle(assetStorage, 'asset:runtime-provided');
      expect(mockPersistence.readBlob).not.toHaveBeenCalled();
    });

    it('preserves storage errors from assetStorage.open()', async () => {
      const assetStorage = {
        stage: vi.fn(),
        open: vi.fn().mockImplementation(() => {
          throw (
          new PersistenceError(
            'Missing stored asset: asset:missing',
            PersistenceError.E_MISSING_OBJECT,
            { context: { handle: 'asset:missing' } },
          ));
        }),
      };
      (graph)._assetStorage = assetStorage;

      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
        const propKey = encodePropKey('doc:1', '_content');
        state.prop.set(propKey, { eventId: null, value: 'asset:missing' });
      });

      await expect(graph.getContent('doc:1'))
        .rejects.toMatchObject({ code: PersistenceError.E_MISSING_OBJECT });
    });
  });

  describe('getEdgeContent() asset storage failures', () => {
    it('resolves opaque handles through the asset storage port', async () => {
      const casBuf = new TextEncoder().encode('cas-edge content');
      const assetStorage = assetStorageWith(casBuf);
      (graph)._assetStorage = assetStorage;

      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'a', 1);
        addNode(state, 'b', 2);
        addEdge(state, 'a', 'b', 'rel', 3);
        const propKey = encodeEdgePropKey('a', 'b', 'rel', '_content');
        state.prop.set(propKey, { eventId: { lamport: 2, writerId: 'w1', patchSha: 'aabbccdd', opIndex: 0 }, value: 'asset:edge' });
      });

      const content = await graph.getEdgeContent('a', 'b', 'rel');

      expect(content).toEqual(casBuf);
      expectOpenedHandle(assetStorage, 'asset:edge');
      expect(mockPersistence.readBlob).not.toHaveBeenCalled();
    });

    it('preserves storage errors from assetStorage.open()', async () => {
      const assetStorage = {
        stage: vi.fn(),
        open: vi.fn().mockImplementation(() => {
          throw (
          new PersistenceError(
            'Missing stored asset: asset:missing-edge',
            PersistenceError.E_MISSING_OBJECT,
            { context: { handle: 'asset:missing-edge' } },
          ));
        }),
      };
      (graph)._assetStorage = assetStorage;

      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'a', 1);
        addNode(state, 'b', 2);
        addEdge(state, 'a', 'b', 'rel', 3);
        const propKey = encodeEdgePropKey('a', 'b', 'rel', '_content');
        state.prop.set(propKey, {
          eventId: { lamport: 2, writerId: 'w1', patchSha: 'aabbccdd', opIndex: 0 },
          value: 'asset:missing-edge',
        });
      });

      await expect(graph.getEdgeContent('a', 'b', 'rel'))
        .rejects.toMatchObject({ code: PersistenceError.E_MISSING_OBJECT });
    });
  });

  describe('getEdgeContentHandle()', () => {
    it('returns the _content property value for an edge', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'a', 1);
        addNode(state, 'b', 2);
        addEdge(state, 'a', 'b', 'rel', 3);
        const propKey = encodeEdgePropKey('a', 'b', 'rel', '_content');
        state.prop.set(propKey, { eventId: { lamport: 2, writerId: 'w1', patchSha: 'aabbccdd', opIndex: 0 }, value: 'def456' });
      });

      const handle = await graph.getEdgeContentHandle('a', 'b', 'rel');
      expect(handle).toBe('def456');
    });

    it('returns null when edge has no _content', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'a', 1);
        addNode(state, 'b', 2);
        addEdge(state, 'a', 'b', 'rel', 3);
      });

      const handle = await graph.getEdgeContentHandle('a', 'b', 'rel');
      expect(handle).toBeNull();
    });

    it('returns null when edge does not exist', async () => {
      setupGraphState(graph, () => {});

      const handle = await graph.getEdgeContentHandle('a', 'b', 'rel');
      expect(handle).toBeNull();
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
        handle: 'def456',
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
          value: 'new-edge-handle',
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
        handle: 'new-edge-handle',
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
    it('collects and returns bytes from the configured asset store', async () => {
      const buf = new TextEncoder().encode('edge content');
      const assetStorage = assetStorageWith(buf);
      (graph)._assetStorage = assetStorage;

      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'a', 1);
        addNode(state, 'b', 2);
        addEdge(state, 'a', 'b', 'rel', 3);
        const propKey = encodeEdgePropKey('a', 'b', 'rel', '_content');
        state.prop.set(propKey, { eventId: { lamport: 2, writerId: 'w1', patchSha: 'aabbccdd', opIndex: 0 }, value: 'def456' });
      });

      const content = await graph.getEdgeContent('a', 'b', 'rel');
      expect(content).toEqual(buf);
      expectOpenedHandle(assetStorage, 'def456');
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

  describe('getContentStream()', () => {
    it('returns an async iterable of content chunks', async () => {
      const chunk1 = new TextEncoder().encode('hello ');
      const chunk2 = new TextEncoder().encode('world');
      const assetStorage = assetStorageWith(chunk1, chunk2);
      (graph)._assetStorage = assetStorage;

      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
        const propKey = encodePropKey('doc:1', '_content');
        state.prop.set(propKey, { eventId: null, value: 'asset:streamed-document' });
      });

      const stream = await graph.getContentStream('doc:1');
      expect(stream).not.toBeNull();

      const chunks: any[] = [];
      for await (const chunk of (stream)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toBe(chunk1);
      expect(chunks[1]).toBe(chunk2);
      expectOpenedHandle(assetStorage, 'asset:streamed-document');
    });

    it('returns null when no content is attached', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'doc:1', 1);
      });

      const stream = await graph.getContentStream('doc:1');
      expect(stream).toBeNull();
    });

    it('returns null for nonexistent node', async () => {
      setupGraphState(graph, () => {});

      const stream = await graph.getContentStream('nonexistent');
      expect(stream).toBeNull();
    });
  });

  describe('getEdgeContentStream()', () => {
    it('returns an async iterable of edge content chunks', async () => {
      const chunk = new TextEncoder().encode('edge stream data');
      const assetStorage = assetStorageWith(chunk);
      (graph)._assetStorage = assetStorage;

      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'a', 1);
        addNode(state, 'b', 2);
        addEdge(state, 'a', 'b', 'rel', 3);
        const propKey = encodeEdgePropKey('a', 'b', 'rel', '_content');
        state.prop.set(propKey, {
          eventId: { lamport: 2, writerId: 'w1', patchSha: 'aabbccdd', opIndex: 0 },
          value: 'asset:streamed-edge',
        });
      });

      const stream = await graph.getEdgeContentStream('a', 'b', 'rel');
      expect(stream).not.toBeNull();

      const chunks: any[] = [];
      for await (const c of (stream)) {
        chunks.push(c);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(chunk);
      expectOpenedHandle(assetStorage, 'asset:streamed-edge');
    });

    it('returns null when no edge content is attached', async () => {
      setupGraphState(graph, (/** @type {any} */ state) => {
        addNode(state, 'a', 1);
        addNode(state, 'b', 2);
        addEdge(state, 'a', 'b', 'rel', 3);
      });

      const stream = await graph.getEdgeContentStream('a', 'b', 'rel');
      expect(stream).toBeNull();
    });
  });
});
