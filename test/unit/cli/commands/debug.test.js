import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../bin/cli/shared.js', () => ({
  openGraph: vi.fn(),
  readActiveCursor: vi.fn(),
  emitCursorWarning: vi.fn(),
}));

const { openGraph, readActiveCursor, emitCursorWarning } = await import('../../../../bin/cli/shared.js');
const handleDebug = (await import('../../../../bin/cli/commands/debug.js')).default;

/**
 * @typedef {{
 *   workingSetId?: string,
 *   baseLamportCeiling?: number|null,
 *   overlayHeadPatchSha?: string,
 *   overlayPatchCount?: number,
 *   overlayWritable?: boolean,
 *   readOverlays?: Array<{workingSetId: string}>
 * }} WorkingSetDescriptorOverrides
 */

/**
 * @param {WorkingSetDescriptorOverrides} [overrides]
 */
function makeWorkingSetDescriptor(overrides = {}) {
  return {
    workingSetId: overrides.workingSetId ?? 'ws_review',
    baseObservation: {
      lamportCeiling: overrides.baseLamportCeiling ?? null,
    },
    overlay: {
      headPatchSha: overrides.overlayHeadPatchSha ?? 'a'.repeat(40),
      patchCount: overrides.overlayPatchCount ?? 1,
      writable: overrides.overlayWritable ?? false,
    },
    braid: {
      readOverlays: overrides.readOverlays ?? [
        { workingSetId: 'ws_hold' },
      ],
    },
  };
}

describe('handleDebug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('analyzes conflicts with cursor-derived lamport ceiling by default', async () => {
    const analyzeConflicts = vi.fn().mockResolvedValue({
      analysisVersion: 'conflict-analyzer.v1',
      resolvedCoordinate: {
        analysisVersion: 'conflict-analyzer.v1',
        frontier: { alice: 'a'.repeat(40) },
        frontierDigest: 'f'.repeat(40),
        lamportCeiling: 12,
        scanBudgetApplied: { maxPatches: null },
        truncationPolicy: 'reverse-causal',
      },
      analysisSnapshotHash: 's'.repeat(40),
      conflicts: [],
    });

    /** @type {any} */ (openGraph).mockResolvedValue({
      graph: { analyzeConflicts },
      graphName: 'default',
      persistence: {},
    });
    /** @type {any} */ (readActiveCursor).mockResolvedValue({ tick: 12 });

    const result = await handleDebug({
      options: /** @type {any} */ ({ repo: '.', graph: null, writer: 'cli' }),
      args: ['conflicts'],
    });

    expect(analyzeConflicts).toHaveBeenCalledWith({
      workingSetId: undefined,
      at: { lamportCeiling: 12 },
      entityId: undefined,
      target: undefined,
      kind: undefined,
      writerId: undefined,
      evidence: 'standard',
      scanBudget: undefined,
    });
    expect(emitCursorWarning).toHaveBeenCalledWith({ active: true, tick: 12, maxTick: null }, null);
    expect(result.payload).toMatchObject({
      graph: 'default',
      debugTopic: 'conflicts',
      analysisVersion: 'conflict-analyzer.v1',
    });
  });

  it('passes explicit filters through to analyzeConflicts', async () => {
    const analyzeConflicts = vi.fn().mockResolvedValue({
      analysisVersion: 'conflict-analyzer.v1',
      resolvedCoordinate: {
        analysisVersion: 'conflict-analyzer.v1',
        frontier: {},
        frontierDigest: 'f'.repeat(40),
        lamportCeiling: 3,
        scanBudgetApplied: { maxPatches: 5 },
        truncationPolicy: 'reverse-causal',
      },
      analysisSnapshotHash: 's'.repeat(40),
      conflicts: [],
    });

    /** @type {any} */ (openGraph).mockResolvedValue({
      graph: { analyzeConflicts },
      graphName: 'demo',
      persistence: {},
    });
    /** @type {any} */ (readActiveCursor).mockResolvedValue(null);

    await handleDebug({
      options: /** @type {any} */ ({ repo: '.', graph: 'demo', writer: 'cli' }),
      args: [
        'conflicts',
        '--entity-id', 'user:alice',
        '--target-kind', 'node_property',
        '--property-key', 'role',
        '--kind', 'supersession',
        '--kind', 'redundancy',
        '--writer-id', 'bob',
        '--lamport-ceiling', '3',
        '--evidence', 'full',
        '--max-patches', '5',
      ],
    });

    expect(analyzeConflicts).toHaveBeenCalledWith({
      workingSetId: undefined,
      at: { lamportCeiling: 3 },
      entityId: 'user:alice',
      target: {
        targetKind: 'node_property',
        entityId: 'user:alice',
        propertyKey: 'role',
        from: undefined,
        to: undefined,
        label: undefined,
      },
      kind: ['supersession', 'redundancy'],
      writerId: 'bob',
      evidence: 'full',
      scanBudget: { maxPatches: 5 },
    });
  });

  it('passes --working-set through to analyzeConflicts without changing the live CLI shape', async () => {
    const analyzeConflicts = vi.fn().mockResolvedValue({
      analysisVersion: 'conflict-analyzer.v2',
      resolvedCoordinate: {
        analysisVersion: 'conflict-analyzer.v2',
        coordinateKind: 'working_set',
        frontier: {},
        frontierDigest: 'f'.repeat(40),
        lamportCeiling: null,
        scanBudgetApplied: { maxPatches: null },
        truncationPolicy: 'reverse-causal',
        workingSet: {
          workingSetId: 'ws_review',
          baseLamportCeiling: null,
          overlayHeadPatchSha: 'a'.repeat(40),
          overlayPatchCount: 1,
        },
      },
      analysisSnapshotHash: 's'.repeat(40),
      conflicts: [],
    });

    /** @type {any} */ (openGraph).mockResolvedValue({
      graph: { analyzeConflicts },
      graphName: 'demo',
      persistence: {},
    });
    /** @type {any} */ (readActiveCursor).mockResolvedValue(null);

    await handleDebug({
      options: /** @type {any} */ ({ repo: '.', graph: 'demo', writer: 'cli' }),
      args: ['conflicts', '--working-set', 'ws_review'],
    });

    expect(analyzeConflicts).toHaveBeenCalledWith({
      workingSetId: 'ws_review',
      at: undefined,
      entityId: undefined,
      target: undefined,
      kind: undefined,
      writerId: undefined,
      evidence: 'standard',
      scanBudget: undefined,
    });
  });

  it('reports the resolved observation coordinate and visible frontier', async () => {
    const materialize = vi.fn().mockResolvedValue({});
    const discoverTicks = vi.fn().mockResolvedValue({
      ticks: [1, 2, 4],
      maxTick: 4,
      perWriter: new Map([
        ['alice', { ticks: [1, 4], tipSha: 'a'.repeat(40), tickShas: { 4: 'a'.repeat(40) } }],
        ['bob', { ticks: [2], tipSha: 'b'.repeat(40), tickShas: { 2: 'b'.repeat(40) } }],
      ]),
    });
    const getNodes = vi.fn().mockResolvedValue(['n1', 'n2']);
    const getEdges = vi.fn().mockResolvedValue([{ from: 'n1', to: 'n2', label: 'knows' }]);
    const getPropertyCount = vi.fn().mockResolvedValue(3);
    const loadPatchBySha = vi.fn().mockResolvedValue({
      ops: [{ type: 'PropSet', node: 'n1', key: 'role', value: 'admin' }],
    });

    /** @type {any} */ (openGraph).mockResolvedValue({
      graph: { materialize, discoverTicks, getNodes, getEdges, getPropertyCount, loadPatchBySha },
      graphName: 'demo',
      persistence: {},
    });
    /** @type {any} */ (readActiveCursor).mockResolvedValue({ tick: 4, mode: 'lamport' });

    const result = await handleDebug({
      options: /** @type {any} */ ({ repo: '.', graph: 'demo', writer: 'cli' }),
      args: ['coordinate'],
    });

    expect(materialize).toHaveBeenCalledWith({ ceiling: 4 });
    expect(result.payload).toMatchObject({
      graph: 'demo',
      debugTopic: 'coordinate',
      coordinateSource: 'cursor',
      activeCursor: { tick: 4, mode: 'lamport' },
      resolvedCoordinate: {
        tick: 4,
        lamportCeiling: 4,
        maxTick: 4,
        patchCount: 3,
        nodes: 2,
        edges: 1,
        properties: 3,
      },
    });
    expect(/** @type {any} */ (result.payload).tickReceipt).toHaveProperty('alice');
  });

  it('rejects missing target kind when target fields are provided', async () => {
    await expect(handleDebug({
      options: /** @type {any} */ ({ repo: '.', graph: null, writer: 'cli' }),
      args: ['conflicts', '--property-key', 'role'],
    })).rejects.toThrow(/--target-kind/);
  });

  it('inspects provenance with explicit materialization and causal patch summaries', async () => {
    const materialize = vi.fn().mockResolvedValue({});
    const patchesFor = vi.fn().mockResolvedValue(['b'.repeat(40), 'a'.repeat(40)]);
    const loadPatchBySha = vi.fn()
      .mockResolvedValueOnce({
        writer: 'alice',
        lamport: 2,
        schema: 2,
        ops: [{ type: 'NodeAdd', node: 'n1' }],
        reads: ['n0'],
        writes: ['n1'],
      })
      .mockResolvedValueOnce({
        writer: 'alice',
        lamport: 1,
        schema: 2,
        ops: [{ type: 'PropSet', node: 'n1', key: 'role', value: 'admin' }],
        reads: [],
        writes: ['n1'],
      });

    /** @type {any} */ (openGraph).mockResolvedValue({
      graph: { materialize, patchesFor, loadPatchBySha },
      graphName: 'demo',
      persistence: {},
    });
    /** @type {any} */ (readActiveCursor).mockResolvedValue({ tick: 7 });

    const result = await handleDebug({
      options: /** @type {any} */ ({ repo: '.', graph: 'demo', writer: 'cli' }),
      args: ['provenance', '--entity-id', 'n1', '--max-patches', '1'],
    });

    expect(materialize).toHaveBeenCalledWith({ ceiling: 7 });
    expect(patchesFor).toHaveBeenCalledWith('n1');
    expect(result.payload).toMatchObject({
      graph: 'demo',
      debugTopic: 'provenance',
      entityId: 'n1',
      lamportCeiling: 7,
      totalPatches: 2,
      returnedPatches: 1,
      truncated: true,
    });
    expect(/** @type {any} */ (result.payload).entries[0]).toMatchObject({
      sha: 'a'.repeat(40),
      lamport: 1,
    });
  });

  it('inspects provenance inside a working set via patchesForWorkingSet', async () => {
    const patchesForWorkingSet = vi.fn().mockResolvedValue(['a'.repeat(40)]);
    const loadPatchBySha = vi.fn().mockResolvedValue({
      writer: 'ws_review',
      lamport: 2,
      schema: 2,
      ops: [{ type: 'PropSet', node: 'n1', key: 'role', value: 'review' }],
      reads: ['n1'],
      writes: ['n1'],
    });
    const getWorkingSet = vi.fn().mockResolvedValue(makeWorkingSetDescriptor());

    /** @type {any} */ (openGraph).mockResolvedValue({
      graph: { getWorkingSet, patchesForWorkingSet, loadPatchBySha },
      graphName: 'demo',
      persistence: {},
    });
    /** @type {any} */ (readActiveCursor).mockResolvedValue({ tick: 2 });

    const result = await handleDebug({
      options: /** @type {any} */ ({ repo: '.', graph: 'demo', writer: 'cli' }),
      args: ['provenance', '--working-set', 'ws_review', '--entity-id', 'n1'],
    });

    expect(patchesForWorkingSet).toHaveBeenCalledWith('ws_review', 'n1', { ceiling: 2 });
    expect(getWorkingSet).toHaveBeenCalledWith('ws_review');
    expect(/** @type {any} */ (result.payload).workingSet).toMatchObject({
      workingSetId: 'ws_review',
      overlayWritable: false,
      braid: {
        readOverlayCount: 1,
        braidedWorkingSetIds: ['ws_hold'],
      },
    });
  });

  it('inspects a cross-writer timeline with cursor-aware ceiling and newest-window limiting', async () => {
    const discoverWriters = vi.fn().mockResolvedValue(['alice', 'bob']);
    const getWriterPatches = vi.fn()
      .mockResolvedValueOnce([
        {
          sha: 'a'.repeat(40),
          patch: {
            writer: 'alice',
            lamport: 1,
            schema: 2,
            ops: [{ type: 'NodeAdd', node: 'user:alice' }],
            reads: [],
            writes: ['user:alice'],
          },
        },
        {
          sha: 'c'.repeat(40),
          patch: {
            writer: 'alice',
            lamport: 4,
            schema: 2,
            ops: [{ type: 'PropSet', node: 'user:alice', key: 'role', value: 'lead' }],
            reads: ['user:alice'],
            writes: ['user:alice'],
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          sha: 'b'.repeat(40),
          patch: {
            writer: 'bob',
            lamport: 2,
            schema: 2,
            ops: [{ type: 'EdgeAdd', from: 'user:bob', to: 'project:api', label: 'works-on' }],
            reads: [],
            writes: ['project:api'],
          },
        },
      ]);

    /** @type {any} */ (openGraph).mockResolvedValue({
      graph: { discoverWriters, getWriterPatches },
      graphName: 'demo',
      persistence: {},
    });
    /** @type {any} */ (readActiveCursor).mockResolvedValue({ tick: 4 });

    const result = await handleDebug({
      options: /** @type {any} */ ({ repo: '.', graph: 'demo', writer: 'cli' }),
      args: ['timeline', '--lamport-floor', '1', '--limit', '2'],
    });

    expect(result.payload).toMatchObject({
      graph: 'demo',
      debugTopic: 'timeline',
      coordinateSource: 'cursor',
      filters: {
        entityId: null,
        writerId: null,
        lamportFloor: 1,
        lamportCeiling: 4,
      },
      totalEntries: 3,
      returnedEntries: 2,
      truncated: true,
    });
    expect(/** @type {any} */ (result.payload).entries.map((/** @type {{lamport: number}} */ entry) => entry.lamport)).toEqual([2, 4]);
  });

  it('inspects a working-set timeline through getWorkingSetPatches', async () => {
    const getWorkingSetPatches = vi.fn().mockResolvedValue([
      {
        sha: 'a'.repeat(40),
        patch: {
          writer: 'alice',
          lamport: 1,
          schema: 2,
          ops: [{ type: 'NodeAdd', node: 'n1' }],
          reads: [],
          writes: ['n1'],
        },
      },
      {
        sha: 'b'.repeat(40),
        patch: {
          writer: 'ws_review',
          lamport: 2,
          schema: 2,
          ops: [{ type: 'PropSet', node: 'n1', key: 'status', value: 'overlay' }],
          reads: ['n1'],
          writes: ['n1'],
        },
      },
    ]);
    const getWorkingSet = vi.fn().mockResolvedValue(makeWorkingSetDescriptor());

    /** @type {any} */ (openGraph).mockResolvedValue({
      graph: { getWorkingSet, getWorkingSetPatches },
      graphName: 'demo',
      persistence: {},
    });
    /** @type {any} */ (readActiveCursor).mockResolvedValue(null);

    const result = await handleDebug({
      options: /** @type {any} */ ({ repo: '.', graph: 'demo', writer: 'cli' }),
      args: ['timeline', '--working-set', 'ws_review'],
    });

    expect(getWorkingSetPatches).toHaveBeenCalledWith('ws_review');
    expect(result.payload).toMatchObject({
      graph: 'demo',
      debugTopic: 'timeline',
      workingSetId: 'ws_review',
      workingSet: {
        overlayWritable: false,
        braid: {
          readOverlayCount: 1,
          braidedWorkingSetIds: ['ws_hold'],
        },
      },
      totalEntries: 2,
      returnedEntries: 2,
    });
  });

  it('inspects an entity-local working-set timeline through patchesForWorkingSet', async () => {
    const patchesForWorkingSet = vi.fn().mockResolvedValue(['a'.repeat(40)]);
    const loadPatchBySha = vi.fn().mockResolvedValue({
      writer: 'ws_review',
      lamport: 2,
      schema: 2,
      ops: [{ type: 'PropSet', node: 'n1', key: 'status', value: 'overlay' }],
      reads: ['n1'],
      writes: ['n1'],
    });
    const getWorkingSet = vi.fn().mockResolvedValue(makeWorkingSetDescriptor());

    /** @type {any} */ (openGraph).mockResolvedValue({
      graph: { getWorkingSet, patchesForWorkingSet, loadPatchBySha },
      graphName: 'demo',
      persistence: {},
    });
    /** @type {any} */ (readActiveCursor).mockResolvedValue({ tick: 2 });

    const result = await handleDebug({
      options: /** @type {any} */ ({ repo: '.', graph: 'demo', writer: 'cli' }),
      args: ['timeline', '--working-set', 'ws_review', '--entity-id', 'n1'],
    });

    expect(patchesForWorkingSet).toHaveBeenCalledWith('ws_review', 'n1', { ceiling: 2 });
    expect(loadPatchBySha).toHaveBeenCalledWith('a'.repeat(40));
    expect(result.payload).toMatchObject({
      graph: 'demo',
      debugTopic: 'timeline',
      workingSetId: 'ws_review',
      workingSet: {
        overlayWritable: false,
        braid: {
          readOverlayCount: 1,
          braidedWorkingSetIds: ['ws_hold'],
        },
      },
      filters: {
        entityId: 'n1',
        lamportCeiling: 2,
      },
      totalEntries: 1,
      returnedEntries: 1,
    });
  });

  it('filters receipts by writer, result, op, and patch prefix', async () => {
    const materialize = vi.fn().mockResolvedValue({
      state: {},
      receipts: [
        {
          patchSha: 'a'.repeat(40),
          writer: 'alice',
          lamport: 1,
          ops: [
            { op: 'NodeAdd', target: 'n1', result: 'applied' },
            { op: 'PropSet', target: 'n1\0role', result: 'superseded', reason: 'lost LWW' },
          ],
        },
        {
          patchSha: 'b'.repeat(40),
          writer: 'bob',
          lamport: 2,
          ops: [
            { op: 'PropSet', target: 'n1\0role', result: 'applied' },
          ],
        },
      ],
    });

    /** @type {any} */ (openGraph).mockResolvedValue({
      graph: { materialize },
      graphName: 'demo',
      persistence: {},
    });
    /** @type {any} */ (readActiveCursor).mockResolvedValue(null);

    const result = await handleDebug({
      options: /** @type {any} */ ({ repo: '.', graph: 'demo', writer: 'cli' }),
      args: [
        'receipts',
        '--writer-id', 'alice',
        '--patch', 'aaaa',
        '--result', 'superseded',
        '--op', 'PropSet',
      ],
    });

    expect(materialize).toHaveBeenCalledWith({ receipts: true });
    expect(result.payload).toMatchObject({
      graph: 'demo',
      debugTopic: 'receipts',
      totalReceipts: 2,
      matchedReceipts: 1,
      returnedReceipts: 1,
      truncated: false,
      summary: {
        results: { applied: 0, superseded: 1, redundant: 0 },
      },
    });
    expect(/** @type {any} */ (result.payload).receipts[0].ops).toEqual([
      { op: 'PropSet', target: 'n1\0role', result: 'superseded', reason: 'lost LWW' },
    ]);
  });

  it('inspects working-set receipts via materializeWorkingSet', async () => {
    const materializeWorkingSet = vi.fn().mockResolvedValue({
      state: {},
      receipts: [
        {
          patchSha: 'b'.repeat(40),
          writer: 'ws_review',
          lamport: 2,
          ops: [
            { op: 'PropSet', target: 'n1\0status', result: 'applied' },
          ],
        },
      ],
    });
    const getWorkingSet = vi.fn().mockResolvedValue(makeWorkingSetDescriptor());

    /** @type {any} */ (openGraph).mockResolvedValue({
      graph: { getWorkingSet, materializeWorkingSet },
      graphName: 'demo',
      persistence: {},
    });
    /** @type {any} */ (readActiveCursor).mockResolvedValue(null);

    const result = await handleDebug({
      options: /** @type {any} */ ({ repo: '.', graph: 'demo', writer: 'cli' }),
      args: ['receipts', '--working-set', 'ws_review'],
    });

    expect(getWorkingSet).toHaveBeenCalledWith('ws_review');
    expect(materializeWorkingSet).toHaveBeenCalledWith('ws_review', { receipts: true });
    expect(/** @type {any} */ (result.payload).workingSet).toMatchObject({
      workingSetId: 'ws_review',
      overlayWritable: false,
      braid: {
        readOverlayCount: 1,
        braidedWorkingSetIds: ['ws_hold'],
      },
    });
  });
});
