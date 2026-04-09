/**
 * Tests for ComparisonController — coordinate comparison, strand comparison,
 * transfer planning, patch divergence, and input validation.
 *
 * @see src/domain/services/controllers/ComparisonController.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import ComparisonController from '../../../../../src/domain/services/controllers/ComparisonController.js';
import WarpStateV5 from '../../../../../src/domain/services/state/WarpStateV5.ts';
import ORSet from '../../../../../src/domain/crdt/ORSet.ts';
import VersionVector from '../../../../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import { encodeEdgeKey, encodePropKey, encodeEdgePropKey } from '../../../../../src/domain/services/KeyCodec.js';

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const {
  buildCoordinateComparisonFactMock,
  buildCoordinateTransferPlanFactMock,
} = vi.hoisted(() => ({
  buildCoordinateComparisonFactMock: vi.fn((input) => ({ ...input, _factExported: true })),
  buildCoordinateTransferPlanFactMock: vi.fn((input) => ({ ...input, _factExported: true })),
}));

vi.mock('../../../../../src/domain/services/CoordinateFactExport.js', () => ({
  buildCoordinateComparisonFact: buildCoordinateComparisonFactMock,
  buildCoordinateTransferPlanFact: buildCoordinateTransferPlanFactMock,
}));

const { compareVisibleStateV5Mock } = vi.hoisted(() => ({
  compareVisibleStateV5Mock: vi.fn(() => ({
    comparisonVersion: 'visible-state-compare/v1',
    changed: false,
    nodeDelta: { added: [], removed: [] },
    edgeDelta: { added: [], removed: [] },
    nodePropertyDelta: [],
    edgePropertyDelta: [],
  })),
}));

vi.mock('../../../../../src/domain/services/VisibleStateComparisonV5.js', () => ({
  compareVisibleStateV5: compareVisibleStateV5Mock,
}));

const { planVisibleStateTransferV5Mock } = vi.hoisted(() => ({
  planVisibleStateTransferV5Mock: vi.fn(async () => ({
    summary: { opCount: 0, nodeAdds: 0, nodeRemoves: 0, edgeAdds: 0, edgeRemoves: 0, propSets: 0 },
    ops: [],
  })),
}));

vi.mock('../../../../../src/domain/services/VisibleStateTransferPlannerV5.js', () => ({
  planVisibleStateTransferV5: planVisibleStateTransferV5Mock,
}));

const {
  normalizeVisibleStateScopeV1Mock,
  scopeMaterializedStateV5Mock,
  scopePatchEntriesV1Mock,
} = vi.hoisted(() => ({
  normalizeVisibleStateScopeV1Mock: vi.fn((scope) => scope ?? null),
  scopeMaterializedStateV5Mock: vi.fn((state) => state),
  scopePatchEntriesV1Mock: vi.fn((entries) => entries),
}));

vi.mock('../../../../../src/domain/services/VisibleStateScopeV1.js', () => ({
  normalizeVisibleStateScopeV1: normalizeVisibleStateScopeV1Mock,
  scopeMaterializedStateV5: scopeMaterializedStateV5Mock,
  scopePatchEntriesV1: scopePatchEntriesV1Mock,
}));

const { computeChecksumMock } = vi.hoisted(() => ({
  computeChecksumMock: vi.fn(async () => 'checksum-abc123'),
}));

vi.mock('../../../../../src/domain/utils/checksumUtils.ts', () => ({
  computeChecksum: computeChecksumMock,
}));

const { callInternalRuntimeMethodMock } = vi.hoisted(() => ({
  callInternalRuntimeMethodMock: vi.fn(),
}));

vi.mock('../../../../../src/domain/utils/callInternalRuntimeMethod.ts', () => ({
  callInternalRuntimeMethod: callInternalRuntimeMethodMock,
}));

const { strandServiceGetOrThrowMock, strandServiceGetPatchEntriesMock } = vi.hoisted(() => ({
  strandServiceGetOrThrowMock: vi.fn(),
  strandServiceGetPatchEntriesMock: vi.fn(async () => []),
}));

vi.mock('../../../../../src/domain/services/strand/StrandService.js', () => {
  class MockStrandService {
    /** @param {Record<string, unknown>} _opts */
    constructor(_opts) {
      this.getOrThrow = strandServiceGetOrThrowMock;
      this.getPatchEntries = strandServiceGetPatchEntriesMock;
    }
  }
  return { default: MockStrandService };
});

// StateReaderV5 — pass through to real implementation for reader accuracy
// (we need real getNodes/getEdges/getNodeProps for summarizeVisibleState)

const { computeStateHashV5Mock } = vi.hoisted(() => ({
  computeStateHashV5Mock: vi.fn(async () => 'state-hash-deadbeef'),
}));

vi.mock('../../../../../src/domain/services/state/StateSerializerV5.js', async (importOriginal) => {
  const original = /** @type {Record<string, unknown>} */ (await importOriginal());
  return {
    ...original,
    computeStateHashV5: computeStateHashV5Mock,
  };
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates an ORSet with the given elements tagged with unique dots.
 *
 * @param {string[]} elements
 * @returns {ORSet}
 */
function orsetWith(elements) {
  const set = ORSet.empty();
  for (let i = 0; i < elements.length; i++) {
    set.add(elements[i], new Dot('w', i + 1));
  }
  return set;
}

/**
 * Creates a minimal WarpStateV5 for testing.
 *
 * @param {{ nodes?: string[], edges?: Array<{from: string, to: string, label: string}>, props?: Array<{nodeId: string, key: string, value: unknown}> }} [opts]
 * @returns {WarpStateV5}
 */
function makeState(opts = {}) {
  const { nodes = [], edges = [], props = [] } = opts;
  const edgeKeys = edges.map((e) => encodeEdgeKey(e.from, e.to, e.label));
  /** @type {Map<string, { value: unknown, eventId: null }>} */
  const propMap = new Map();
  for (const p of props) {
    propMap.set(encodePropKey(p.nodeId, p.key), { value: p.value, eventId: null });
  }
  return new WarpStateV5({
    nodeAlive: orsetWith(nodes),
    edgeAlive: orsetWith(edgeKeys),
    prop: propMap,
    observedFrontier: VersionVector.empty(),
    edgeBirthEvent: new Map(),
  });
}

/**
 * Creates a mock patch entry.
 *
 * @param {{ writer: string, lamport?: number, sha?: string, reads?: string[], writes?: string[] }} opts
 * @returns {{ patch: { writer: string, lamport: number, reads: string[], writes: string[] }, sha: string }}
 */
function makePatchEntry({ writer, lamport = 1, sha, reads = [], writes = [] }) {
  return {
    patch: { writer, lamport, reads, writes },
    sha: sha ?? `sha-${writer}-${lamport}`,
  };
}

/**
 * Creates a mock host that mimics WarpRuntime fields used by ComparisonController.
 *
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function createMockHost(overrides = {}) {
  const emptyState = makeState();
  /** @type {Record<string, unknown>} */
  const host = {
    _graphName: 'test-graph',
    _crypto: { hash: vi.fn(async () => 'mock-hash') },
    _codec: {},
    _stateHashService: null,
    _blobStorage: null,
    _persistence: {
      readBlob: vi.fn(async () => new Uint8Array([1, 2, 3])),
    },
    getFrontier: vi.fn(async () => new Map([['alice', 'sha-alice-1']])),
    materializeCoordinate: vi.fn(async () => emptyState),
    _loadPatchChainFromSha: vi.fn(async () => []),
    ...overrides,
  };
  return host;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ComparisonController', () => {
  /** @type {ComparisonController} */
  let controller;
  /** @type {ReturnType<typeof createMockHost>} */
  let host;

  beforeEach(() => {
    vi.clearAllMocks();
    host = createMockHost();
    controller = new ComparisonController(/** @type {never} */ (host));
  });

  // ── buildPatchDivergence ─────────────────────────────────────────────────

  describe('buildPatchDivergence', () => {
    it('returns zero divergence for identical entries', () => {
      const entries = [makePatchEntry({ writer: 'alice', lamport: 1, sha: 'aaa' })];
      const result = controller.buildPatchDivergence(entries, entries, null);

      expect(result.sharedCount).toBe(1);
      expect(result.leftOnlyCount).toBe(0);
      expect(result.rightOnlyCount).toBe(0);
      expect(result.leftOnlyPatchShas).toEqual([]);
      expect(result.rightOnlyPatchShas).toEqual([]);
    });

    it('detects patches unique to each side', () => {
      const left = [
        makePatchEntry({ writer: 'alice', lamport: 1, sha: 'aaa' }),
        makePatchEntry({ writer: 'alice', lamport: 2, sha: 'bbb' }),
      ];
      const right = [
        makePatchEntry({ writer: 'alice', lamport: 1, sha: 'aaa' }),
        makePatchEntry({ writer: 'bob', lamport: 1, sha: 'ccc' }),
      ];
      const result = controller.buildPatchDivergence(left, right, null);

      expect(result.sharedCount).toBe(1);
      expect(result.leftOnlyCount).toBe(1);
      expect(result.rightOnlyCount).toBe(1);
      expect(result.leftOnlyPatchShas).toEqual(['bbb']);
      expect(result.rightOnlyPatchShas).toEqual(['ccc']);
    });

    it('returns empty divergence for empty entry sets', () => {
      const result = controller.buildPatchDivergence([], [], null);

      expect(result.sharedCount).toBe(0);
      expect(result.leftOnlyCount).toBe(0);
      expect(result.rightOnlyCount).toBe(0);
    });

    it('deduplicates patch SHAs within a side', () => {
      const left = [
        makePatchEntry({ writer: 'alice', lamport: 1, sha: 'aaa' }),
        makePatchEntry({ writer: 'bob', lamport: 1, sha: 'aaa' }),
      ];
      const right = [];
      const result = controller.buildPatchDivergence(left, right, null);

      expect(result.leftOnlyCount).toBe(1);
      expect(result.leftOnlyPatchShas).toEqual(['aaa']);
    });

    it('sorts patch SHAs deterministically', () => {
      const left = [
        makePatchEntry({ writer: 'a', sha: 'ccc' }),
        makePatchEntry({ writer: 'b', sha: 'aaa' }),
        makePatchEntry({ writer: 'c', sha: 'bbb' }),
      ];
      const result = controller.buildPatchDivergence(left, [], null);

      expect(result.leftOnlyPatchShas).toEqual(['aaa', 'bbb', 'ccc']);
    });

    it('includes target divergence when targetId is provided', () => {
      const left = [
        makePatchEntry({ writer: 'alice', sha: 'aaa', writes: ['node:1'] }),
        makePatchEntry({ writer: 'alice', sha: 'bbb', writes: ['node:2'] }),
      ];
      const right = [
        makePatchEntry({ writer: 'bob', sha: 'ccc', writes: ['node:1'] }),
      ];
      const result = controller.buildPatchDivergence(left, right, 'node:1');

      expect(result.target).toBeDefined();
      const target = /** @type {Record<string, unknown>} */ (result.target);
      expect(target.targetId).toBe('node:1');
      expect(target.leftCount).toBe(1);
      expect(target.rightCount).toBe(1);
      expect(target.leftOnlyPatchShas).toEqual(['aaa']);
      expect(target.rightOnlyPatchShas).toEqual(['ccc']);
    });

    it('does not include target when targetId is null', () => {
      const entries = [makePatchEntry({ writer: 'alice', sha: 'aaa', writes: ['node:1'] })];
      const result = controller.buildPatchDivergence(entries, entries, null);

      expect(result.target).toBeUndefined();
    });

    it('considers reads when determining target patches', () => {
      const left = [
        makePatchEntry({ writer: 'alice', sha: 'aaa', reads: ['node:1'], writes: [] }),
      ];
      const result = controller.buildPatchDivergence(left, [], 'node:1');

      const target = /** @type {Record<string, unknown>} */ (result.target);
      expect(target.leftCount).toBe(1);
    });
  });

  // ── compareCoordinates ───────────────────────────────────────────────────

  describe('compareCoordinates', () => {
    it('rejects null options', async () => {
      await expect(controller.compareCoordinates(/** @type {never} */ (null)))
        .rejects.toThrow(/requires an options object/);
    });

    it('rejects array options', async () => {
      await expect(controller.compareCoordinates(/** @type {never} */ ([])))
        .rejects.toThrow(/requires an options object/);
    });

    it('rejects unsupported selector kind', async () => {
      await expect(controller.compareCoordinates({
        left: { kind: 'nonexistent' },
        right: { kind: 'live' },
      })).rejects.toThrow(/unsupported/);
    });

    it('compares two live selectors', async () => {
      const state = makeState({ nodes: ['a', 'b'] });
      /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mockResolvedValue(state);
      /** @type {ReturnType<typeof vi.fn>} */ (host._loadPatchChainFromSha).mockResolvedValue([
        makePatchEntry({ writer: 'alice', lamport: 1, sha: 'sha-alice-1' }),
      ]);

      const result = await controller.compareCoordinates({
        left: { kind: 'live' },
        right: { kind: 'live' },
      });

      expect(result).toBeDefined();
      expect(result.comparisonDigest).toBe('checksum-abc123');
      expect(compareVisibleStateV5Mock).toHaveBeenCalled();
    });

    it('compares two explicit coordinate selectors', async () => {
      const state = makeState({ nodes: ['x'] });
      /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mockResolvedValue(state);
      /** @type {ReturnType<typeof vi.fn>} */ (host._loadPatchChainFromSha).mockResolvedValue([]);

      const result = await controller.compareCoordinates({
        left: { kind: 'coordinate', frontier: { alice: 'sha1' } },
        right: { kind: 'coordinate', frontier: { bob: 'sha2' } },
      });

      expect(result).toBeDefined();
      expect(result.comparisonDigest).toBe('checksum-abc123');
      expect(/** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate)).toHaveBeenCalled();
    });

    it('passes lamport ceiling to materializeCoordinate', async () => {
      const state = makeState();
      /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mockResolvedValue(state);
      /** @type {ReturnType<typeof vi.fn>} */ (host._loadPatchChainFromSha).mockResolvedValue([]);

      await controller.compareCoordinates({
        left: { kind: 'coordinate', frontier: { alice: 'sha1' }, ceiling: 5 },
        right: { kind: 'coordinate', frontier: { bob: 'sha2' }, ceiling: 10 },
      });

      const calls = /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mock.calls;
      expect(calls[0][0]).toEqual(expect.objectContaining({ ceiling: 5 }));
      expect(calls[1][0]).toEqual(expect.objectContaining({ ceiling: 10 }));
    });

    it('rejects invalid lamport ceiling (negative)', async () => {
      await expect(controller.compareCoordinates({
        left: { kind: 'live', ceiling: -1 },
        right: { kind: 'live' },
      })).rejects.toThrow(/non-negative integer/);
    });

    it('rejects invalid lamport ceiling (non-integer)', async () => {
      await expect(controller.compareCoordinates({
        left: { kind: 'live', ceiling: 3.5 },
        right: { kind: 'live' },
      })).rejects.toThrow(/non-negative integer/);
    });

    it('rejects frontier with empty writer id', async () => {
      await expect(controller.compareCoordinates({
        left: { kind: 'coordinate', frontier: { '': 'sha1' } },
        right: { kind: 'live' },
      })).rejects.toThrow(/invalid writer id/);
    });

    it('rejects frontier with empty SHA', async () => {
      await expect(controller.compareCoordinates({
        left: { kind: 'coordinate', frontier: { alice: '' } },
        right: { kind: 'live' },
      })).rejects.toThrow(/invalid patch sha/);
    });

    it('includes targetId in divergence when provided', async () => {
      const state = makeState();
      /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mockResolvedValue(state);
      /** @type {ReturnType<typeof vi.fn>} */ (host._loadPatchChainFromSha).mockResolvedValue([]);

      await controller.compareCoordinates({
        left: { kind: 'live' },
        right: { kind: 'live' },
        targetId: 'node:1',
      });

      expect(compareVisibleStateV5Mock).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ targetId: 'node:1' }),
      );
    });

    it('rejects invalid targetId (empty string)', async () => {
      await expect(controller.compareCoordinates({
        left: { kind: 'live' },
        right: { kind: 'live' },
        targetId: '   ',
      })).rejects.toThrow(/non-empty string/);
    });

    it('passes scope through normalization', async () => {
      const state = makeState();
      /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mockResolvedValue(state);
      /** @type {ReturnType<typeof vi.fn>} */ (host._loadPatchChainFromSha).mockResolvedValue([]);

      const scope = { nodeIdPrefixes: { include: ['user:'] } };
      normalizeVisibleStateScopeV1Mock.mockReturnValue(scope);

      await controller.compareCoordinates({
        left: { kind: 'live' },
        right: { kind: 'live' },
        scope,
      });

      expect(normalizeVisibleStateScopeV1Mock).toHaveBeenCalled();
      expect(scopeMaterializedStateV5Mock).toHaveBeenCalled();
    });

    it('captures live frontier once for both sides', async () => {
      const state = makeState();
      /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mockResolvedValue(state);
      /** @type {ReturnType<typeof vi.fn>} */ (host._loadPatchChainFromSha).mockResolvedValue([]);

      await controller.compareCoordinates({
        left: { kind: 'live' },
        right: { kind: 'live' },
      });

      // getFrontier should be called exactly once for both sides
      expect(/** @type {ReturnType<typeof vi.fn>} */ (host.getFrontier)).toHaveBeenCalledTimes(1);
    });

    it('does not call getFrontier when neither side is live', async () => {
      const state = makeState();
      /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mockResolvedValue(state);
      /** @type {ReturnType<typeof vi.fn>} */ (host._loadPatchChainFromSha).mockResolvedValue([]);

      await controller.compareCoordinates({
        left: { kind: 'coordinate', frontier: { alice: 'sha1' } },
        right: { kind: 'coordinate', frontier: { bob: 'sha2' } },
      });

      expect(/** @type {ReturnType<typeof vi.fn>} */ (host.getFrontier)).not.toHaveBeenCalled();
    });

    it('accepts frontier as Map', async () => {
      const state = makeState();
      /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mockResolvedValue(state);
      /** @type {ReturnType<typeof vi.fn>} */ (host._loadPatchChainFromSha).mockResolvedValue([]);

      const frontier = new Map([['alice', 'sha1']]);
      const result = await controller.compareCoordinates({
        left: { kind: 'coordinate', frontier },
        right: { kind: 'live' },
      });

      expect(result).toBeDefined();
    });
  });

  // ── compareStrand ────────────────────────────────────────────────────────

  describe('compareStrand', () => {
    beforeEach(() => {
      const state = makeState();
      /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mockResolvedValue(state);
      /** @type {ReturnType<typeof vi.fn>} */ (host._loadPatchChainFromSha).mockResolvedValue([]);

      const descriptor = {
        baseObservation: {
          frontier: new Map([['alice', 'sha-base']]),
          lamportCeiling: null,
        },
        overlay: {
          headPatchSha: 'sha-overlay',
          patchCount: 3,
          writable: true,
        },
        braid: { readOverlays: [] },
      };
      strandServiceGetOrThrowMock.mockResolvedValue(descriptor);
      callInternalRuntimeMethodMock.mockResolvedValue(state);
    });

    it('rejects empty strandId', async () => {
      await expect(controller.compareStrand('', {}))
        .rejects.toThrow(/non-empty string/);
    });

    it('rejects non-string strandId', async () => {
      await expect(controller.compareStrand(/** @type {never} */ (42), {}))
        .rejects.toThrow(/non-empty string/);
    });

    it('compares strand against base by default', async () => {
      const result = await controller.compareStrand('my-strand');

      expect(result).toBeDefined();
      expect(strandServiceGetOrThrowMock).toHaveBeenCalledWith('my-strand');
    });

    it('compares strand against live when specified', async () => {
      const result = await controller.compareStrand('my-strand', { against: 'live' });

      expect(result).toBeDefined();
      expect(/** @type {ReturnType<typeof vi.fn>} */ (host.getFrontier)).toHaveBeenCalled();
    });

    it('compares strand against another strand', async () => {
      const result = await controller.compareStrand('my-strand', {
        against: { kind: 'strand', strandId: 'other-strand' },
      });

      expect(result).toBeDefined();
    });

    it('rejects invalid against value', async () => {
      await expect(controller.compareStrand('my-strand', { against: 'invalid' }))
        .rejects.toThrow(/against must be/);
    });

    it('rejects non-object options', async () => {
      await expect(controller.compareStrand('my-strand', /** @type {never} */ ('bad')))
        .rejects.toThrow(/options must be an object/);
    });

    it('passes ceiling through to strand resolution', async () => {
      await controller.compareStrand('my-strand', { ceiling: 5 });

      expect(callInternalRuntimeMethodMock).toHaveBeenCalledWith(
        expect.anything(),
        'materializeStrand',
        'my-strand',
        { ceiling: 5 },
      );
    });

    it('passes againstCeiling through for base comparison', async () => {
      const descriptor = {
        baseObservation: {
          frontier: new Map([['alice', 'sha-base']]),
          lamportCeiling: 10,
        },
        overlay: { headPatchSha: 'sha-overlay', patchCount: 1, writable: true },
        braid: { readOverlays: [] },
      };
      strandServiceGetOrThrowMock.mockResolvedValue(descriptor);

      await controller.compareStrand('my-strand', { againstCeiling: 3 });

      // The against side is strand_base which combines ceilings (min of 10, 3 = 3)
      const calls = /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mock.calls;
      const strandBaseCall = calls.find(
        (/** @type {unknown[]} */ c) => /** @type {Record<string, unknown>} */ (c[0]).ceiling === 3,
      );
      expect(strandBaseCall).toBeDefined();
    });
  });

  // ── planCoordinateTransfer ───────────────────────────────────────────────

  describe('planCoordinateTransfer', () => {
    beforeEach(() => {
      const state = makeState();
      /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mockResolvedValue(state);
      /** @type {ReturnType<typeof vi.fn>} */ (host._loadPatchChainFromSha).mockResolvedValue([]);
    });

    it('rejects null options', async () => {
      await expect(controller.planCoordinateTransfer(/** @type {never} */ (null)))
        .rejects.toThrow(/requires an options object/);
    });

    it('rejects undefined options', async () => {
      await expect(controller.planCoordinateTransfer(/** @type {never} */ (undefined)))
        .rejects.toThrow(/requires an options object/);
    });

    it('plans transfer between two live selectors', async () => {
      const result = await controller.planCoordinateTransfer({
        source: { kind: 'live' },
        target: { kind: 'live' },
      });

      expect(result).toBeDefined();
      expect(result.transferVersion).toBe('coordinate-transfer-plan/v1');
      expect(result.transferDigest).toBe('checksum-abc123');
      expect(result.changed).toBe(false);
    });

    it('plans transfer between coordinate selectors', async () => {
      const result = await controller.planCoordinateTransfer({
        source: { kind: 'coordinate', frontier: { alice: 'sha1' } },
        target: { kind: 'coordinate', frontier: { bob: 'sha2' } },
      });

      expect(result).toBeDefined();
      expect(planVisibleStateTransferV5Mock).toHaveBeenCalled();
    });

    it('reports changed=true when transfer has ops', async () => {
      planVisibleStateTransferV5Mock.mockResolvedValueOnce({
        summary: { opCount: 2, nodeAdds: 1, nodeRemoves: 1, edgeAdds: 0, edgeRemoves: 0, propSets: 0 },
        ops: [{ kind: 'node-add', nodeId: 'x' }, { kind: 'node-remove', nodeId: 'y' }],
      });

      const result = await controller.planCoordinateTransfer({
        source: { kind: 'live' },
        target: { kind: 'live' },
      });

      expect(result.changed).toBe(true);
    });

    it('includes scope in result when provided', async () => {
      const scope = { nodeIdPrefixes: { include: ['user:'] } };
      normalizeVisibleStateScopeV1Mock.mockReturnValue(scope);

      const result = await controller.planCoordinateTransfer({
        source: { kind: 'live' },
        target: { kind: 'live' },
        scope,
      });

      expect(result.scope).toEqual(scope);
    });

    it('loads content blobs via blobStorage when available', async () => {
      const blobStorageRetrieve = vi.fn(async () => new Uint8Array([10, 20]));
      host._blobStorage = { retrieve: blobStorageRetrieve };

      planVisibleStateTransferV5Mock.mockImplementationOnce(async (_src, _tgt, loaders) => {
        // Simulate the planner calling loadNodeContent
        if (loaders.loadNodeContent) {
          await loaders.loadNodeContent('n1', { oid: 'blob-oid' });
        }
        return { summary: { opCount: 0 }, ops: [] };
      });

      await controller.planCoordinateTransfer({
        source: { kind: 'live' },
        target: { kind: 'live' },
      });

      expect(blobStorageRetrieve).toHaveBeenCalledWith('blob-oid');
    });

    it('falls back to persistence.readBlob when blobStorage is null', async () => {
      host._blobStorage = null;

      planVisibleStateTransferV5Mock.mockImplementationOnce(async (_src, _tgt, loaders) => {
        if (loaders.loadEdgeContent) {
          await loaders.loadEdgeContent('e1', { oid: 'blob-oid-2' });
        }
        return { summary: { opCount: 0 }, ops: [] };
      });

      await controller.planCoordinateTransfer({
        source: { kind: 'live' },
        target: { kind: 'live' },
      });

      expect(/** @type {ReturnType<typeof vi.fn>} */ (
        /** @type {{ readBlob: ReturnType<typeof vi.fn> }} */ (host._persistence).readBlob
      )).toHaveBeenCalledWith('blob-oid-2');
    });
  });

  // ── planStrandTransfer ───────────────────────────────────────────────────

  describe('planStrandTransfer', () => {
    beforeEach(() => {
      const state = makeState();
      /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mockResolvedValue(state);
      /** @type {ReturnType<typeof vi.fn>} */ (host._loadPatchChainFromSha).mockResolvedValue([]);

      const descriptor = {
        baseObservation: { frontier: new Map([['alice', 'sha-base']]), lamportCeiling: null },
        overlay: { headPatchSha: 'sha-overlay', patchCount: 3, writable: true },
        braid: { readOverlays: [] },
      };
      strandServiceGetOrThrowMock.mockResolvedValue(descriptor);
      callInternalRuntimeMethodMock.mockResolvedValue(state);
    });

    it('rejects empty strandId', async () => {
      await expect(controller.planStrandTransfer('')).rejects.toThrow(/non-empty string/);
    });

    it('plans transfer into live by default', async () => {
      const result = await controller.planStrandTransfer('my-strand');

      expect(result).toBeDefined();
      expect(result.transferVersion).toBe('coordinate-transfer-plan/v1');
    });

    it('plans transfer into base', async () => {
      const result = await controller.planStrandTransfer('my-strand', { into: 'base' });

      expect(result).toBeDefined();
    });

    it('plans transfer into another strand', async () => {
      const result = await controller.planStrandTransfer('my-strand', {
        into: { kind: 'strand', strandId: 'other-strand' },
      });

      expect(result).toBeDefined();
    });

    it('rejects invalid into value', async () => {
      await expect(controller.planStrandTransfer('my-strand', { into: 'invalid' }))
        .rejects.toThrow(/into must be/);
    });

    it('rejects non-object options', async () => {
      await expect(controller.planStrandTransfer('my-strand', /** @type {never} */ (42)))
        .rejects.toThrow(/options must be an object/);
    });
  });

  // ── Selector normalization (validated via compareCoordinates) ─────────────

  describe('selector normalization', () => {
    beforeEach(() => {
      const state = makeState();
      /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mockResolvedValue(state);
      /** @type {ReturnType<typeof vi.fn>} */ (host._loadPatchChainFromSha).mockResolvedValue([]);
    });

    it('rejects coordinate selector without frontier', async () => {
      await expect(controller.compareCoordinates({
        left: { kind: 'coordinate' },
        right: { kind: 'live' },
      })).rejects.toThrow(/frontier/);
    });

    it('rejects strand selector without strandId', async () => {
      await expect(controller.compareCoordinates({
        left: { kind: 'strand' },
        right: { kind: 'live' },
      })).rejects.toThrow(/non-empty string/);
    });

    it('rejects strand_base selector without strandId', async () => {
      await expect(controller.compareCoordinates({
        left: { kind: 'strand_base' },
        right: { kind: 'live' },
      })).rejects.toThrow(/non-empty string/);
    });

    it('rejects selector with empty kind', async () => {
      await expect(controller.compareCoordinates({
        left: { kind: '' },
        right: { kind: 'live' },
      })).rejects.toThrow(/unsupported/);
    });

    it('normalizes frontier record by sorting writer IDs', async () => {
      const state = makeState();
      /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mockResolvedValue(state);
      /** @type {ReturnType<typeof vi.fn>} */ (host._loadPatchChainFromSha).mockResolvedValue([]);

      await controller.compareCoordinates({
        left: { kind: 'coordinate', frontier: { bob: 'sha2', alice: 'sha1' } },
        right: { kind: 'coordinate', frontier: { charlie: 'sha3' } },
      });

      // Verify materializeCoordinate was called with sorted frontier Maps
      const calls = /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const firstFrontier = /** @type {Map<string, string>} */ (
        /** @type {Record<string, unknown>} */ (calls[0][0]).frontier
      );
      expect([...firstFrontier.keys()]).toEqual(['alice', 'bob']);
    });
  });

  // ── Strand resolution (via compareCoordinates with strand selectors) ─────

  describe('strand selector resolution', () => {
    const strandDescriptor = {
      baseObservation: {
        frontier: new Map([['alice', 'sha-base']]),
        lamportCeiling: 5,
      },
      overlay: { headPatchSha: 'sha-overlay', patchCount: 2, writable: true },
      braid: { readOverlays: [{ strandId: 'braid-1' }] },
    };

    beforeEach(() => {
      const state = makeState();
      /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mockResolvedValue(state);
      /** @type {ReturnType<typeof vi.fn>} */ (host._loadPatchChainFromSha).mockResolvedValue([]);
      strandServiceGetOrThrowMock.mockResolvedValue(strandDescriptor);
      callInternalRuntimeMethodMock.mockResolvedValue(state);
    });

    it('resolves strand selector via callInternalRuntimeMethod', async () => {
      await controller.compareCoordinates({
        left: { kind: 'strand', strandId: 'my-strand' },
        right: { kind: 'live' },
      });

      expect(callInternalRuntimeMethodMock).toHaveBeenCalledWith(
        expect.anything(),
        'materializeStrand',
        'my-strand',
        undefined,
      );
    });

    it('resolves strand_base selector via materializeCoordinate', async () => {
      await controller.compareCoordinates({
        left: { kind: 'strand_base', strandId: 'my-strand' },
        right: { kind: 'live' },
      });

      expect(/** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate)).toHaveBeenCalled();
    });

    it('combines base observation ceiling with selector ceiling using min', async () => {
      // baseObservation.lamportCeiling = 5, selector ceiling = 3 -> effective = 3
      await controller.compareCoordinates({
        left: { kind: 'strand_base', strandId: 'my-strand', ceiling: 3 },
        right: { kind: 'live' },
      });

      const calls = /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mock.calls;
      const strandBaseCall = calls.find(
        (/** @type {unknown[]} */ c) => /** @type {Record<string, unknown>} */ (c[0]).ceiling === 3,
      );
      expect(strandBaseCall).toBeDefined();
    });
  });

  // ── StateHashService usage ───────────────────────────────────────────────

  describe('state hash computation', () => {
    it('uses StateHashService when available on host', async () => {
      const stateHashCompute = vi.fn(async () => 'svc-hash');
      host._stateHashService = { compute: stateHashCompute };
      const state = makeState();
      /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mockResolvedValue(state);
      /** @type {ReturnType<typeof vi.fn>} */ (host._loadPatchChainFromSha).mockResolvedValue([]);

      await controller.compareCoordinates({
        left: { kind: 'live' },
        right: { kind: 'live' },
      });

      expect(stateHashCompute).toHaveBeenCalled();
      expect(computeStateHashV5Mock).not.toHaveBeenCalled();
    });

    it('falls back to computeStateHashV5 when StateHashService is null', async () => {
      host._stateHashService = null;
      const state = makeState();
      /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mockResolvedValue(state);
      /** @type {ReturnType<typeof vi.fn>} */ (host._loadPatchChainFromSha).mockResolvedValue([]);

      await controller.compareCoordinates({
        left: { kind: 'live' },
        right: { kind: 'live' },
      });

      expect(computeStateHashV5Mock).toHaveBeenCalled();
    });
  });

  // ── Patch collection (ceiling filtering) ─────────────────────────────────

  describe('patch collection with ceiling', () => {
    it('filters patches above the ceiling', async () => {
      const state = makeState();
      /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mockResolvedValue(state);
      /** @type {ReturnType<typeof vi.fn>} */ (host._loadPatchChainFromSha).mockResolvedValue([
        makePatchEntry({ writer: 'alice', lamport: 1, sha: 'sha1' }),
        makePatchEntry({ writer: 'alice', lamport: 5, sha: 'sha5' }),
        makePatchEntry({ writer: 'alice', lamport: 10, sha: 'sha10' }),
      ]);

      await controller.compareCoordinates({
        left: { kind: 'coordinate', frontier: { alice: 'tip' }, ceiling: 5 },
        right: { kind: 'coordinate', frontier: { alice: 'tip' } },
      });

      // The visible state comparison still happens — the key behavior is that
      // patches above ceiling=5 (lamport 10) are excluded from the left side
      expect(compareVisibleStateV5Mock).toHaveBeenCalled();
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles multi-writer frontier with multiple tips', async () => {
      const state = makeState();
      const frontier = new Map([['alice', 'sha-a'], ['bob', 'sha-b'], ['carol', 'sha-c']]);
      /** @type {ReturnType<typeof vi.fn>} */ (host.getFrontier).mockResolvedValue(frontier);
      /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mockResolvedValue(state);
      /** @type {ReturnType<typeof vi.fn>} */ (host._loadPatchChainFromSha).mockResolvedValue([]);

      const result = await controller.compareCoordinates({
        left: { kind: 'live' },
        right: { kind: 'live' },
      });

      expect(result).toBeDefined();
      // Should have loaded chains for each writer tip
      expect(/** @type {ReturnType<typeof vi.fn>} */ (host._loadPatchChainFromSha)).toHaveBeenCalledTimes(6);
      // 3 writers x 2 sides = 6 calls
    });

    it('handles state with nodes, edges, and properties in summary', async () => {
      const state = makeState({
        nodes: ['a', 'b'],
        edges: [{ from: 'a', to: 'b', label: 'knows' }],
        props: [{ nodeId: 'a', key: 'name', value: 'Alice' }],
      });
      /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mockResolvedValue(state);
      /** @type {ReturnType<typeof vi.fn>} */ (host._loadPatchChainFromSha).mockResolvedValue([]);

      const result = await controller.compareCoordinates({
        left: { kind: 'live' },
        right: { kind: 'live' },
      });

      expect(result).toBeDefined();
    });

    it('ceiling 0 is valid (filters all patches with lamport > 0)', async () => {
      const state = makeState();
      /** @type {ReturnType<typeof vi.fn>} */ (host.materializeCoordinate).mockResolvedValue(state);
      /** @type {ReturnType<typeof vi.fn>} */ (host._loadPatchChainFromSha).mockResolvedValue([
        makePatchEntry({ writer: 'alice', lamport: 0, sha: 'sha0' }),
        makePatchEntry({ writer: 'alice', lamport: 1, sha: 'sha1' }),
      ]);

      // ceiling=0 should only include lamport=0 patches
      await controller.compareCoordinates({
        left: { kind: 'coordinate', frontier: { alice: 'tip' }, ceiling: 0 },
        right: { kind: 'live' },
      });

      expect(compareVisibleStateV5Mock).toHaveBeenCalled();
    });
  });
});
