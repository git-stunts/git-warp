import { describe, it, expect, vi, beforeEach } from 'vitest';
import QueryController from '../../../../../src/domain/services/controllers/QueryController.ts';
import WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import SnapshotWarpState from '../../../../../src/domain/services/snapshot/SnapshotWarpState.ts';
import ORSet from '../../../../../src/domain/crdt/ORSet.ts';
import VersionVector from '../../../../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import AssetHandle from '../../../../../src/domain/storage/AssetHandle.ts';
import {
  encodePropKey,
  encodeEdgeKey,
  encodeEdgePropKey,
  CONTENT_PROPERTY_KEY,
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
} from '../../../../../src/domain/services/KeyCodec.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates an ORSet with the given elements, each tagged with a unique dot.
 *
 * @param {string[]} elements
 * @returns {ORSet}
 */
function orsetWith(elements) {
  const set = ORSet.empty();
  for (let i = 0; i < elements.length; i++) {
    set.add((elements[i] as string), new Dot('w', i + 1));
  }
  return set;
}

/**
 * Creates a minimal EventId for testing.
 *
 * @param {number} lamport
 * @param {string} writerId
 * @param {string} patchSha
 * @returns {{ lamport: number, writerId: string, patchSha: string }}
 */
function eventId(lamport, writerId = 'w1', patchSha = 'abc') {
  return { lamport, writerId, patchSha };
}

/**
 * Builds an LWW register value.
 *
 * @param {unknown} value
 * @param {{ lamport: number, writerId: string, patchSha: string }|null} [eid]
 * @returns {{ value: unknown, eventId: { lamport: number, writerId: string, patchSha: string }|null }}
 */
function lww(value, eid = null) {
  return { value, eventId: eid };
}

function chunks(...values: Uint8Array[]): AsyncIterable<Uint8Array> {
  return (async function* (): AsyncGenerator<Uint8Array> {
    yield* values;
  })();
}

/**
 * Creates a WarpState with nodes, edges, and properties.
 *
 * @param {{
 *   nodes?: string[],
 *   edges?: Array<{from: string, to: string, label: string}>,
 *   props?: Array<{nodeId: string, key: string, value: unknown, eventId?: { lamport: number, writerId: string, patchSha: string }|null}>,
 *   edgeProps?: Array<{from: string, to: string, label: string, key: string, value: unknown, eventId?: { lamport: number, writerId: string, patchSha: string }|null}>,
 *   edgeBirthEvents?: Array<{from: string, to: string, label: string, eventId: { lamport: number, writerId: string, patchSha: string }}>,
 * }} spec
 * @returns {WarpState}
 */
function buildState(spec = {}) {
  const nodeAlive = orsetWith((spec as any).nodes ?? []);
  const edgeKeys = ((spec as any).edges ?? []).map((e) => encodeEdgeKey(e.from, e.to, e.label));
  const edgeAlive = orsetWith(edgeKeys);

    const prop = (new Map()) as any;
  for (const p of (spec as any).props ?? []) {
    prop.set(encodePropKey(p.nodeId, p.key), lww(p.value, p.eventId ?? null));
  }
  for (const ep of (spec as any).edgeProps ?? []) {
    prop.set(
      encodeEdgePropKey(ep.from, ep.to, ep.label, ep.key),
      lww(ep.value, ep.eventId ?? null),
    );
  }

  const edgeBirthEvent = new Map();
  for (const eb of (spec as any).edgeBirthEvents ?? []) {
    edgeBirthEvent.set(encodeEdgeKey(eb.from, eb.to, eb.label), eb.eventId);
  }

  return new WarpState({
    nodeAlive,
    edgeAlive,
    prop,
    observedFrontier: VersionVector.empty(),
    edgeBirthEvent,
  });
}

/**
 * Creates a mock host with the given cached state and optional overrides.
 *
 * @param {WarpState} state
 * @param {Record<string, unknown>} [overrides]
 * @returns {*}
 */
function createHost(state, overrides = {}) {
  const frontier = new Map([['w', 'tip']]);
  return {
    _cachedState: state,
    _autoMaterialize: true,
    _lastFrontier: frontier,
    _stateDirty: false,
    getFrontier: vi.fn().mockResolvedValue(new Map(frontier)),
    _ensureFreshState: vi.fn().mockResolvedValue(undefined),
    _assetStorage: {
      open: vi.fn(() => chunks(new Uint8Array([1, 2, 3]))),
    },
    _propertyReader: null,
    _logicalIndex: null,
    _materializedGraph: null,
    _crypto: {},
    _codec: {},
    _stateHashService: null,
    ...overrides,
  };
}

function createController(host) {
  return new QueryController({
    hostGraph: host,
    graphCloner: {
      openReadOnly: vi.fn(async () => host),
    },
    hashState: vi.fn(async () => 'state-hash'),
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('QueryController', () => {
    let state;
    let host;
    let ctrl;

  beforeEach(() => {
    state = buildState({
      nodes: ['alice', 'bob', 'carol'],
      edges: [
        { from: 'alice', to: 'bob', label: 'knows' },
        { from: 'bob', to: 'carol', label: 'manages' },
      ],
      props: [
        { nodeId: 'alice', key: 'age', value: 30 },
        { nodeId: 'alice', key: 'name', value: 'Alice' },
        { nodeId: 'bob', key: 'age', value: 25 },
      ],
    });
    host = createHost(state);
    ctrl = createController(host);
  });

  // ── hasNode ──────────────────────────────────────────────────────────────

  describe('hasNode()', () => {
    it('returns true for an existing node', async () => {
      expect(await ctrl.hasNode('alice')).toBe(true);
    });

    it('returns false for a non-existent node', async () => {
      expect(await ctrl.hasNode('nobody')).toBe(false);
    });

    it('ensures fresh state before checking', async () => {
      await ctrl.hasNode('alice');
      expect(host._ensureFreshState).toHaveBeenCalled();
    });
  });

  // ── getNodes ─────────────────────────────────────────────────────────────

  describe('getNodes()', () => {
    it('returns all alive node IDs', async () => {
      const nodes = await ctrl.getNodes();
      expect(nodes.sort()).toEqual(['alice', 'bob', 'carol']);
    });

    it('returns empty array for empty state', async () => {
      host._cachedState = buildState();
      const nodes = await ctrl.getNodes();
      expect(nodes).toEqual([]);
    });
  });

  // ── getNodeProps ─────────────────────────────────────────────────────────

  describe('getNodeProps()', () => {
    it('returns all properties for an existing node', async () => {
      const props = await ctrl.getNodeProps('alice');
      expect(props).toEqual({ age: 30, name: 'Alice' });
    });

    it('returns null for a non-existent node', async () => {
      const props = await ctrl.getNodeProps('nobody');
      expect(props).toBeNull();
    });

    it('returns empty object for a node with no properties', async () => {
      const props = await ctrl.getNodeProps('carol');
      expect(props).toEqual({});
    });

    it('uses indexed fast path when propertyReader is available', async () => {
      const mockReader = {
        getNodeProps: vi.fn().mockResolvedValue({ age: 30, name: 'Alice' }),
      };
      const mockIndex = {
        isAlive: vi.fn().mockReturnValue(true),
      };
      host._propertyReader = mockReader;
      host._logicalIndex = mockIndex;

      const props = await ctrl.getNodeProps('alice');
      expect(props).toEqual({ age: 30, name: 'Alice' });
      expect(mockReader.getNodeProps).toHaveBeenCalledWith('alice');
    });

    it('falls through to linear scan when index returns null', async () => {
      const mockReader = {
        getNodeProps: vi.fn().mockResolvedValue(null),
      };
      const mockIndex = {
        isAlive: vi.fn().mockReturnValue(true),
      };
      host._propertyReader = mockReader;
      host._logicalIndex = mockIndex;

      const props = await ctrl.getNodeProps('alice');
      expect(props).toEqual({ age: 30, name: 'Alice' });
    });

    it('falls through to linear scan when index throws', async () => {
      const mockReader = {
        getNodeProps: vi.fn().mockRejectedValue(new Error('corrupt index')),
      };
      const mockIndex = {
        isAlive: vi.fn().mockReturnValue(true),
      };
      host._propertyReader = mockReader;
      host._logicalIndex = mockIndex;

      const props = await ctrl.getNodeProps('alice');
      expect(props).toEqual({ age: 30, name: 'Alice' });
    });
  });

  // ── getEdgeProps ─────────────────────────────────────────────────────────

  describe('getEdgeProps()', () => {
    it('returns null when edge does not exist', async () => {
      const props = await ctrl.getEdgeProps('alice', 'carol', 'knows');
      expect(props).toBeNull();
    });

    it('returns null when source node is not alive', async () => {
      // Edge exists but source node is gone
      const s = buildState({
        nodes: ['bob'],
        edges: [{ from: 'alice', to: 'bob', label: 'knows' }],
      });
      host._cachedState = s;
      const props = await ctrl.getEdgeProps('alice', 'bob', 'knows');
      expect(props).toBeNull();
    });

    it('returns null when target node is not alive', async () => {
      const s = buildState({
        nodes: ['alice'],
        edges: [{ from: 'alice', to: 'bob', label: 'knows' }],
      });
      host._cachedState = s;
      const props = await ctrl.getEdgeProps('alice', 'bob', 'knows');
      expect(props).toBeNull();
    });

    it('returns empty object for edge with no properties', async () => {
      const props = await ctrl.getEdgeProps('alice', 'bob', 'knows');
      expect(props).toEqual({});
    });

    it('returns edge properties when present', async () => {
      const eid = eventId(5, 'w1', 'sha1');
      const s = buildState({
        nodes: ['alice', 'bob'],
        edges: [{ from: 'alice', to: 'bob', label: 'knows' }],
        edgeProps: [
          { from: 'alice', to: 'bob', label: 'knows', key: 'since', value: 2020, eventId: eid },
        ],
      });
      host._cachedState = s;
      const props = await ctrl.getEdgeProps('alice', 'bob', 'knows');
      expect(props).toEqual({ since: 2020 });
    });

    it('filters out edge props older than edgeBirthEvent', async () => {
      const birthEid = eventId(10, 'w1', 'sha_birth');
      const oldEid = eventId(5, 'w1', 'sha_old');
      const newEid = eventId(15, 'w1', 'sha_new');
      const s = buildState({
        nodes: ['alice', 'bob'],
        edges: [{ from: 'alice', to: 'bob', label: 'knows' }],
        edgeProps: [
          { from: 'alice', to: 'bob', label: 'knows', key: 'stale', value: 'old', eventId: oldEid },
          { from: 'alice', to: 'bob', label: 'knows', key: 'fresh', value: 'new', eventId: newEid },
        ],
        edgeBirthEvents: [
          { from: 'alice', to: 'bob', label: 'knows', eventId: birthEid },
        ],
      });
      host._cachedState = s;
      const props = await ctrl.getEdgeProps('alice', 'bob', 'knows');
      expect(props).toEqual({ fresh: 'new' });
    });
  });

  // ── getEdges ─────────────────────────────────────────────────────────────

  describe('getEdges()', () => {
    it('returns all alive edges with both endpoints alive', async () => {
      const edges = await ctrl.getEdges();
      expect(edges).toEqual([
        { from: 'alice', to: 'bob', label: 'knows', props: {} },
        { from: 'bob', to: 'carol', label: 'manages', props: {} },
      ]);
    });

    it('excludes edges where an endpoint is dead', async () => {
      const s = buildState({
        nodes: ['alice'],
        edges: [
          { from: 'alice', to: 'bob', label: 'knows' },
        ],
      });
      host._cachedState = s;
      const edges = await ctrl.getEdges();
      expect(edges).toEqual([]);
    });

    it('includes edge properties', async () => {
      const eid = eventId(5, 'w1', 'sha1');
      const s = buildState({
        nodes: ['alice', 'bob'],
        edges: [{ from: 'alice', to: 'bob', label: 'knows' }],
        edgeProps: [
          { from: 'alice', to: 'bob', label: 'knows', key: 'weight', value: 42, eventId: eid },
        ],
      });
      host._cachedState = s;
      const edges = await ctrl.getEdges();
      expect(edges).toEqual([
        { from: 'alice', to: 'bob', label: 'knows', props: { weight: 42 } },
      ]);
    });

    it('filters out edge props older than birth event', async () => {
      const birthEid = eventId(10, 'w1', 'sha_birth');
      const oldEid = eventId(5, 'w1', 'sha_old');
      const s = buildState({
        nodes: ['alice', 'bob'],
        edges: [{ from: 'alice', to: 'bob', label: 'knows' }],
        edgeProps: [
          { from: 'alice', to: 'bob', label: 'knows', key: 'stale', value: 'old', eventId: oldEid },
        ],
        edgeBirthEvents: [
          { from: 'alice', to: 'bob', label: 'knows', eventId: birthEid },
        ],
      });
      host._cachedState = s;
      const edges = await ctrl.getEdges();
      expect(edges).toEqual([
        { from: 'alice', to: 'bob', label: 'knows', props: {} },
      ]);
    });

    it('returns empty array for empty state', async () => {
      host._cachedState = buildState();
      const edges = await ctrl.getEdges();
      expect(edges).toEqual([]);
    });
  });

  // ── neighbors ────────────────────────────────────────────────────────────

  describe('neighbors()', () => {
    it('returns outgoing neighbors', async () => {
      const result = await ctrl.neighbors('alice', 'outgoing');
      expect(result).toEqual([
        { nodeId: 'bob', label: 'knows', direction: 'outgoing' },
      ]);
    });

    it('returns incoming neighbors', async () => {
      const result = await ctrl.neighbors('bob', 'incoming');
      expect(result).toEqual([
        { nodeId: 'alice', label: 'knows', direction: 'incoming' },
      ]);
    });

    it('returns both directions by default', async () => {
      const result = await ctrl.neighbors('bob');
      expect(result).toContainEqual({ nodeId: 'alice', label: 'knows', direction: 'incoming' });
      expect(result).toContainEqual({ nodeId: 'carol', label: 'manages', direction: 'outgoing' });
      expect(result).toHaveLength(2);
    });

    it('filters by edge label', async () => {
      const s = buildState({
        nodes: ['a', 'b', 'c'],
        edges: [
          { from: 'a', to: 'b', label: 'knows' },
          { from: 'a', to: 'c', label: 'manages' },
        ],
      });
      host._cachedState = s;
      const result = await ctrl.neighbors('a', 'outgoing', 'manages');
      expect(result).toEqual([
        { nodeId: 'c', label: 'manages', direction: 'outgoing' },
      ]);
    });

    it('returns empty when node has no neighbors', async () => {
      const result = await ctrl.neighbors('carol', 'outgoing');
      expect(result).toEqual([]);
    });

    it('excludes edges pointing to dead nodes', async () => {
      const s = buildState({
        nodes: ['alice'],
        edges: [{ from: 'alice', to: 'bob', label: 'knows' }],
      });
      host._cachedState = s;
      const result = await ctrl.neighbors('alice', 'outgoing');
      expect(result).toEqual([]);
    });

    it('uses indexed fast path when provider is available', async () => {
      const mockProvider = {
        getNeighbors: vi.fn()
          .mockResolvedValueOnce([{ neighborId: 'bob', label: 'knows' }])
          .mockResolvedValueOnce([]),
      };
      const mockIndex = {
        isAlive: vi.fn().mockReturnValue(true),
      };
      host._materializedGraph = { provider: mockProvider };
      host._logicalIndex = mockIndex;

      const result = await ctrl.neighbors('alice', 'both');
      expect(mockProvider.getNeighbors).toHaveBeenCalledTimes(2);
      expect(result).toContainEqual({ nodeId: 'bob', label: 'knows', direction: 'outgoing' });
    });

    it('falls through to linear scan when provider throws', async () => {
      const mockProvider = {
        getNeighbors: vi.fn().mockRejectedValue(new Error('index corrupt')),
      };
      const mockIndex = {
        isAlive: vi.fn().mockReturnValue(true),
      };
      host._materializedGraph = { provider: mockProvider };
      host._logicalIndex = mockIndex;

      const result = await ctrl.neighbors('alice', 'outgoing');
      expect(result).toEqual([
        { nodeId: 'bob', label: 'knows', direction: 'outgoing' },
      ]);
    });
  });

  // ── getPropertyCount ─────────────────────────────────────────────────────

  describe('getPropertyCount()', () => {
    it('returns total number of property entries', async () => {
      const count = await ctrl.getPropertyCount();
      expect(count).toBe(3);
    });

    it('returns zero for empty state', async () => {
      host._cachedState = buildState();
      const count = await ctrl.getPropertyCount();
      expect(count).toBe(0);
    });
  });

  // ── getStateSnapshot ─────────────────────────────────────────────────────

  describe('getStateSnapshot()', () => {
    it('returns an immutable snapshot of the cached state', async () => {
      const snapshot = await ctrl.getStateSnapshot();
      expect(snapshot).not.toBeNull();
      expect(snapshot).toBeInstanceOf(SnapshotWarpState);
    });

    it('returns null when no cached state and autoMaterialize is false', async () => {
      host._cachedState = null;
      host._autoMaterialize = false;
      const snapshot = await ctrl.getStateSnapshot();
      expect(snapshot).toBeNull();
    });
  });

  // ── query ────────────────────────────────────────────────────────────────

  describe('query()', () => {
    it('returns a QueryBuilder instance', () => {
      const qb = ctrl.query();
      expect(qb).toBeDefined();
      expect(typeof qb.match).toBe('function');
    });
  });

  // ── observer ─────────────────────────────────────────────────────────────

  describe('observer()', () => {
    it('throws when config.match is missing', async () => {
      await expect(ctrl.observer(({} as any))).rejects.toThrow(
        'observer config.match must be a non-empty string or non-empty array of strings',
      );
    });

    it('throws when config.match is an empty array', async () => {
      await expect(ctrl.observer({ match: ([] as any) })).rejects.toThrow(
        'observer config.match must be a non-empty string or non-empty array of strings',
      );
    });

    it('accepts an empty string match without throwing validation error', async () => {
      // Empty string is still typeof 'string', so it passes the match check.
      await expect(ctrl.observer({ match: '' })).resolves.toBeDefined();
    });

    it('creates default live observers without full graph materialization', async () => {
      host._materializeGraph = vi.fn().mockRejectedValue(new Error('observer must not materialize'));
      host.getNodeProps = vi.fn().mockResolvedValue({ age: 30, name: 'Alice' });

      const observer = await ctrl.observer('people', { match: 'alice' });
      const props = await observer.getNodeProps('alice');

      expect(host._materializeGraph).not.toHaveBeenCalled();
      expect(props).toEqual({ age: 30, name: 'Alice' });
    });

    it('creates explicit live-source observers without detached full graph materialization', async () => {
      host._materializeGraph = vi.fn().mockRejectedValue(new Error('live observer must not materialize'));

      const observer = await ctrl.observer('people', { match: 'alice' }, { source: { kind: 'live' } });
      const props = await observer.getNodeProps('alice');

      expect(host.getFrontier).toHaveBeenCalled();
      expect(host._materializeGraph).not.toHaveBeenCalled();
      expect(props).toEqual({ age: 30, name: 'Alice' });
    });

    it('uses detached live materialization when the cached frontier is stale', async () => {
      const detachedState = buildState({
        nodes: ['alice'],
        props: [
          { nodeId: 'alice', key: 'name', value: 'Detached Alice' },
        ],
      });
      host._lastFrontier = new Map([['w', 'old-tip']]);
      host.getFrontier = vi.fn().mockResolvedValue(new Map([['w', 'new-tip']]));
      host._materializeGraph = vi.fn().mockResolvedValue({ state: detachedState, stateHash: 'detached-state-hash' });

      const observer = await ctrl.observer('people', { match: 'alice' }, { source: { kind: 'live' } });
      const props = await observer.getNodeProps('alice');

      expect(host.getFrontier).toHaveBeenCalled();
      expect(host._materializeGraph).toHaveBeenCalledWith({ ceiling: null });
      expect(props).toEqual({ name: 'Detached Alice' });
    });

    it('keeps ceiling-scoped live observers on the detached materialization path', async () => {
      host._materializeGraph = vi.fn().mockResolvedValue({ state, stateHash: 'ceiling-hash' });

      const observer = await ctrl.observer('people', { match: 'alice' }, { source: { kind: 'live', ceiling: 7 } });
      const props = await observer.getNodeProps('alice');

      expect(host._materializeGraph).toHaveBeenCalledWith({ ceiling: 7 });
      expect(props).toEqual({ age: 30, name: 'Alice' });
    });
  });

  // ── Content attachment (node) ────────────────────────────────────────────

  describe('getContentHandle()', () => {
    it('returns null when node has no content', async () => {
      const handle = await ctrl.getContentHandle('alice');
      expect(handle).toBeNull();
    });

    it('returns null when node does not exist', async () => {
      const handle = await ctrl.getContentHandle('nobody');
      expect(handle).toBeNull();
    });

    it('returns the opaque handle when content is attached', async () => {
      const s = buildState({
        nodes: ['alice'],
        props: [
          { nodeId: 'alice', key: CONTENT_PROPERTY_KEY, value: 'deadbeef' },
        ],
      });
      host._cachedState = s;
      const handle = await ctrl.getContentHandle('alice');
      expect(handle).toBe('deadbeef');
    });
  });

  describe('getContentMeta()', () => {
    it('returns null when no content is attached', async () => {
      const meta = await ctrl.getContentMeta('alice');
      expect(meta).toBeNull();
    });

    it('returns a handle with null mime/size when siblings are absent', async () => {
      const s = buildState({
        nodes: ['alice'],
        props: [
          { nodeId: 'alice', key: CONTENT_PROPERTY_KEY, value: 'deadbeef' },
        ],
      });
      host._cachedState = s;
      const meta = await ctrl.getContentMeta('alice');
      expect(meta).toEqual({ handle: 'deadbeef', mime: null, size: null });
    });

    it('includes mime and size when from same lineage', async () => {
      const eid = eventId(5, 'w1', 'sha1');
      const s = buildState({
        nodes: ['alice'],
        props: [
          { nodeId: 'alice', key: CONTENT_PROPERTY_KEY, value: 'deadbeef', eventId: eid },
          { nodeId: 'alice', key: CONTENT_MIME_PROPERTY_KEY, value: 'text/plain', eventId: eid },
          { nodeId: 'alice', key: CONTENT_SIZE_PROPERTY_KEY, value: 42, eventId: eid },
        ],
      });
      host._cachedState = s;
      const meta = await ctrl.getContentMeta('alice');
      expect(meta).toEqual({ handle: 'deadbeef', mime: 'text/plain', size: 42 });
    });

    it('returns null mime/size when from different lineage', async () => {
      const eid1 = eventId(5, 'w1', 'sha1');
      const eid2 = eventId(5, 'w2', 'sha2');
      const s = buildState({
        nodes: ['alice'],
        props: [
          { nodeId: 'alice', key: CONTENT_PROPERTY_KEY, value: 'deadbeef', eventId: eid1 },
          { nodeId: 'alice', key: CONTENT_MIME_PROPERTY_KEY, value: 'text/plain', eventId: eid2 },
          { nodeId: 'alice', key: CONTENT_SIZE_PROPERTY_KEY, value: 42, eventId: eid2 },
        ],
      });
      host._cachedState = s;
      const meta = await ctrl.getContentMeta('alice');
      expect(meta).toEqual({ handle: 'deadbeef', mime: null, size: null });
    });

    it('returns null size when value is not a non-negative integer', async () => {
      const eid = eventId(5, 'w1', 'sha1');
      const s = buildState({
        nodes: ['alice'],
        props: [
          { nodeId: 'alice', key: CONTENT_PROPERTY_KEY, value: 'deadbeef', eventId: eid },
          { nodeId: 'alice', key: CONTENT_SIZE_PROPERTY_KEY, value: -1, eventId: eid },
        ],
      });
      host._cachedState = s;
      const meta = await ctrl.getContentMeta('alice');
      expect(meta).toEqual({ handle: 'deadbeef', mime: null, size: null });
    });
  });

  describe('getContent()', () => {
    it('returns null when node has no content', async () => {
      const buf = await ctrl.getContent('alice');
      expect(buf).toBeNull();
    });

    it('streams the asset through the semantic storage port', async () => {
      const s = buildState({
        nodes: ['alice'],
        props: [
          { nodeId: 'alice', key: CONTENT_PROPERTY_KEY, value: 'deadbeef' },
        ],
      });
      host._cachedState = s;
      const buf = await ctrl.getContent('alice');
      expect(buf).toEqual(new Uint8Array([1, 2, 3]));
      expect(host._assetStorage.open).toHaveBeenCalledWith(new AssetHandle('deadbeef'));
    });

    it('collects multiple asset chunks without a raw Git fallback', async () => {
      const assetStorage = {
        open: vi.fn(() => chunks(new Uint8Array([4]), new Uint8Array([5, 6]))),
      };
      host._assetStorage = assetStorage;
      const s = buildState({
        nodes: ['alice'],
        props: [
          { nodeId: 'alice', key: CONTENT_PROPERTY_KEY, value: 'deadbeef' },
        ],
      });
      host._cachedState = s;
      const buf = await ctrl.getContent('alice');
      expect(buf).toEqual(new Uint8Array([4, 5, 6]));
      expect(assetStorage.open).toHaveBeenCalledWith(new AssetHandle('deadbeef'));
    });

    it('fails closed when semantic asset storage is unavailable', async () => {
      host._assetStorage = null;
      host._cachedState = buildState({
        nodes: ['alice'],
        props: [{ nodeId: 'alice', key: CONTENT_PROPERTY_KEY, value: 'deadbeef' }],
      });

      await expect(ctrl.getContent('alice')).rejects.toMatchObject({ code: 'E_CONTENT_STORAGE' });
    });
  });

  // ── Content attachment (edge) ────────────────────────────────────────────

  describe('getEdgeContentHandle()', () => {
    it('returns null when edge has no content', async () => {
      const handle = await ctrl.getEdgeContentHandle('alice', 'bob', 'knows');
      expect(handle).toBeNull();
    });

    it('returns null when edge does not exist', async () => {
      const handle = await ctrl.getEdgeContentHandle('alice', 'carol', 'knows');
      expect(handle).toBeNull();
    });

    it('returns the opaque handle when content is attached to an edge', async () => {
      const s = buildState({
        nodes: ['alice', 'bob'],
        edges: [{ from: 'alice', to: 'bob', label: 'knows' }],
        edgeProps: [
          { from: 'alice', to: 'bob', label: 'knows', key: CONTENT_PROPERTY_KEY, value: 'cafebabe' },
        ],
      });
      host._cachedState = s;
      const handle = await ctrl.getEdgeContentHandle('alice', 'bob', 'knows');
      expect(handle).toBe('cafebabe');
    });

    it('returns null when endpoint node is dead', async () => {
      const s = buildState({
        nodes: ['alice'],
        edges: [{ from: 'alice', to: 'bob', label: 'knows' }],
        edgeProps: [
          { from: 'alice', to: 'bob', label: 'knows', key: CONTENT_PROPERTY_KEY, value: 'cafebabe' },
        ],
      });
      host._cachedState = s;
      const handle = await ctrl.getEdgeContentHandle('alice', 'bob', 'knows');
      expect(handle).toBeNull();
    });
  });

  describe('getEdgeContentMeta()', () => {
    it('returns null when no content is attached', async () => {
      const meta = await ctrl.getEdgeContentMeta('alice', 'bob', 'knows');
      expect(meta).toBeNull();
    });

    it('returns a handle with mime and size from the same lineage', async () => {
      const eid = eventId(5, 'w1', 'sha1');
      const s = buildState({
        nodes: ['alice', 'bob'],
        edges: [{ from: 'alice', to: 'bob', label: 'knows' }],
        edgeProps: [
          { from: 'alice', to: 'bob', label: 'knows', key: CONTENT_PROPERTY_KEY, value: 'cafebabe', eventId: eid },
          { from: 'alice', to: 'bob', label: 'knows', key: CONTENT_MIME_PROPERTY_KEY, value: 'image/png', eventId: eid },
          { from: 'alice', to: 'bob', label: 'knows', key: CONTENT_SIZE_PROPERTY_KEY, value: 1024, eventId: eid },
        ],
      });
      host._cachedState = s;
      const meta = await ctrl.getEdgeContentMeta('alice', 'bob', 'knows');
      expect(meta).toEqual({ handle: 'cafebabe', mime: 'image/png', size: 1024 });
    });

    it('filters edge content behind birth event', async () => {
      const birthEid = eventId(10, 'w1', 'sha_birth');
      const oldEid = eventId(5, 'w1', 'sha_old');
      const s = buildState({
        nodes: ['alice', 'bob'],
        edges: [{ from: 'alice', to: 'bob', label: 'knows' }],
        edgeProps: [
          { from: 'alice', to: 'bob', label: 'knows', key: CONTENT_PROPERTY_KEY, value: 'cafebabe', eventId: oldEid },
        ],
        edgeBirthEvents: [
          { from: 'alice', to: 'bob', label: 'knows', eventId: birthEid },
        ],
      });
      host._cachedState = s;
      const meta = await ctrl.getEdgeContentMeta('alice', 'bob', 'knows');
      expect(meta).toBeNull();
    });
  });

  describe('getEdgeContent()', () => {
    it('returns null when edge has no content', async () => {
      const buf = await ctrl.getEdgeContent('alice', 'bob', 'knows');
      expect(buf).toBeNull();
    });

    it('streams the edge asset through the semantic storage port', async () => {
      const s = buildState({
        nodes: ['alice', 'bob'],
        edges: [{ from: 'alice', to: 'bob', label: 'knows' }],
        edgeProps: [
          { from: 'alice', to: 'bob', label: 'knows', key: CONTENT_PROPERTY_KEY, value: 'cafebabe' },
        ],
      });
      host._cachedState = s;
      const buf = await ctrl.getEdgeContent('alice', 'bob', 'knows');
      expect(buf).toEqual(new Uint8Array([1, 2, 3]));
      expect(host._assetStorage.open).toHaveBeenCalledWith(new AssetHandle('cafebabe'));
    });

    it('collects multiple edge asset chunks', async () => {
      const assetStorage = {
        open: vi.fn(() => chunks(new Uint8Array([7, 8]), new Uint8Array([9]))),
      };
      host._assetStorage = assetStorage;
      const s = buildState({
        nodes: ['alice', 'bob'],
        edges: [{ from: 'alice', to: 'bob', label: 'knows' }],
        edgeProps: [
          { from: 'alice', to: 'bob', label: 'knows', key: CONTENT_PROPERTY_KEY, value: 'cafebabe' },
        ],
      });
      host._cachedState = s;
      const buf = await ctrl.getEdgeContent('alice', 'bob', 'knows');
      expect(buf).toEqual(new Uint8Array([7, 8, 9]));
      expect(assetStorage.open).toHaveBeenCalledWith(new AssetHandle('cafebabe'));
    });
  });

  // ── Content streams ──────────────────────────────────────────────────────

  describe('getContentStream()', () => {
    it('returns null when node has no content', async () => {
      const stream = await ctrl.getContentStream('alice');
      expect(stream).toBeNull();
    });

    it('returns the asset stream', async () => {
      const s = buildState({
        nodes: ['alice'],
        props: [
          { nodeId: 'alice', key: CONTENT_PROPERTY_KEY, value: 'deadbeef' },
        ],
      });
      host._cachedState = s;
      const stream = await ctrl.getContentStream('alice');
      expect(stream).not.toBeNull();

      const chunks: any[] = [];
      for await (const chunk of (stream)) {
        chunks.push(chunk);
      }
      expect(chunks).toEqual([new Uint8Array([1, 2, 3])]);
    });

    it('preserves multiple chunks from the asset storage stream', async () => {
      const assetStorage = {
        open: vi.fn(() => chunks(new Uint8Array([10]), new Uint8Array([20]))),
      };
      host._assetStorage = assetStorage;
      const s = buildState({
        nodes: ['alice'],
        props: [
          { nodeId: 'alice', key: CONTENT_PROPERTY_KEY, value: 'deadbeef' },
        ],
      });
      host._cachedState = s;
      const stream = await ctrl.getContentStream('alice');
      expect(stream).not.toBeNull();
      const observed: Uint8Array[] = [];
      for await (const chunk of stream as AsyncIterable<Uint8Array>) {
        observed.push(chunk);
      }
      expect(observed).toEqual([new Uint8Array([10]), new Uint8Array([20])]);
      expect(assetStorage.open).toHaveBeenCalledWith(new AssetHandle('deadbeef'));
    });
  });

  describe('getEdgeContentStream()', () => {
    it('returns null when edge has no content', async () => {
      const stream = await ctrl.getEdgeContentStream('alice', 'bob', 'knows');
      expect(stream).toBeNull();
    });

    it('returns the edge asset stream', async () => {
      const s = buildState({
        nodes: ['alice', 'bob'],
        edges: [{ from: 'alice', to: 'bob', label: 'knows' }],
        edgeProps: [
          { from: 'alice', to: 'bob', label: 'knows', key: CONTENT_PROPERTY_KEY, value: 'cafebabe' },
        ],
      });
      host._cachedState = s;
      const stream = await ctrl.getEdgeContentStream('alice', 'bob', 'knows');
      expect(stream).not.toBeNull();

      const chunks: any[] = [];
      for await (const chunk of (stream)) {
        chunks.push(chunk);
      }
      expect(chunks).toEqual([new Uint8Array([1, 2, 3])]);
    });
  });

  // ── worldline ────────────────────────────────────────────────────────────

  describe('worldline()', () => {
    it('returns a ProjectionHandle instance', () => {
      const wl = ctrl.worldline();
      expect(wl).toBeDefined();
      expect(typeof wl.query).toBe('function');
    });
  });

  // ── translationCost ──────────────────────────────────────────────────────

  describe('translationCost()', () => {
    it('returns cost breakdown between two observer configs', async () => {
      const result = await ctrl.translationCost(
        { match: 'alice' },
        { match: 'bob' },
      );
      expect(result).toHaveProperty('cost');
      expect(result).toHaveProperty('breakdown');
      expect(result.breakdown).toHaveProperty('nodeLoss');
      expect(result.breakdown).toHaveProperty('edgeLoss');
      expect(result.breakdown).toHaveProperty('propLoss');
    });

    it('returns zero cost for identical observer configs', async () => {
      const result = await ctrl.translationCost(
        { match: '*' },
        { match: '*' },
      );
      expect(result.cost).toBe(0);
    });
  });
});
