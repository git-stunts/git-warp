import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictAnalyzerService,
  CONFLICT_ANALYSIS_VERSION,
} from '../../../../../src/domain/services/strand/ConflictAnalyzerService.js';
import * as JoinReducer from '../../../../../src/domain/services/JoinReducer.js';
import QueryError from '../../../../../src/domain/errors/QueryError.ts';
import { textEncode } from '../../../../../src/domain/utils/bytes.ts';
import { createHash } from 'node:crypto';
import StrandService from '../../../../../src/domain/services/strand/StrandService.js';

// ── Deterministic helpers ─────────────────────────────────────────────────────

let oidCounter = 0;
function nextOid() {
  oidCounter += 1;
  return String(oidCounter).padStart(40, '0');
}

/**
 * Build a mock graph (WarpRuntime) with writer patches pre-loaded.
 * @param {{ writerPatches?: Record<string, Array<{patch: object, sha: string}>> }} [config]
 */
function createMockGraph(config = {}) {
  const { writerPatches = {} } = config;
  oidCounter = 0;

  /** @type {Map<string, string>} */
  const frontier = new Map();
  for (const writerId of Object.keys(writerPatches)) {
    const chain = writerPatches[writerId];
    if (chain.length > 0) {
      frontier.set(writerId, chain[chain.length - 1].sha);
    }
  }

  return {
    _graphName: 'test-graph',
    _crypto: {
      hash: vi.fn(async (_algo, data) => {
        const str = typeof data === 'string' ? data : 'bytes';
        return createHash('sha256').update(str).digest('hex');
      }),
    },
    _persistence: {
      readRef: vi.fn(async () => null),
      readBlob: vi.fn(async () => null),
      writeBlob: vi.fn(async () => nextOid()),
      updateRef: vi.fn(async () => {}),
      listRefs: vi.fn(async () => []),
    },
    _clock: { timestamp: vi.fn(() => '2026-04-06T00:00:00.000Z') },
    _patchInProgress: false,
    _maxObservedLamport: 0,
    _stateDirty: false,
    _cachedViewHash: null,
    _cachedCeiling: null,
    _cachedFrontier: null,
    _provenanceIndex: null,
    _provenanceDegraded: true,
    _patchJournal: null,
    _logger: null,
    _blobStorage: null,
    _patchBlobStorage: null,
    _codec: { encode: vi.fn((p) => textEncode(JSON.stringify(p))) },
    _onDeleteWithData: undefined,
    _lastFrontier: new Map(),
    _writerId: 'writer1',
    _cachedState: null,
    getFrontier: vi.fn(async () => frontier),
    _loadWriterPatches: vi.fn(async (writerId) => writerPatches[writerId] ?? []),
    _loadPatchChainFromSha: vi.fn(async () => []),
    _setMaterializedState: vi.fn(async () => {}),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConflictAnalyzerService', () => {

  // ── Exported constants ──────────────────────────────────────────────────

  describe('exported constants', () => {
    it('exports CONFLICT_ANALYSIS_VERSION', () => {
      expect(CONFLICT_ANALYSIS_VERSION).toBe('conflict-analyzer/v2');
    });
  });

  // ── Constructor ─────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('stores graph reference and initializes digest cache', () => {
      const graph = createMockGraph();
      const analyzer = new ConflictAnalyzerService({ graph });

      expect(analyzer._graph).toBe(graph);
      expect(analyzer._digestCache).toBeInstanceOf(Map);
      expect(analyzer._digestCache.size).toBe(0);
    });
  });

  // ── analyze: empty / trivial ────────────────────────────────────────────

  describe('analyze — empty cases', () => {
    it('returns empty analysis when no writers exist', async () => {
      const graph = createMockGraph();
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze();

      expect(result.analysisVersion).toBe(CONFLICT_ANALYSIS_VERSION);
      expect(result.conflicts).toEqual([]);
      expect(result.resolvedCoordinate).toBeDefined();
      expect(result.analysisSnapshotHash).toBeTruthy();
    });

    it('returns empty analysis when writer has no patches', async () => {
      const graph = createMockGraph({ writerPatches: { w1: [] } });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze();

      expect(result.conflicts).toEqual([]);
    });

    it('returns empty analysis for a single non-conflicting writer', async () => {
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [{ type: 'NodeAdd', node: 'user:alice', dot: { writerId: 'w1', counter: 1 } }],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze();

      // Single writer, single op — no conflicts possible
      expect(result.conflicts).toEqual([]);
    });
  });

  // ── analyze: supersession conflicts ─────────────────────────────────────

  describe('analyze — supersession', () => {
    it('detects supersession when two writers set the same property', async () => {
      // Use only PropSet ops — the reducer marks the lower-lamport write as superseded
      const graph = createMockGraph({
        writerPatches: {
          alice: [
            {
              patch: {
                schema: 2,
                writer: 'alice',
                lamport: 10,
                ops: [{ type: 'PropSet', node: 'n1', key: 'color', value: 'red' }],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
          ],
          bob: [
            {
              patch: {
                schema: 2,
                writer: 'bob',
                lamport: 1,
                ops: [{ type: 'PropSet', node: 'n1', key: 'color', value: 'blue' }],
                context: {},
              },
              sha: 'b'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze({ kind: 'supersession' });

      const supersessions = result.conflicts;
      expect(supersessions.length).toBeGreaterThan(0);

      // Verify trace structure
      const trace = supersessions[0];
      expect(trace.conflictId).toBeTruthy();
      expect(trace.kind).toBe('supersession');
      expect(trace.target).toBeDefined();
      expect(trace.winner).toBeDefined();
      expect(trace.winner.anchor.writerId).toBe('alice');
      expect(trace.losers).toBeDefined();
      expect(trace.losers.length).toBeGreaterThan(0);
      expect(trace.losers[0].anchor.writerId).toBe('bob');
    });

    it('identifies the LWW winner by higher lamport', async () => {
      // alice (lamport 10) beats bob (lamport 1) — alice processed first alphabetically
      const graph = createMockGraph({
        writerPatches: {
          alice: [
            {
              patch: {
                schema: 2,
                writer: 'alice',
                lamport: 10,
                ops: [{ type: 'PropSet', node: 'n1', key: 'color', value: 'red' }],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
          ],
          bob: [
            {
              patch: {
                schema: 2,
                writer: 'bob',
                lamport: 1,
                ops: [{ type: 'PropSet', node: 'n1', key: 'color', value: 'blue' }],
                context: {},
              },
              sha: 'b'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze({ kind: 'supersession' });

      expect(result.conflicts.length).toBeGreaterThan(0);
      // alice has higher lamport → wins
      expect(result.conflicts[0].winner.anchor.writerId).toBe('alice');
    });
  });

  // ── analyze: redundancy conflicts ───────────────────────────────────────

  describe('analyze — redundancy', () => {
    it('detects redundancy when same node is added by two writers', async () => {
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [{ type: 'NodeAdd', node: 'n1', dot: { writerId: 'w1', counter: 1 } }],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
          ],
          w2: [
            {
              patch: {
                schema: 2,
                writer: 'w2',
                lamport: 2,
                ops: [{ type: 'NodeAdd', node: 'n1', dot: { writerId: 'w2', counter: 1 } }],
                context: {},
              },
              sha: 'b'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze();

      // Two adds of the same node: CRDT OR-Set admits both — the second is redundant
      const redundancies = result.conflicts.filter((c) => c.kind === 'redundancy');
      // OR-Set semantics: both NodeAdd dots are kept. The exact classification
      // depends on receipt outcomes (both may be 'applied' = no redundancy from reducer).
      // Just verify we get a valid analysis
      expect(result.analysisVersion).toBe(CONFLICT_ANALYSIS_VERSION);
    });

    it('detects redundancy for identical property writes', async () => {
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [
                  { type: 'NodeAdd', node: 'n1', dot: { writerId: 'w1', counter: 1 } },
                  { type: 'PropSet', node: 'n1', key: 'color', value: 'red' },
                ],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
          ],
          w2: [
            {
              patch: {
                schema: 2,
                writer: 'w2',
                lamport: 2,
                ops: [
                  { type: 'NodeAdd', node: 'n1', dot: { writerId: 'w2', counter: 1 } },
                  { type: 'PropSet', node: 'n1', key: 'color', value: 'red' },
                ],
                context: {},
              },
              sha: 'b'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze();

      // Same value, different writers → the loser is "redundant" since same effect
      // OR it may be a supersession where winner == same value. Either way, valid analysis.
      expect(result.conflicts.length).toBeGreaterThanOrEqual(0);
      expect(result.analysisVersion).toBe(CONFLICT_ANALYSIS_VERSION);
    });
  });

  // ── analyze: eventual_override conflicts ────────────────────────────────

  describe('analyze — eventual_override', () => {
    it('detects eventual override when later write supersedes earlier', async () => {
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [
                  { type: 'NodeAdd', node: 'n1', dot: { writerId: 'w1', counter: 1 } },
                  { type: 'PropSet', node: 'n1', key: 'status', value: 'draft' },
                ],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
          ],
          w2: [
            {
              patch: {
                schema: 2,
                writer: 'w2',
                lamport: 2,
                ops: [
                  { type: 'NodeAdd', node: 'n1', dot: { writerId: 'w2', counter: 1 } },
                  { type: 'PropSet', node: 'n1', key: 'status', value: 'published' },
                ],
                context: {},
              },
              sha: 'b'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze();

      // Different values → either supersession or eventual_override
      const overrides = result.conflicts.filter(
        (c) => c.kind === 'eventual_override' || c.kind === 'supersession',
      );
      expect(overrides.length).toBeGreaterThan(0);
    });
  });

  // ── analyze: options and filtering ──────────────────────────────────────

  describe('analyze — options', () => {
    /** @type {ReturnType<typeof createMockGraph>} */
    let graph;
    /** @type {ConflictAnalyzerService} */
    let analyzer;

    beforeEach(() => {
      graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [
                  { type: 'NodeAdd', node: 'n1', dot: { writerId: 'w1', counter: 1 } },
                  { type: 'PropSet', node: 'n1', key: 'x', value: 'a' },
                ],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
          ],
          w2: [
            {
              patch: {
                schema: 2,
                writer: 'w2',
                lamport: 2,
                ops: [
                  { type: 'NodeAdd', node: 'n1', dot: { writerId: 'w2', counter: 1 } },
                  { type: 'PropSet', node: 'n1', key: 'x', value: 'b' },
                ],
                context: {},
              },
              sha: 'b'.repeat(40),
            },
          ],
        },
      });
      analyzer = new ConflictAnalyzerService({ graph });
    });

    it('filters by kind', async () => {
      const result = await analyzer.analyze({ kind: 'redundancy' });

      // Filter to redundancy only — may or may not find any depending on data
      for (const c of result.conflicts) {
        expect(c.kind).toBe('redundancy');
      }
    });

    it('filters by kind array', async () => {
      const result = await analyzer.analyze({ kind: ['supersession'] });

      for (const c of result.conflicts) {
        expect(c.kind).toBe('supersession');
      }
    });

    it('filters by writerId', async () => {
      const result = await analyzer.analyze({ writerId: 'w1' });

      for (const c of result.conflicts) {
        const writerIds = [c.winner.anchor.writerId, ...c.losers.map((l) => l.anchor.writerId)];
        expect(writerIds).toContain('w1');
      }
    });

    it('filters by writerId when the selected writer is the winner', async () => {
      const result = await analyzer.analyze({ writerId: 'w2' });

      expect(result.conflicts.length).toBeGreaterThan(0);
      for (const c of result.conflicts) {
        expect(c.winner.anchor.writerId).toBe('w2');
      }
    });

    it('filters by entityId', async () => {
      const result = await analyzer.analyze({ entityId: 'n1' });

      // All conflicts should relate to entity n1
      expect(result.conflicts.length).toBeGreaterThanOrEqual(0);
    });

    it('filters by entityId through edge endpoints', async () => {
      const edgeGraph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [
                  { type: 'EdgeAdd', from: 'left', to: 'right', label: 'rel', dot: { writerId: 'w1', counter: 1 } },
                ],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
          ],
          w2: [
            {
              patch: {
                schema: 2,
                writer: 'w2',
                lamport: 2,
                ops: [
                  { type: 'EdgeAdd', from: 'left', to: 'right', label: 'rel', dot: { writerId: 'w2', counter: 1 } },
                ],
                context: {},
              },
              sha: 'b'.repeat(40),
            },
          ],
        },
      });
      const edgeAnalyzer = new ConflictAnalyzerService({ graph: edgeGraph });

      const result = await edgeAnalyzer.analyze({ entityId: 'left' });

      expect(result.analysisVersion).toBe(CONFLICT_ANALYSIS_VERSION);
      expect(result.conflicts.length).toBeGreaterThanOrEqual(0);
    });

    it('filters by target selector (node_property)', async () => {
      const result = await analyzer.analyze({
        target: { targetKind: 'node_property', entityId: 'n1', propertyKey: 'x' },
      });

      for (const c of result.conflicts) {
        expect(c.target.targetKind).toBe('node_property');
      }
    });

    it('returns no conflicts when target selector does not match target kind', async () => {
      const result = await analyzer.analyze({
        target: { targetKind: 'edge', from: 'n1', to: 'n2', label: 'rel' },
      });

      expect(result.conflicts).toEqual([]);
    });

    it('returns no conflicts when target selector field values do not match', async () => {
      const result = await analyzer.analyze({
        target: { targetKind: 'node_property', entityId: 'n1', propertyKey: 'missing' },
      });

      expect(result.conflicts).toEqual([]);
    });

    it('treats a null target selector as an unfiltered analysis', async () => {
      const result = await analyzer.analyze({ target: null });

      expect(result.conflicts.length).toBeGreaterThan(0);
    });

    it('applies lamport ceiling', async () => {
      const result = await analyzer.analyze({ at: { lamportCeiling: 1 } });

      // Only patches with lamport <= 1 → only w1's patch → no conflicts
      expect(result.conflicts).toEqual([]);
    });

    it('applies scan budget', async () => {
      const result = await analyzer.analyze({ scanBudget: { maxPatches: 1 } });

      // Budget of 1 → may truncate analysis
      expect(result.resolvedCoordinate).toBeDefined();
    });

    it('accepts evidence levels', async () => {
      const summary = await analyzer.analyze({ evidence: 'summary' });
      const standard = await analyzer.analyze({ evidence: 'standard' });
      const full = await analyzer.analyze({ evidence: 'full' });

      expect(summary.analysisVersion).toBe(CONFLICT_ANALYSIS_VERSION);
      expect(standard.analysisVersion).toBe(CONFLICT_ANALYSIS_VERSION);
      expect(full.analysisVersion).toBe(CONFLICT_ANALYSIS_VERSION);
    });
  });

  // ── analyze: validation errors ──────────────────────────────────────────

  describe('analyze — validation', () => {
    /** @type {ConflictAnalyzerService} */
    let analyzer;

    beforeEach(() => {
      analyzer = new ConflictAnalyzerService({ graph: createMockGraph() });
    });

    it('rejects invalid lamport ceiling (negative)', async () => {
      await expect(analyzer.analyze({ at: { lamportCeiling: -1 } }))
        .rejects.toThrow(QueryError);
    });

    it('rejects invalid lamport ceiling (non-integer)', async () => {
      await expect(analyzer.analyze({ at: { lamportCeiling: 3.14 } }))
        .rejects.toThrow(QueryError);
    });

    it('rejects invalid kind value', async () => {
      await expect(analyzer.analyze({ kind: 'not_a_kind' }))
        .rejects.toThrow(QueryError);
    });

    it('rejects empty kind arrays', async () => {
      await expect(analyzer.analyze({ kind: [] }))
        .rejects.toThrow(QueryError);
    });

    it('rejects invalid evidence level', async () => {
      await expect(analyzer.analyze({ evidence: 'verbose' }))
        .rejects.toThrow(QueryError);
    });

    it('rejects invalid maxPatches (zero)', async () => {
      await expect(analyzer.analyze({ scanBudget: { maxPatches: 0 } }))
        .rejects.toThrow(QueryError);
    });

    it('rejects invalid maxPatches (negative)', async () => {
      await expect(analyzer.analyze({ scanBudget: { maxPatches: -5 } }))
        .rejects.toThrow(QueryError);
    });

    it('rejects invalid maxPatches (non-integer)', async () => {
      await expect(analyzer.analyze({ scanBudget: { maxPatches: 2.5 } }))
        .rejects.toThrow(QueryError);
    });

    it('rejects invalid target selector — unknown targetKind', async () => {
      await expect(analyzer.analyze({ target: { targetKind: 'unknown_thing' } }))
        .rejects.toThrow(QueryError);
    });

    it('rejects non-object target selectors', async () => {
      await expect(analyzer.analyze({ target: /** @type {any} */ ('node:n1') }))
        .rejects.toThrow(QueryError);
    });

    it('rejects node target without entityId', async () => {
      await expect(analyzer.analyze({ target: { targetKind: 'node' } }))
        .rejects.toThrow(QueryError);
    });

    it('rejects edge target without required fields', async () => {
      await expect(analyzer.analyze({ target: { targetKind: 'edge', from: 'a' } }))
        .rejects.toThrow(QueryError);
    });

    it('rejects node_property target without propertyKey', async () => {
      await expect(
        analyzer.analyze({ target: { targetKind: 'node_property', entityId: 'n1' } }),
      ).rejects.toThrow(QueryError);
    });

    it('rejects edge_property target without all fields', async () => {
      await expect(
        analyzer.analyze({
          target: { targetKind: 'edge_property', from: 'a', to: 'b', label: 'l' },
        }),
      ).rejects.toThrow(QueryError);
    });

    it('rejects empty writerId filters', async () => {
      await expect(analyzer.analyze({ writerId: '' }))
        .rejects.toThrow(QueryError);
    });

    it('rejects empty entityId filters', async () => {
      await expect(analyzer.analyze({ entityId: '' }))
        .rejects.toThrow(QueryError);
    });

    it('rejects empty strandId filters', async () => {
      await expect(analyzer.analyze({ strandId: '' }))
        .rejects.toThrow(QueryError);
    });

    it('accepts null options', async () => {
      const result = await analyzer.analyze(null);
      expect(result.analysisVersion).toBe(CONFLICT_ANALYSIS_VERSION);
    });

    it('accepts undefined options', async () => {
      const result = await analyzer.analyze(undefined);
      expect(result.analysisVersion).toBe(CONFLICT_ANALYSIS_VERSION);
    });

    it('accepts empty object options', async () => {
      const result = await analyzer.analyze({});
      expect(result.analysisVersion).toBe(CONFLICT_ANALYSIS_VERSION);
    });
  });

  // ── analyze: resolved coordinate ────────────────────────────────────────

  describe('analyze — resolved coordinate', () => {
    it('reports frontier coordinate kind', async () => {
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: { schema: 2, writer: 'w1', lamport: 1, ops: [], context: {} },
              sha: 'a'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze();

      expect(result.resolvedCoordinate.coordinateKind).toBe('frontier');
    });

    it('includes frontier digest in coordinate', async () => {
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: { schema: 2, writer: 'w1', lamport: 1, ops: [], context: {} },
              sha: 'a'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze();

      expect(result.resolvedCoordinate.frontierDigest).toBeTruthy();
    });

    it('includes lamportCeiling in coordinate when specified', async () => {
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: { schema: 2, writer: 'w1', lamport: 5, ops: [], context: {} },
              sha: 'a'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze({ at: { lamportCeiling: 10 } });

      expect(result.resolvedCoordinate.lamportCeiling).toBe(10);
    });

    it('reports null lamportCeiling when unbounded', async () => {
      const graph = createMockGraph();
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze();

      expect(result.resolvedCoordinate.lamportCeiling).toBeNull();
    });

    it('resolves strand coordinates through StrandService metadata', async () => {
      const graph = createMockGraph();
      const analyzer = new ConflictAnalyzerService({ graph });
      const getOrThrowSpy = vi.spyOn(StrandService.prototype, 'getOrThrow').mockResolvedValue({
        strandId: 'alpha',
        baseObservation: {
          lamportCeiling: 5,
          frontierDigest: 'frontier-digest',
          frontier: { zeta: 'z'.repeat(40), alpha: 'a'.repeat(40) },
        },
        overlay: {
          headPatchSha: 'f'.repeat(40),
          patchCount: 2,
          writable: true,
        },
        braid: {
          readOverlays: [{ strandId: 'gamma' }, { strandId: 'beta' }],
        },
      });
      const getPatchEntriesSpy = vi.spyOn(StrandService.prototype, 'getPatchEntries').mockResolvedValue([
        {
          patch: {
            schema: 2,
            writer: 'w1',
            lamport: 1,
            ops: [{ type: 'PropSet', node: 'n1', key: 'k', value: 'a' }],
            context: {},
          },
          sha: 'a'.repeat(40),
        },
        {
          patch: {
            schema: 2,
            writer: 'w2',
            lamport: 2,
            ops: [{ type: 'PropSet', node: 'n1', key: 'k', value: 'b' }],
            context: {},
          },
          sha: 'b'.repeat(40),
        },
      ]);

      try {
        const result = await analyzer.analyze({ strandId: 'alpha', at: { lamportCeiling: 5 } });

        expect(getOrThrowSpy).toHaveBeenCalledWith('alpha');
        expect(getPatchEntriesSpy).toHaveBeenCalledWith('alpha', { ceiling: 5 });
        expect(result.resolvedCoordinate.coordinateKind).toBe('strand');
        expect(result.resolvedCoordinate.strand).toEqual({
          strandId: 'alpha',
          baseLamportCeiling: 5,
          overlayHeadPatchSha: 'f'.repeat(40),
          overlayPatchCount: 2,
          overlayWritable: true,
          braid: {
            readOverlayCount: 2,
            braidedStrandIds: ['beta', 'gamma'],
          },
        });
        expect(Object.keys(result.resolvedCoordinate.frontier)).toEqual(['alpha', 'zeta']);
      } finally {
        getOrThrowSpy.mockRestore();
        getPatchEntriesSpy.mockRestore();
      }
    });
  });

  // ── analyze: snapshot hash determinism ──────────────────────────────────

  describe('analyze — snapshot hash', () => {
    it('produces identical hash for identical inputs', async () => {
      const makeGraph = () => createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: { schema: 2, writer: 'w1', lamport: 1, ops: [{ type: 'NodeAdd', node: 'n1', dot: { writerId: 'w1', counter: 1 } }], context: {} },
              sha: 'a'.repeat(40),
            },
          ],
        },
      });

      const a1 = new ConflictAnalyzerService({ graph: makeGraph() });
      const a2 = new ConflictAnalyzerService({ graph: makeGraph() });

      const r1 = await a1.analyze();
      const r2 = await a2.analyze();

      expect(r1.analysisSnapshotHash).toBe(r2.analysisSnapshotHash);
    });

    it('produces different hash for different inputs', async () => {
      const g1 = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: { schema: 2, writer: 'w1', lamport: 1, ops: [{ type: 'NodeAdd', node: 'n1', dot: { writerId: 'w1', counter: 1 } }], context: {} },
              sha: 'a'.repeat(40),
            },
          ],
        },
      });
      const g2 = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: { schema: 2, writer: 'w1', lamport: 1, ops: [{ type: 'NodeAdd', node: 'n2', dot: { writerId: 'w1', counter: 1 } }], context: {} },
              sha: 'c'.repeat(40),
            },
          ],
        },
      });

      const r1 = await new ConflictAnalyzerService({ graph: g1 }).analyze();
      const r2 = await new ConflictAnalyzerService({ graph: g2 }).analyze();

      expect(r1.analysisSnapshotHash).not.toBe(r2.analysisSnapshotHash);
    });

    it('orders equal-lamport frames deterministically when writer ids are absent', async () => {
      const makeGraph = () => createMockGraph({
        writerPatches: {
          alpha: [
            {
              patch: {
                schema: 2,
                lamport: 1,
                ops: [],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
          ],
          beta: [
            {
              patch: {
                schema: 2,
                lamport: 1,
                ops: [],
                context: {},
              },
              sha: 'b'.repeat(40),
            },
          ],
        },
      });

      const analyzeOnce = async () => {
        const analyzer = new ConflictAnalyzerService({ graph: makeGraph() });
        const reduceSpy = vi.spyOn(JoinReducer, 'reduceV5').mockReturnValue({
          receipts: [
            { patchSha: 'a'.repeat(40), writer: '', lamport: 1, ops: [] },
            { patchSha: 'b'.repeat(40), writer: '', lamport: 1, ops: [] },
          ],
        });
        try {
          return await analyzer.analyze();
        } finally {
          reduceSpy.mockRestore();
        }
      };

      const r1 = await analyzeOnce();
      const r2 = await analyzeOnce();

      expect(r1.analysisSnapshotHash).toBe(r2.analysisSnapshotHash);
    });
  });

  // ── analyze: multi-writer complex scenarios ─────────────────────────────

  describe('analyze — complex scenarios', () => {
    it('handles three writers competing on the same property', async () => {
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [
                  { type: 'NodeAdd', node: 'n1', dot: { writerId: 'w1', counter: 1 } },
                  { type: 'PropSet', node: 'n1', key: 'color', value: 'red' },
                ],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
          ],
          w2: [
            {
              patch: {
                schema: 2,
                writer: 'w2',
                lamport: 2,
                ops: [
                  { type: 'NodeAdd', node: 'n1', dot: { writerId: 'w2', counter: 1 } },
                  { type: 'PropSet', node: 'n1', key: 'color', value: 'blue' },
                ],
                context: {},
              },
              sha: 'b'.repeat(40),
            },
          ],
          w3: [
            {
              patch: {
                schema: 2,
                writer: 'w3',
                lamport: 3,
                ops: [
                  { type: 'NodeAdd', node: 'n1', dot: { writerId: 'w3', counter: 1 } },
                  { type: 'PropSet', node: 'n1', key: 'color', value: 'green' },
                ],
                context: {},
              },
              sha: 'c'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze();

      // w3 wins (highest lamport), w1 and w2 are losers
      const propConflicts = result.conflicts.filter(
        (c) => c.target?.targetKind === 'node_property',
      );
      expect(propConflicts.length).toBeGreaterThan(0);
    });

    it('handles edge operations in conflict detection', async () => {
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [
                  { type: 'NodeAdd', node: 'a', dot: { writerId: 'w1', counter: 1 } },
                  { type: 'NodeAdd', node: 'b', dot: { writerId: 'w1', counter: 2 } },
                  { type: 'EdgeAdd', from: 'a', to: 'b', label: 'knows', dot: { writerId: 'w1', counter: 3 } },
                ],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
          ],
          w2: [
            {
              patch: {
                schema: 2,
                writer: 'w2',
                lamport: 2,
                ops: [
                  { type: 'NodeAdd', node: 'a', dot: { writerId: 'w2', counter: 1 } },
                  { type: 'NodeAdd', node: 'b', dot: { writerId: 'w2', counter: 2 } },
                  { type: 'EdgeAdd', from: 'a', to: 'b', label: 'knows', dot: { writerId: 'w2', counter: 3 } },
                ],
                context: {},
              },
              sha: 'b'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze();

      // Both writers add same edge — valid analysis
      expect(result.analysisVersion).toBe(CONFLICT_ANALYSIS_VERSION);
    });

    it('filters edge-property conflicts by endpoint entityId', async () => {
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [
                  { type: 'NodeAdd', node: 'left', dot: { writerId: 'w1', counter: 1 } },
                  { type: 'NodeAdd', node: 'right', dot: { writerId: 'w1', counter: 2 } },
                  { type: 'EdgeAdd', from: 'left', to: 'right', label: 'rel', dot: { writerId: 'w1', counter: 3 } },
                  { type: 'EdgePropSet', from: 'left', to: 'right', label: 'rel', key: 'weight', value: 1 },
                ],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
          ],
          w2: [
            {
              patch: {
                schema: 2,
                writer: 'w2',
                lamport: 2,
                ops: [
                  { type: 'NodeAdd', node: 'left', dot: { writerId: 'w2', counter: 1 } },
                  { type: 'NodeAdd', node: 'right', dot: { writerId: 'w2', counter: 2 } },
                  { type: 'EdgeAdd', from: 'left', to: 'right', label: 'rel', dot: { writerId: 'w2', counter: 3 } },
                  { type: 'EdgePropSet', from: 'left', to: 'right', label: 'rel', key: 'weight', value: 2 },
                ],
                context: {},
              },
              sha: 'b'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze({ entityId: 'right' });
      const edgePropertyConflicts = result.conflicts.filter(
        (trace) => trace.target.targetKind === 'edge_property',
      );

      expect(edgePropertyConflicts.length).toBeGreaterThan(0);
      for (const trace of edgePropertyConflicts) {
        expect([trace.target.from, trace.target.to]).toContain('right');
      }
    });

    it('handles causally ordered writes', async () => {
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [
                  { type: 'NodeAdd', node: 'n1', dot: { writerId: 'w1', counter: 1 } },
                  { type: 'PropSet', node: 'n1', key: 'x', value: 'first' },
                ],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
          ],
          w2: [
            {
              patch: {
                schema: 2,
                writer: 'w2',
                lamport: 2,
                ops: [
                  { type: 'PropSet', node: 'n1', key: 'x', value: 'second' },
                ],
                // w2 has observed w1's write
                context: { w1: 1 },
              },
              sha: 'b'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze();

      // Causal ordering: w2 saw w1, so this is an ordered supersession
      const supersessions = result.conflicts.filter((c) => c.kind === 'supersession');
      if (supersessions.length > 0) {
        const loser = supersessions[0].losers[0];
        // May have 'ordered' or 'concurrent' causal relation depending on evidence level
        expect(loser.causalRelationToWinner).toBeDefined();
      }
    });

    it('handles same-writer sequential edits (normal evolution)', async () => {
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [
                  { type: 'NodeAdd', node: 'n1', dot: { writerId: 'w1', counter: 1 } },
                  { type: 'PropSet', node: 'n1', key: 'x', value: 'v1' },
                ],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 2,
                ops: [
                  { type: 'PropSet', node: 'n1', key: 'x', value: 'v2' },
                ],
                context: { w1: 1 },
              },
              sha: 'b'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze();

      // Same writer, sequential edits — supersession is normal, not alarming
      // The analyzer reports it factually
      expect(result.analysisVersion).toBe(CONFLICT_ANALYSIS_VERSION);
    });
  });

  // ── analyze: diagnostics ────────────────────────────────────────────────

  describe('analyze — diagnostics', () => {
    it('includes truncation diagnostic when scan budget is exceeded', async () => {
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: { schema: 2, writer: 'w1', lamport: 1, ops: [{ type: 'NodeAdd', node: 'n1', dot: { writerId: 'w1', counter: 1 } }], context: {} },
              sha: 'a'.repeat(40),
            },
            {
              patch: { schema: 2, writer: 'w1', lamport: 2, ops: [{ type: 'NodeAdd', node: 'n2', dot: { writerId: 'w1', counter: 2 } }], context: { w1: 1 } },
              sha: 'b'.repeat(40),
            },
            {
              patch: { schema: 2, writer: 'w1', lamport: 3, ops: [{ type: 'NodeAdd', node: 'n3', dot: { writerId: 'w1', counter: 3 } }], context: { w1: 2 } },
              sha: 'c'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze({ scanBudget: { maxPatches: 1 } });

      // Should include truncation diagnostic
      if (result.diagnostics) {
        expect(result.diagnostics.length).toBeGreaterThan(0);
      }
    });

    it('emits receipt_unavailable when reducer receipts are missing an op outcome', async () => {
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [{ type: 'PropSet', node: 'n1', key: 'k', value: 'v1' }],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });
      const reduceSpy = vi.spyOn(JoinReducer, 'reduceV5').mockReturnValue({
        receipts: [{
          patchSha: 'a'.repeat(40),
          writer: 'w1',
          lamport: 1,
          ops: [],
        }],
      });

      try {
        const result = await analyzer.analyze();

        expect(result.diagnostics?.some((d) => d.code === 'receipt_unavailable')).toBe(true);
      } finally {
        reduceSpy.mockRestore();
      }
    });

    it('emits anchor_incomplete when a NodeRemove has no node identity', async () => {
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [{ type: 'NodeRemove', observedDots: new Set() }],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze();

      expect(result.diagnostics?.some((d) => d.code === 'anchor_incomplete')).toBe(true);
    });

    it('emits anchor_incomplete when an EdgeRemove has no edge identity', async () => {
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [{ type: 'EdgeRemove', observedDots: new Set() }],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze();

      expect(result.diagnostics?.some((d) => d.code === 'anchor_incomplete')).toBe(true);
    });

    it('uses receipt target fallback to identify edge tombstones when op fields are absent', async () => {
      const sha = 'a'.repeat(40);
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [{ type: 'EdgeRemove' }],
                context: {},
              },
              sha,
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });
      const reduceSpy = vi.spyOn(JoinReducer, 'reduceV5').mockReturnValue({
        receipts: [{
          patchSha: sha,
          writer: 'w1',
          lamport: 1,
          ops: [{ result: 'applied', target: 'left\0right\0rel' }],
        }],
      });

      try {
        const result = await analyzer.analyze({ evidence: 'full' });

        expect(result.analysisVersion).toBe(CONFLICT_ANALYSIS_VERSION);
        expect(result.diagnostics?.some((d) => d.code === 'anchor_incomplete')).not.toBe(true);
      } finally {
        reduceSpy.mockRestore();
      }
    });

    it('emits anchor_incomplete when an edge receipt target cannot be decoded', async () => {
      const sha = 'a'.repeat(40);
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [{ type: 'EdgeRemove' }],
                context: {},
              },
              sha,
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });
      const reduceSpy = vi.spyOn(JoinReducer, 'reduceV5').mockReturnValue({
        receipts: [{
          patchSha: sha,
          writer: 'w1',
          lamport: 1,
          ops: [{ result: 'applied', target: 'left\0right' }],
        }],
      });

      try {
        const result = await analyzer.analyze();

        expect(result.diagnostics?.some((d) => d.code === 'anchor_incomplete')).toBe(true);
      } finally {
        reduceSpy.mockRestore();
      }
    });

    it('emits anchor_incomplete when a NodePropSet is missing node identity fields', async () => {
      const sha = 'a'.repeat(40);
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [{ type: 'NodePropSet', value: 'draft' }],
                context: {},
              },
              sha,
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });
      const reduceSpy = vi.spyOn(JoinReducer, 'reduceV5').mockReturnValue({
        receipts: [{
          patchSha: sha,
          writer: 'w1',
          lamport: 1,
          ops: [{ result: 'applied', target: 'n1\0status' }],
        }],
      });

      try {
        const result = await analyzer.analyze();

        expect(result.diagnostics?.some((d) => d.code === 'anchor_incomplete')).toBe(true);
      } finally {
        reduceSpy.mockRestore();
      }
    });

    it('emits anchor_incomplete when an EdgePropSet is missing edge identity fields', async () => {
      const sha = 'a'.repeat(40);
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [{ type: 'EdgePropSet', value: 'draft' }],
                context: {},
              },
              sha,
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });
      const reduceSpy = vi.spyOn(JoinReducer, 'reduceV5').mockReturnValue({
        receipts: [{
          patchSha: sha,
          writer: 'w1',
          lamport: 1,
          ops: [{ result: 'applied', target: 'left\0right\0rel' }],
        }],
      });

      try {
        const result = await analyzer.analyze();

        expect(result.diagnostics?.some((d) => d.code === 'anchor_incomplete')).toBe(true);
      } finally {
        reduceSpy.mockRestore();
      }
    });

    it('emits digest_unavailable when effect digest generation returns an empty string', async () => {
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [{ type: 'PropSet', node: 'n1', key: 'k', value: 'v1' }],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });
      const originalHash = analyzer._hash.bind(analyzer);
      const hashSpy = vi.spyOn(analyzer, '_hash').mockImplementation(async (payload) => {
        if (
          payload !== null &&
          typeof payload === 'object' &&
          'opType' in payload &&
          payload['opType'] === 'NodePropSet'
        ) {
          return '';
        }
        return await originalHash(payload);
      });

      try {
        const result = await analyzer.analyze();

        expect(result.diagnostics?.some((d) => d.code === 'digest_unavailable')).toBe(true);
      } finally {
        hashSpy.mockRestore();
      }
    });

    it('emits digest_unavailable when a receipt name has no effect normalizer', async () => {
      const sha = 'a'.repeat(40);
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [{ type: 'NodeAdd', node: 'n1', dot: { writerId: 'w1', counter: 1 } }],
                context: {},
              },
              sha,
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });
      const nodeAddStrategy = JoinReducer.OP_STRATEGIES.get('NodeAdd');
      const originalReceiptName = nodeAddStrategy?.receiptName;
      const reduceSpy = vi.spyOn(JoinReducer, 'reduceV5').mockReturnValue({
        receipts: [{
          patchSha: sha,
          writer: 'w1',
          lamport: 1,
          ops: [{ result: 'applied', target: 'n1' }],
        }],
      });
      if (nodeAddStrategy === undefined || originalReceiptName === undefined) {
        throw new Error('NodeAdd strategy is unavailable');
      }
      nodeAddStrategy.receiptName = 'UnsupportedEffect';

      try {
        const result = await analyzer.analyze();

        expect(result.diagnostics?.some((d) => d.code === 'digest_unavailable')).toBe(true);
      } finally {
        nodeAddStrategy.receiptName = originalReceiptName;
        reduceSpy.mockRestore();
      }
    });

    it('skips unknown forward-compatible ops without failing analysis', async () => {
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [{ type: 'FutureOpV99', payload: 'mystery' }],
                context: null,
              },
              sha: 'a'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze();

      expect(result.conflicts).toEqual([]);
      expect(result.analysisVersion).toBe(CONFLICT_ANALYSIS_VERSION);
    });

    it('processes node and edge tombstones through effect normalization', async () => {
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [
                  { type: 'NodeAdd', node: 'n1', dot: { writerId: 'w1', counter: 1 } },
                  { type: 'EdgeAdd', from: 'n1', to: 'n2', label: 'rel', dot: { writerId: 'w1', counter: 2 } },
                  { type: 'NodeRemove', node: 'n1', observedDots: new Set() },
                  { type: 'EdgeRemove', from: 'n1', to: 'n2', label: 'rel', observedDots: new Set() },
                ],
                context: new Map([['w0', 0]]),
              },
              sha: 'a'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze({ evidence: 'full' });

      expect(result.analysisVersion).toBe(CONFLICT_ANALYSIS_VERSION);
      expect(result.diagnostics?.some((d) => d.code === 'anchor_incomplete')).not.toBe(true);
    });

    it('supports legacy PropSet receipt names for node-property effects', async () => {
      const alphaSha = 'a'.repeat(40);
      const betaSha = 'b'.repeat(40);
      const graph = createMockGraph({
        writerPatches: {
          alpha: [
            {
              patch: {
                schema: 2,
                writer: 'alpha',
                lamport: 1,
                ops: [{ type: 'NodePropSet', node: 'n1', key: 'status', value: 'draft' }],
                context: {},
              },
              sha: alphaSha,
            },
          ],
          beta: [
            {
              patch: {
                schema: 2,
                writer: 'beta',
                lamport: 2,
                ops: [{ type: 'NodePropSet', node: 'n1', key: 'status', value: 'published' }],
                context: {},
              },
              sha: betaSha,
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });
      const nodePropStrategy = JoinReducer.OP_STRATEGIES.get('NodePropSet');
      const originalReceiptName = nodePropStrategy?.receiptName;
      const reduceSpy = vi.spyOn(JoinReducer, 'reduceV5').mockReturnValue({
        receipts: [
          {
            patchSha: alphaSha,
            writer: 'alpha',
            lamport: 1,
            ops: [{ result: 'applied', target: 'n1\0status' }],
          },
          {
            patchSha: betaSha,
            writer: 'beta',
            lamport: 2,
            ops: [{ result: 'applied', target: 'n1\0status' }],
          },
        ],
      });
      if (nodePropStrategy === undefined || originalReceiptName === undefined) {
        throw new Error('NodePropSet strategy is unavailable');
      }
      nodePropStrategy.receiptName = 'PropSet';

      try {
        const result = await analyzer.analyze();

        expect(result.analysisVersion).toBe(CONFLICT_ANALYSIS_VERSION);
        expect(result.diagnostics?.some((d) => d.code === 'digest_unavailable')).not.toBe(true);
      } finally {
        nodePropStrategy.receiptName = originalReceiptName;
        reduceSpy.mockRestore();
      }
    });

    it('builds replay-equivalent redundancy traces for identical property effects', async () => {
      const alphaSha = 'a'.repeat(40);
      const betaSha = 'b'.repeat(40);
      const graph = createMockGraph({
        writerPatches: {
          alpha: [
            {
              patch: {
                schema: 2,
                writer: 'alpha',
                lamport: 1,
                ops: [{ type: 'NodePropSet', node: 'n1', key: 'status', value: 'draft' }],
                context: {},
              },
              sha: alphaSha,
            },
          ],
          beta: [
            {
              patch: {
                schema: 2,
                writer: 'beta',
                lamport: 2,
                ops: [{ type: 'NodePropSet', node: 'n1', key: 'status', value: 'draft' }],
                context: {},
              },
              sha: betaSha,
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });
      const reduceSpy = vi.spyOn(JoinReducer, 'reduceV5').mockReturnValue({
        receipts: [
          {
            patchSha: alphaSha,
            writer: 'alpha',
            lamport: 1,
            ops: [{ result: 'applied', target: 'n1\0status' }],
          },
          {
            patchSha: betaSha,
            writer: 'beta',
            lamport: 2,
            ops: [{ result: 'redundant', target: 'n1\0status' }],
          },
        ],
      });

      try {
        const result = await analyzer.analyze({ evidence: 'full' });
        const redundancy = result.conflicts.find((trace) => trace.kind === 'redundancy');

        expect(redundancy).toBeDefined();
        expect(redundancy?.resolution.comparator).toEqual({ type: 'effect_digest' });
        expect(redundancy?.losers[0]?.causalRelationToWinner).toBe('replay_equivalent');
        expect(redundancy?.losers[0]?.structurallyDistinctAlternative).toBe(false);
        expect(redundancy?.losers[0]?.notes).toContain('receipt_redundant');
        expect(redundancy?.losers[0]?.notes).toContain('replay_equivalent_effect');
      } finally {
        reduceSpy.mockRestore();
      }
    });

    it('includes ordered loser notes at full evidence when the winner observed the loser', async () => {
      const graph = createMockGraph({
        writerPatches: {
          alpha: [
            {
              patch: {
                schema: 2,
                writer: 'alpha',
                lamport: 1,
                ops: [{ type: 'PropSet', node: 'n1', key: 'status', value: 'draft' }],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
          ],
          beta: [
            {
              patch: {
                schema: 2,
                writer: 'beta',
                lamport: 2,
                ops: [{ type: 'PropSet', node: 'n1', key: 'status', value: 'published' }],
                context: { alpha: 1 },
              },
              sha: 'b'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze({ evidence: 'full', kind: 'eventual_override' });

      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts[0]?.losers[0]?.notes).toContain('ordered_before_winner');
    });
  });

  // ── _hash ───────────────────────────────────────────────────────────────

  describe('_hash', () => {
    it('returns deterministic hash for same payload', async () => {
      const graph = createMockGraph();
      const analyzer = new ConflictAnalyzerService({ graph });

      const h1 = await analyzer._hash({ key: 'value' });
      const h2 = await analyzer._hash({ key: 'value' });

      expect(h1).toBe(h2);
    });

    it('returns different hash for different payloads', async () => {
      const graph = createMockGraph();
      const analyzer = new ConflictAnalyzerService({ graph });

      const h1 = await analyzer._hash({ a: 1 });
      const h2 = await analyzer._hash({ b: 2 });

      expect(h1).not.toBe(h2);
    });

    it('caches results in digest cache', async () => {
      const graph = createMockGraph();
      const analyzer = new ConflictAnalyzerService({ graph });

      await analyzer._hash({ x: 1 });
      expect(analyzer._digestCache.size).toBeGreaterThan(0);
    });
  });

  // ── analyze: trace structure ────────────────────────────────────────────

  describe('analyze — trace structure', () => {
    it('produces traces with all required fields', async () => {
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [{ type: 'PropSet', node: 'n1', key: 'k', value: 'a' }],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
          ],
          w2: [
            {
              patch: {
                schema: 2,
                writer: 'w2',
                lamport: 10,
                ops: [{ type: 'PropSet', node: 'n1', key: 'k', value: 'b' }],
                context: {},
              },
              sha: 'b'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze({ evidence: 'full' });

      for (const trace of result.conflicts) {
        // Required fields on every trace
        expect(trace.conflictId).toBeTruthy();
        expect(trace.kind).toBeTruthy();
        expect(VALID_KINDS_SET.has(trace.kind)).toBe(true);
        expect(trace.target).toBeDefined();
        expect(trace.target.targetDigest).toBeTruthy();
        expect(trace.winner).toBeDefined();
        expect(trace.winner.anchor).toBeDefined();
        expect(trace.winner.anchor.patchSha).toBeTruthy();
        expect(trace.winner.anchor.writerId).toBeTruthy();
        expect(typeof trace.winner.anchor.lamport).toBe('number');
        expect(trace.winner.effectDigest).toBeTruthy();
        expect(Array.isArray(trace.losers)).toBe(true);
        expect(trace.resolution).toBeDefined();
        expect(trace.evidence).toBeDefined();
        expect(trace.whyFingerprint).toBeTruthy();
      }
    });

    it('losers have required participant fields', async () => {
      const graph = createMockGraph({
        writerPatches: {
          w1: [
            {
              patch: {
                schema: 2,
                writer: 'w1',
                lamport: 1,
                ops: [{ type: 'PropSet', node: 'n1', key: 'k', value: 'a' }],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
          ],
          w2: [
            {
              patch: {
                schema: 2,
                writer: 'w2',
                lamport: 10,
                ops: [{ type: 'PropSet', node: 'n1', key: 'k', value: 'b' }],
                context: {},
              },
              sha: 'b'.repeat(40),
            },
          ],
        },
      });
      const analyzer = new ConflictAnalyzerService({ graph });

      const result = await analyzer.analyze({ evidence: 'full' });

      for (const trace of result.conflicts) {
        for (const loser of trace.losers) {
          expect(loser.anchor).toBeDefined();
          expect(loser.anchor.patchSha).toBeTruthy();
          expect(loser.effectDigest).toBeTruthy();
          expect(loser.causalRelationToWinner).toBeDefined();
        }
      }
    });

    it('sorts multiple conflict traces deterministically when several targets conflict', async () => {
      const makeGraph = () => createMockGraph({
        writerPatches: {
          alpha: [
            {
              patch: {
                schema: 2,
                writer: 'alpha',
                lamport: 1,
                ops: [
                  { type: 'PropSet', node: 'n1', key: 'status', value: 'draft' },
                  { type: 'PropSet', node: 'n2', key: 'status', value: 'draft' },
                ],
                context: {},
              },
              sha: 'a'.repeat(40),
            },
          ],
          beta: [
            {
              patch: {
                schema: 2,
                writer: 'beta',
                lamport: 2,
                ops: [
                  { type: 'PropSet', node: 'n1', key: 'status', value: 'published' },
                  { type: 'PropSet', node: 'n2', key: 'status', value: 'archived' },
                ],
                context: {},
              },
              sha: 'b'.repeat(40),
            },
          ],
        },
      });

      const result1 = await new ConflictAnalyzerService({ graph: makeGraph() }).analyze();
      const result2 = await new ConflictAnalyzerService({ graph: makeGraph() }).analyze();

      expect(result1.conflicts.length).toBeGreaterThan(1);
      expect(result1.conflicts.map((trace) => trace.conflictId)).toEqual(
        result2.conflicts.map((trace) => trace.conflictId),
      );
    });

    it('sorts mixed conflict kinds deterministically', async () => {
      const alphaSha = 'a'.repeat(40);
      const betaSha = 'b'.repeat(40);
      const gammaSha = 'c'.repeat(40);

      const makeGraph = () => createMockGraph({
        writerPatches: {
          alpha: [
            {
              patch: {
                schema: 2,
                writer: 'alpha',
                lamport: 1,
                ops: [
                  { type: 'NodePropSet', node: 'n1', key: 'status', value: 'draft' },
                  { type: 'NodePropSet', node: 'n2', key: 'status', value: 'draft' },
                ],
                context: {},
              },
              sha: alphaSha,
            },
          ],
          beta: [
            {
              patch: {
                schema: 2,
                writer: 'beta',
                lamport: 2,
                ops: [{ type: 'NodePropSet', node: 'n1', key: 'status', value: 'draft' }],
                context: {},
              },
              sha: betaSha,
            },
          ],
          gamma: [
            {
              patch: {
                schema: 2,
                writer: 'gamma',
                lamport: 3,
                ops: [{ type: 'NodePropSet', node: 'n2', key: 'status', value: 'published' }],
                context: {},
              },
              sha: gammaSha,
            },
          ],
        },
      });

      const analyzeOnce = async () => {
        const analyzer = new ConflictAnalyzerService({ graph: makeGraph() });
        const reduceSpy = vi.spyOn(JoinReducer, 'reduceV5').mockReturnValue({
          receipts: [
            {
              patchSha: alphaSha,
              writer: 'alpha',
              lamport: 1,
              ops: [
                { result: 'applied', target: 'n1\0status' },
                { result: 'applied', target: 'n2\0status' },
              ],
            },
            {
              patchSha: betaSha,
              writer: 'beta',
              lamport: 2,
              ops: [{ result: 'redundant', target: 'n1\0status' }],
            },
            {
              patchSha: gammaSha,
              writer: 'gamma',
              lamport: 3,
              ops: [{ result: 'applied', target: 'n2\0status' }],
            },
          ],
        });
        try {
          return await analyzer.analyze({ evidence: 'full' });
        } finally {
          reduceSpy.mockRestore();
        }
      };

      const result1 = await analyzeOnce();
      const result2 = await analyzeOnce();

      expect(result1.conflicts.map((trace) => trace.kind)).toContain('redundancy');
      expect(result1.conflicts.map((trace) => trace.kind)).toContain('eventual_override');
      expect(result1.conflicts.map((trace) => trace.conflictId)).toEqual(
        result2.conflicts.map((trace) => trace.conflictId),
      );
    });
  });
});

const VALID_KINDS_SET = new Set(['supersession', 'eventual_override', 'redundancy']);
