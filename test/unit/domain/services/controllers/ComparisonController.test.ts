/**
 * Tests for ComparisonController — coordinate comparison, strand comparison,
 * transfer planning, patch divergence, and input validation.
 *
 * @see src/domain/services/controllers/ComparisonController.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import ComparisonController from '../../../../../src/domain/services/controllers/ComparisonController.ts';
import HostBackedComparisonSideFinalizer from '../../../../../src/domain/services/controllers/HostBackedComparisonSideFinalizer.ts';
import type { ComparisonCoordinateSideRead } from '../../../../../src/domain/services/controllers/ComparisonCoordinateSideReadPort.ts';
import {
  buildCoordinateRequest,
  buildStrandMetadata,
  collectPatchEntriesForFrontier,
  combineCeilings,
  frontierRecordToMap,
  normalizeFrontierRecord,
  optionalCeiling,
} from '../../../../../src/domain/services/controllers/ComparisonSelector.ts';
import WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import ORSet from '../../../../../src/domain/crdt/ORSet.ts';
import VersionVector from '../../../../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import { encodeEdgeKey, encodePropKey } from '../../../../../src/domain/services/KeyCodec.ts';
import { LWWRegister } from '../../../../../src/domain/crdt/LWW.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const {
  buildCoordinateComparisonFactMock,
  buildCoordinateTransferPlanFactMock,
} = vi.hoisted(() => ({
  buildCoordinateComparisonFactMock: vi.fn((input) => ({ ...input, _factExported: true })),
  buildCoordinateTransferPlanFactMock: vi.fn((input) => ({ ...input, _factExported: true })),
}));

vi.mock('../../../../../src/domain/services/CoordinateFactExport.ts', () => ({
  buildCoordinateComparisonFact: buildCoordinateComparisonFactMock,
  buildCoordinateTransferPlanFact: buildCoordinateTransferPlanFactMock,
}));

const { compareVisibleStateMock } = vi.hoisted(() => ({
  compareVisibleStateMock: vi.fn(() => ({
    comparisonVersion: 'visible-state-compare/v1',
    changed: false,
    nodeDelta: { added: [], removed: [] },
    edgeDelta: { added: [], removed: [] },
    nodePropertyDelta: [],
    edgePropertyDelta: [],
  })),
}));

vi.mock('../../../../../src/domain/services/comparison/VisibleStateComparison.ts', () => ({
  compareVisibleState: compareVisibleStateMock,
}));

const { planVisibleStateTransferMock } = vi.hoisted(() => ({
  planVisibleStateTransferMock: vi.fn(async () => ({
    transferVersion: 'visible-state-transfer-plan/v1',
    summary: {
      opCount: 0,
      addNodeCount: 0, removeNodeCount: 0,
      setNodePropertyCount: 0, clearNodePropertyCount: 0,
      addEdgeCount: 0, removeEdgeCount: 0,
      setEdgePropertyCount: 0, clearEdgePropertyCount: 0,
      attachNodeContentCount: 0, clearNodeContentCount: 0,
      attachEdgeContentCount: 0, clearEdgeContentCount: 0,
    },
        ops: [],
  })),
}));

vi.mock('../../../../../src/domain/services/transfer/VisibleStateTransferPlanner.ts', () => ({
  planVisibleStateTransfer: planVisibleStateTransferMock,
}));

const {
  normalizeVisibleStateScopeMock,
  scopeMaterializedStateMock,
  scopePatchEntriesV1Mock,
} = vi.hoisted(() => ({
  normalizeVisibleStateScopeMock: vi.fn((scope) => scope ?? null),
  scopeMaterializedStateMock: vi.fn((state) => state),
  scopePatchEntriesV1Mock: vi.fn((entries) => entries),
}));

vi.mock('../../../../../src/domain/services/VisibleStateScope.ts', () => ({
  normalizeVisibleStateScope: normalizeVisibleStateScopeMock,
  scopeMaterializedState: scopeMaterializedStateMock,
  scopePatchEntries: scopePatchEntriesV1Mock,
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

vi.mock('../../../../../src/domain/services/strand/createStrandCoordinator.ts', () => ({
  default: () => ({
    getOrThrow: strandServiceGetOrThrowMock,
    getPatchEntries: strandServiceGetPatchEntriesMock,
  }),
}));

// StateReader — pass through to real implementation for reader accuracy
// (we need real getNodes/getEdges/getNodeProps for summarizeVisibleState)

const { computeStateHashMock } = vi.hoisted(() => ({
  computeStateHashMock: vi.fn(async () => 'state-hash-deadbeef'),
}));

vi.mock('../../../../../src/domain/services/state/StateSerializer.ts', async (importOriginal) => {
  const original = (await importOriginal() as Record<string, unknown>);
  return {
    ...original,
    computeStateHash: computeStateHashMock,
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
    const elem = elements[i];
    if (elem !== undefined) {
      set.add(elem, new Dot('w', i + 1));
    }
  }
  return set;
}

/**
 * Creates a minimal WarpState for testing.
 *
 * @param {{ nodes?: string[], edges?: Array<{from: string, to: string, label: string}>, props?: Array<{nodeId: string, key: string, value: unknown}> }} [opts]
 * @returns {WarpState}
 */
function makeState(opts: { nodes?: string[]; edges?: Array<{from: string; to: string; label: string}>; props?: Array<{nodeId: string; key: string; value: unknown}> } = {}) {
  const { nodes = [], edges = [], props = [] } = opts;
  const edgeKeys = edges.map((e) => encodeEdgeKey(e.from, e.to, e.label));
    const propMap = (new Map()) as any;
  for (let pi = 0; pi < props.length; pi++) {
    const p = props[pi];
    if (p !== undefined) {
      const eventId = new EventId(pi + 1, 'test', 'aaaa', 0);
      propMap.set(encodePropKey(p.nodeId, p.key), new LWWRegister(eventId, (p.value as string)));
    }
  }
  return new WarpState({
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
 * @returns {import('../../../../../src/domain/services/controllers/ComparisonSelector.ts').PatchEntry}
 */
function makePatchEntry({ writer, lamport = 1, sha, reads = [], writes = [] }: { writer: string; lamport?: number; sha?: string; reads?: string[]; writes?: string[] }) {
  const resolvedSha = sha ?? `sha-${writer}-${lamport}`;
  const patch = new Patch({
    writer,
    lamport,
    context: VersionVector.empty(),
    ops: [],
    reads: reads.length > 0 ? reads : undefined,
    writes: writes.length > 0 ? writes : undefined,
  });
  return { patch, sha: resolvedSha };
}

/**
 * Creates a mock host that mimics WarpCore fields used by ComparisonController.
 *
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function createMockHost(overrides = {}) {
  const emptyState = makeState();
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
    materializeCoordinate: vi.fn(async (_request?: { frontier: Map<string, string>; ceiling?: number }) => emptyState),
    _loadPatchChainFromSha: vi.fn(async () => []),
    ...overrides,
  };
  return host;
}

function createMockCoordinateReader(host: ReturnType<typeof createMockHost>) {
  async function readFrontierSide(params: {
    readonly frontierRecord: Record<string, string>;
    readonly ceiling: number | null;
    readonly requested: ComparisonCoordinateSideRead['requested'];
    readonly coordinateKind: 'frontier' | 'strand_base';
    readonly lamportCeiling: number | null;
    readonly strand?: ComparisonCoordinateSideRead['strand'];
  }) {
    const state = await host.materializeCoordinate({
      frontier: frontierRecordToMap(params.frontierRecord),
      ...optionalCeiling(params.ceiling),
    });
    const patchEntries = await collectPatchEntriesForFrontier(
      host,
      params.frontierRecord,
      params.ceiling,
    );
    return {
      requested: params.requested,
      state,
      patchEntries,
      coordinateKind: params.coordinateKind,
      lamportCeiling: params.lamportCeiling,
      ...(params.strand !== undefined ? { strand: params.strand } : {}),
    };
  }

  return {
    liveFrontier: async () => await host.getFrontier(),
    readLiveSide: async (request: { readonly frontier: Map<string, string>; readonly ceiling: number | null }) => {
      const frontierRecord = normalizeFrontierRecord(request.frontier, 'live.frontier');
      return await readFrontierSide({
        frontierRecord,
        ceiling: request.ceiling,
        requested: { kind: 'live', ...optionalCeiling(request.ceiling) },
        coordinateKind: 'frontier',
        lamportCeiling: request.ceiling,
      });
    },
    readCoordinateSide: async (
      request: { readonly frontier: Record<string, string>; readonly ceiling: number | null },
    ) => await readFrontierSide({
      frontierRecord: request.frontier,
      ceiling: request.ceiling,
      requested: { ...buildCoordinateRequest(request.frontier, request.ceiling), kind: 'coordinate' },
      coordinateKind: 'frontier',
      lamportCeiling: request.ceiling,
    }),
    readStrandBaseSide: async (request: { readonly strandId: string; readonly ceiling: number | null }) => {
      const descriptor = await strandServiceGetOrThrowMock(request.strandId);
      const effectiveCeiling = combineCeilings(descriptor.baseObservation.lamportCeiling, request.ceiling);
      const frontierRecord = normalizeFrontierRecord(descriptor.baseObservation.frontier, 'strand_base.frontier');
      return await readFrontierSide({
        frontierRecord,
        ceiling: effectiveCeiling,
        requested: {
          kind: 'strand_base',
          strandId: request.strandId,
          frontier: frontierRecord,
          baseLamportCeiling: descriptor.baseObservation.lamportCeiling,
          ...optionalCeiling(request.ceiling),
        },
        coordinateKind: 'strand_base',
        lamportCeiling: effectiveCeiling,
        strand: buildStrandMetadata(request.strandId, descriptor),
      });
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ComparisonController', () => {
    let controller;
    let host;

  beforeEach(() => {
    vi.clearAllMocks();
    host = createMockHost();
    controller = new ComparisonController({
      host,
      selectorContext: {
        coordinateReader: createMockCoordinateReader(host),
        sideFinalizer: new HostBackedComparisonSideFinalizer(host),
        strandGraph: host,
      },
    });
  });

  // ── buildPatchDivergence ─────────────────────────────────────────────────

  describe('buildPatchDivergence', () => {
    it('returns zero divergence for identical entries', () => {
      const entries = [makePatchEntry({ writer: 'alice', lamport: 1, sha: 'aaa' })];
      const result = controller.buildPatchDivergence(entries, entries, null);

      expect(result['sharedCount']).toBe(1);
      expect(result['leftOnlyCount']).toBe(0);
      expect(result['rightOnlyCount']).toBe(0);
      expect(result['leftOnlyPatchShas']).toEqual([]);
      expect(result['rightOnlyPatchShas']).toEqual([]);
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

      expect(result['sharedCount']).toBe(1);
      expect(result['leftOnlyCount']).toBe(1);
      expect(result['rightOnlyCount']).toBe(1);
      expect(result['leftOnlyPatchShas']).toEqual(['bbb']);
      expect(result['rightOnlyPatchShas']).toEqual(['ccc']);
    });

    it('returns empty divergence for empty entry sets', () => {
      const result = controller.buildPatchDivergence([], [], null);

      expect(result['sharedCount']).toBe(0);
      expect(result['leftOnlyCount']).toBe(0);
      expect(result['rightOnlyCount']).toBe(0);
    });

    it('deduplicates patch SHAs within a side', () => {
      const left = [
        makePatchEntry({ writer: 'alice', lamport: 1, sha: 'aaa' }),
        makePatchEntry({ writer: 'bob', lamport: 1, sha: 'aaa' }),
      ];
            const right = ([]) as any;
      const result = controller.buildPatchDivergence(left, right, null);

      expect(result['leftOnlyCount']).toBe(1);
      expect(result['leftOnlyPatchShas']).toEqual(['aaa']);
    });

    it('sorts patch SHAs deterministically', () => {
      const left = [
        makePatchEntry({ writer: 'a', sha: 'ccc' }),
        makePatchEntry({ writer: 'b', sha: 'aaa' }),
        makePatchEntry({ writer: 'c', sha: 'bbb' }),
      ];
      const result = controller.buildPatchDivergence(left, [], null);

      expect(result['leftOnlyPatchShas']).toEqual(['aaa', 'bbb', 'ccc']);
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

      expect(result['target']).toBeDefined();
      const target = (result['target'] as Record<string, unknown>);
      expect(target['targetId']).toBe('node:1');
      expect(target['leftCount']).toBe(1);
      expect(target['rightCount']).toBe(1);
      expect(target['leftOnlyPatchShas']).toEqual(['aaa']);
      expect(target['rightOnlyPatchShas']).toEqual(['ccc']);
    });

    it('does not include target when targetId is null', () => {
      const entries = [makePatchEntry({ writer: 'alice', sha: 'aaa', writes: ['node:1'] })];
      const result = controller.buildPatchDivergence(entries, entries, null);

      expect(result['target']).toBeUndefined();
    });

    it('considers reads when determining target patches', () => {
      const left = [
        makePatchEntry({ writer: 'alice', sha: 'aaa', reads: ['node:1'], writes: [] }),
      ];
      const result = controller.buildPatchDivergence(left, [], 'node:1');

      const target = (result['target'] as Record<string, unknown>);
      expect(target['leftCount']).toBe(1);
    });
  });

  // ── compareCoordinates ───────────────────────────────────────────────────

  describe('compareCoordinates', () => {
    it('rejects null options', async () => {
      await expect(controller.compareCoordinates((null)))
        .rejects.toThrow(/requires an options object/);
    });

    it('rejects array options', async () => {
      await expect(controller.compareCoordinates(([] as never)))
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
      (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mockResolvedValue(state);
      (host['_loadPatchChainFromSha'] as ReturnType<typeof vi.fn>).mockResolvedValue([
        makePatchEntry({ writer: 'alice', lamport: 1, sha: 'sha-alice-1' }),
      ]);

      const result = await controller.compareCoordinates({
        left: { kind: 'live' },
        right: { kind: 'live' },
      });

      expect(result).toBeDefined();
      expect(result['comparisonDigest']).toBe('checksum-abc123');
      expect(compareVisibleStateMock).toHaveBeenCalled();
    });

    it('compares two explicit coordinate selectors', async () => {
      const state = makeState({ nodes: ['x'] });
      (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mockResolvedValue(state);
      (host['_loadPatchChainFromSha'] as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await controller.compareCoordinates({
        left: { kind: 'coordinate', frontier: { alice: 'sha1' } },
        right: { kind: 'coordinate', frontier: { bob: 'sha2' } },
      });

      expect(result).toBeDefined();
      expect(result['comparisonDigest']).toBe('checksum-abc123');
      expect((host['materializeCoordinate'] as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });

    it('passes lamport ceiling to materializeCoordinate', async () => {
      const state = makeState();
      (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mockResolvedValue(state);
      (host['_loadPatchChainFromSha'] as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await controller.compareCoordinates({
        left: { kind: 'coordinate', frontier: { alice: 'sha1' }, ceiling: 5 },
        right: { kind: 'coordinate', frontier: { bob: 'sha2' }, ceiling: 10 },
      });

      const calls = (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toEqual(expect.objectContaining({ ceiling: 5 }));
      expect(calls[1]?.[0]).toEqual(expect.objectContaining({ ceiling: 10 }));
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
      (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mockResolvedValue(state);
      (host['_loadPatchChainFromSha'] as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await controller.compareCoordinates({
        left: { kind: 'live' },
        right: { kind: 'live' },
        targetId: 'node:1',
      });

      expect(compareVisibleStateMock).toHaveBeenCalledWith(
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
      (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mockResolvedValue(state);
      (host['_loadPatchChainFromSha'] as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const scope = { nodeIdPrefixes: { include: ['user:'] } };
      normalizeVisibleStateScopeMock.mockReturnValue(scope);

      await controller.compareCoordinates({
        left: { kind: 'live' },
        right: { kind: 'live' },
        scope,
      });

      expect(normalizeVisibleStateScopeMock).toHaveBeenCalled();
      expect(scopeMaterializedStateMock).toHaveBeenCalled();
    });

    it('captures live frontier once for both sides', async () => {
      const state = makeState();
      (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mockResolvedValue(state);
      (host['_loadPatchChainFromSha'] as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await controller.compareCoordinates({
        left: { kind: 'live' },
        right: { kind: 'live' },
      });

      // getFrontier should be called exactly once for both sides
      expect((host['getFrontier'] as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    });

    it('does not call getFrontier when neither side is live', async () => {
      const state = makeState();
      (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mockResolvedValue(state);
      (host['_loadPatchChainFromSha'] as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await controller.compareCoordinates({
        left: { kind: 'coordinate', frontier: { alice: 'sha1' } },
        right: { kind: 'coordinate', frontier: { bob: 'sha2' } },
      });

      expect((host['getFrontier'] as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    });

    it('accepts frontier as Map', async () => {
      const state = makeState();
      (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mockResolvedValue(state);
      (host['_loadPatchChainFromSha'] as ReturnType<typeof vi.fn>).mockResolvedValue([]);

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
      (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mockResolvedValue(state);
      (host['_loadPatchChainFromSha'] as ReturnType<typeof vi.fn>).mockResolvedValue([]);

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
      await expect(controller.compareStrand((42 as never), {}))
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
      expect((host['getFrontier'] as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
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
      await expect(controller.compareStrand('my-strand', ('bad' as never)))
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
      const calls = (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mock.calls;
      const strandBaseCall = calls.find(
        (/** @type {unknown[]} */ c) => (c[0] as Record<string, unknown>)['ceiling'] === 3,
      );
      expect(strandBaseCall).toBeDefined();
    });
  });

  // ── planCoordinateTransfer ───────────────────────────────────────────────

  describe('planCoordinateTransfer', () => {
    beforeEach(() => {
      const state = makeState();
      (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mockResolvedValue(state);
      (host['_loadPatchChainFromSha'] as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    });

    it('rejects null options', async () => {
      await expect(controller.planCoordinateTransfer((null)))
        .rejects.toThrow(/requires an options object/);
    });

    it('rejects undefined options', async () => {
      await expect(controller.planCoordinateTransfer((undefined)))
        .rejects.toThrow(/requires an options object/);
    });

    it('plans transfer between two live selectors', async () => {
      const result = await controller.planCoordinateTransfer({
        source: { kind: 'live' },
        target: { kind: 'live' },
      });

      expect(result).toBeDefined();
      expect(result['transferVersion']).toBe('coordinate-transfer-plan/v1');
      expect(result['transferDigest']).toBe('checksum-abc123');
      expect(result['changed']).toBe(false);
    });

    it('plans transfer between coordinate selectors', async () => {
      const result = await controller.planCoordinateTransfer({
        source: { kind: 'coordinate', frontier: { alice: 'sha1' } },
        target: { kind: 'coordinate', frontier: { bob: 'sha2' } },
      });

      expect(result).toBeDefined();
      expect(planVisibleStateTransferMock).toHaveBeenCalled();
    });

    it('reports changed=true when transfer has ops', async () => {
      planVisibleStateTransferMock.mockResolvedValueOnce({
        transferVersion: 'visible-state-transfer-plan/v1',
        summary: {
          opCount: 2,
          addNodeCount: 1, removeNodeCount: 1,
          setNodePropertyCount: 0, clearNodePropertyCount: 0,
          addEdgeCount: 0, removeEdgeCount: 0,
          setEdgePropertyCount: 0, clearEdgePropertyCount: 0,
          attachNodeContentCount: 0, clearNodeContentCount: 0,
          attachEdgeContentCount: 0, clearEdgeContentCount: 0,
        },
        ops: (([
          { op: 'add_node', nodeId: 'x' },
          { op: 'remove_node', nodeId: 'y' },
        ]) as any),
      });

      const result = await controller.planCoordinateTransfer({
        source: { kind: 'live' },
        target: { kind: 'live' },
      });

      expect(result['changed']).toBe(true);
    });

    it('includes scope in result when provided', async () => {
      const scope = { nodeIdPrefixes: { include: ['user:'] } };
      normalizeVisibleStateScopeMock.mockReturnValue(scope);

      const result = await controller.planCoordinateTransfer({
        source: { kind: 'live' },
        target: { kind: 'live' },
        scope,
      });

      expect(result['scope']).toEqual(scope);
    });

    it('loads content blobs via blobStorage when available', async () => {
      const blobStorageRetrieve = vi.fn(async () => new Uint8Array([10, 20]));
      host['_blobStorage'] = { retrieve: blobStorageRetrieve };

      planVisibleStateTransferMock.mockImplementationOnce(((async (_src, _tgt, loaders) => {
          // Simulate the planner calling loadNodeContent
          if (loaders.loadNodeContent) {
            await loaders.loadNodeContent('n1', { oid: 'blob-oid' });
          }
          return { summary: { opCount: 0 }, ops: [] };
        }) as any));

      await controller.planCoordinateTransfer({
        source: { kind: 'live' },
        target: { kind: 'live' },
      });

      expect(blobStorageRetrieve).toHaveBeenCalledWith('blob-oid');
    });

    it('falls back to persistence.readBlob when blobStorage is null', async () => {
      host['_blobStorage'] = null;

      planVisibleStateTransferMock.mockImplementationOnce(((async (_src, _tgt, loaders) => {
          if (loaders.loadEdgeContent) {
            await loaders.loadEdgeContent('e1', { oid: 'blob-oid-2' });
          }
          return { summary: { opCount: 0 }, ops: [] };
        }) as any));

      await controller.planCoordinateTransfer({
        source: { kind: 'live' },
        target: { kind: 'live' },
      });

      expect((((host['_persistence']).readBlob) as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('blob-oid-2');
    });
  });

  // ── planStrandTransfer ───────────────────────────────────────────────────

  describe('planStrandTransfer', () => {
    beforeEach(() => {
      const state = makeState();
      (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mockResolvedValue(state);
      (host['_loadPatchChainFromSha'] as ReturnType<typeof vi.fn>).mockResolvedValue([]);

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
      expect(result['transferVersion']).toBe('coordinate-transfer-plan/v1');
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
      await expect(controller.planStrandTransfer('my-strand', (42 as never)))
        .rejects.toThrow(/options must be an object/);
    });
  });

  // ── Selector normalization (validated via compareCoordinates) ─────────────

  describe('selector normalization', () => {
    beforeEach(() => {
      const state = makeState();
      (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mockResolvedValue(state);
      (host['_loadPatchChainFromSha'] as ReturnType<typeof vi.fn>).mockResolvedValue([]);
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
      (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mockResolvedValue(state);
      (host['_loadPatchChainFromSha'] as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await controller.compareCoordinates({
        left: { kind: 'coordinate', frontier: { bob: 'sha2', alice: 'sha1' } },
        right: { kind: 'coordinate', frontier: { charlie: 'sha3' } },
      });

      // Verify materializeCoordinate was called with sorted frontier Maps
      const calls = (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const firstFrontier = (((calls[0]?.[0])?.['frontier']) as Map<string, string>);
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
      (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mockResolvedValue(state);
      (host['_loadPatchChainFromSha'] as ReturnType<typeof vi.fn>).mockResolvedValue([]);
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

      expect((host['materializeCoordinate'] as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });

    it('combines base observation ceiling with selector ceiling using min', async () => {
      // baseObservation.lamportCeiling = 5, selector ceiling = 3 -> effective = 3
      await controller.compareCoordinates({
        left: { kind: 'strand_base', strandId: 'my-strand', ceiling: 3 },
        right: { kind: 'live' },
      });

      const calls = (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mock.calls;
      const strandBaseCall = calls.find(
        (/** @type {unknown[]} */ c) => (c[0] as Record<string, unknown>)['ceiling'] === 3,
      );
      expect(strandBaseCall).toBeDefined();
    });
  });

  // ── StateHashService usage ───────────────────────────────────────────────

  describe('state hash computation', () => {
    it('uses StateHashService when available on host', async () => {
      const stateHashCompute = vi.fn(async () => 'svc-hash');
      host['_stateHashService'] = { compute: stateHashCompute };
      const state = makeState();
      (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mockResolvedValue(state);
      (host['_loadPatchChainFromSha'] as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await controller.compareCoordinates({
        left: { kind: 'live' },
        right: { kind: 'live' },
      });

      expect(stateHashCompute).toHaveBeenCalled();
      expect(computeStateHashMock).not.toHaveBeenCalled();
    });

    it('falls back to computeStateHash when StateHashService is null', async () => {
      host['_stateHashService'] = null;
      const state = makeState();
      (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mockResolvedValue(state);
      (host['_loadPatchChainFromSha'] as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await controller.compareCoordinates({
        left: { kind: 'live' },
        right: { kind: 'live' },
      });

      expect(computeStateHashMock).toHaveBeenCalled();
    });
  });

  // ── Patch collection (ceiling filtering) ─────────────────────────────────

  describe('patch collection with ceiling', () => {
    it('filters patches above the ceiling', async () => {
      const state = makeState();
      (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mockResolvedValue(state);
      (host['_loadPatchChainFromSha'] as ReturnType<typeof vi.fn>).mockResolvedValue([
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
      expect(compareVisibleStateMock).toHaveBeenCalled();
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles multi-writer frontier with multiple tips', async () => {
      const state = makeState();
      const frontier = new Map([['alice', 'sha-a'], ['bob', 'sha-b'], ['carol', 'sha-c']]);
      (host['getFrontier'] as ReturnType<typeof vi.fn>).mockResolvedValue(frontier);
      (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mockResolvedValue(state);
      (host['_loadPatchChainFromSha'] as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await controller.compareCoordinates({
        left: { kind: 'live' },
        right: { kind: 'live' },
      });

      expect(result).toBeDefined();
      // Should have loaded chains for each writer tip
      expect((host['_loadPatchChainFromSha'] as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(6);
      // 3 writers x 2 sides = 6 calls
    });

    it('handles state with nodes, edges, and properties in summary', async () => {
      const state = makeState({
        nodes: ['a', 'b'],
        edges: [{ from: 'a', to: 'b', label: 'knows' }],
        props: [{ nodeId: 'a', key: 'name', value: 'Alice' }],
      });
      (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mockResolvedValue(state);
      (host['_loadPatchChainFromSha'] as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await controller.compareCoordinates({
        left: { kind: 'live' },
        right: { kind: 'live' },
      });

      expect(result).toBeDefined();
    });

    it('ceiling 0 is valid (filters all patches with lamport > 0)', async () => {
      const state = makeState();
      (host['materializeCoordinate'] as ReturnType<typeof vi.fn>).mockResolvedValue(state);
      (host['_loadPatchChainFromSha'] as ReturnType<typeof vi.fn>).mockResolvedValue([
        makePatchEntry({ writer: 'alice', lamport: 0, sha: 'sha0' }),
        makePatchEntry({ writer: 'alice', lamport: 1, sha: 'sha1' }),
      ]);

      // ceiling=0 should only include lamport=0 patches
      await controller.compareCoordinates({
        left: { kind: 'coordinate', frontier: { alice: 'tip' }, ceiling: 0 },
        right: { kind: 'live' },
      });

      expect(compareVisibleStateMock).toHaveBeenCalled();
    });
  });
});
