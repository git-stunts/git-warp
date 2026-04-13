/**
 * @fileoverview ProvenanceController — unit tests.
 *
 * Tests patch lookups (patchesFor), slice materialization, backward causal
 * cone computation, patch loading by SHA, and causal sort ordering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProvenanceController from '../../../../../src/domain/services/controllers/ProvenanceController.js';
import QueryError from '../../../../../src/domain/errors/QueryError.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';

// ── Mock WarpMessageCodec ───────────────────────────────────────────────

vi.mock('../../../../../src/domain/services/codec/WarpMessageCodec.ts', () => ({
  detectMessageKind: vi.fn(),
  decodePatchMessage: vi.fn(),
}));

const { detectMessageKind, decodePatchMessage } = await import(
  '../../../../../src/domain/services/codec/WarpMessageCodec.ts'
);

// Cast mocked functions so .mockReturnValue is available
const mockDetectMessageKind = (detectMessageKind);
const mockDecodePatchMessage = (decodePatchMessage);

// ── Mock ProvenancePayload ──────────────────────────────────────────────

const mockReplay = vi.fn();

vi.mock('../../../../../src/domain/services/provenance/ProvenancePayload.js', () => {
  const MockPayload = vi.fn(function (this: any) {
    this.replay = mockReplay;
  });
  return { ProvenancePayload: MockPayload };
});

const { ProvenancePayload } = await import(
  '../../../../../src/domain/services/provenance/ProvenancePayload.js'
);

// ── Mock JoinReducer ────────────────────────────────────────────────────

vi.mock('../../../../../src/domain/services/JoinReducer.ts', () => ({
  createEmptyState: vi.fn(() => ({
    nodeAlive: new Map(),
    edgeAlive: new Map(),
    prop: new Map(),
  })),
  reduceV5: vi.fn(),
}));

const { createEmptyState, reduceV5 } = await import(
  '../../../../../src/domain/services/JoinReducer.ts'
);

// Cast mocked functions so .mockReturnValue is available
const mockCreateEmptyState = (createEmptyState);
const mockReduceV5 = (reduceV5);

// ── Host factory ────────────────────────────────────────────────────────

/**
 * Creates a mock host with sensible defaults.
 * @param {Record<string, unknown>} [overrides]
 * @returns {any}
 */
function createHost(overrides = {}) {
  return {
    _ensureFreshState: vi.fn(async () => undefined),
    _provenanceDegraded: false,
    _provenanceIndex: {
      patchesFor: vi.fn(() => []),
    },
    _clock: { now: () => 0 },
    _persistence: {
      getNodeInfo: vi.fn(async () => ({ message: 'patch-message' })),
    },
    _readPatchBlob: vi.fn(async () => new Uint8Array([1, 2, 3])),
    _codec: { decode: vi.fn(() => ({ ops: [], writer: 'w1', lamport: 1 })) },
    _logTiming: vi.fn(),
    ...overrides,
  };
}

/**
 * @param {{ writer?: string; lamport?: number; ops?: any[]; reads?: string[] }} [opts]
 * @returns {any}
 */
function makePatch({ writer = 'w1', lamport = 1, ops = [], reads }: { writer?: string; lamport?: number; ops?: any[]; reads?: string[] } = {}) {
    const patch = ({ writer, lamport, ops }) as Record<string, unknown>;
  if (reads !== undefined) {
    patch['reads'] = reads;
  }
  return patch;
}

// ============================================================================
// patchesFor
// ============================================================================

describe('ProvenanceController — patchesFor', () => {
    let ctrl;
    let host;

  beforeEach(() => {
    vi.clearAllMocks();
    host = createHost();
    ctrl = new ProvenanceController(host);
  });

  it('calls _ensureFreshState before accessing provenance', async () => {
    host._provenanceIndex.patchesFor.mockReturnValue(['sha1']);

    await ctrl.patchesFor('node:a');

    expect(host._ensureFreshState).toHaveBeenCalledOnce();
  });

  it('returns patch SHAs from the provenance index', async () => {
    host._provenanceIndex.patchesFor.mockReturnValue(['sha1', 'sha2']);

    const result = await ctrl.patchesFor('node:a');

    expect(result).toEqual(['sha1', 'sha2']);
    expect(host._provenanceIndex.patchesFor).toHaveBeenCalledWith('node:a');
  });

  it('throws E_PROVENANCE_DEGRADED when provenance is degraded', async () => {
    host._provenanceDegraded = true;

    await expect(ctrl.patchesFor('node:a')).rejects.toThrow(QueryError);
    await expect(ctrl.patchesFor('node:a')).rejects.toMatchObject({
      code: 'E_PROVENANCE_DEGRADED',
    });
  });

  it('throws E_NO_STATE when provenance index is null', async () => {
    host._provenanceIndex = null;

    await expect(ctrl.patchesFor('node:a')).rejects.toThrow(QueryError);
    await expect(ctrl.patchesFor('node:a')).rejects.toMatchObject({
      code: 'E_NO_STATE',
    });
  });
});

// ============================================================================
// materializeSlice
// ============================================================================

describe('ProvenanceController — materializeSlice', () => {
    let ctrl;
    let host;

  beforeEach(() => {
    vi.clearAllMocks();
    host = createHost();
    ctrl = new ProvenanceController(host);

    // Default: detectMessageKind returns 'patch', decodePatchMessage returns metadata
    (mockDetectMessageKind as any).mockReturnValue('patch');
    (mockDecodePatchMessage as any).mockReturnValue({
      kind: 'patch',
      graph: 'g',
      writer: 'w1',
      lamport: 1,
      patchOid: 'abc',
      schema: 2,
      encrypted: false,
    });
  });

  it('returns empty state when backward cone is empty', async () => {
    host._provenanceIndex.patchesFor.mockReturnValue([]);

    const result = await ctrl.materializeSlice('node:x');

    expect(result.patchCount).toBe(0);
    expect(mockCreateEmptyState).toHaveBeenCalledOnce();
    expect(host._logTiming).toHaveBeenCalledWith(
      'materializeSlice',
      expect.any(Number),
      expect.objectContaining({ metrics: '0 patches (empty cone)' }),
    );
  });

  it('replays patches via ProvenancePayload by default', async () => {
    const patch = makePatch({ writer: 'w1', lamport: 1 });
    host._provenanceIndex.patchesFor.mockReturnValue(['sha1']);
    host._codec.decode.mockReturnValue(patch);

    const fakeState = { nodeAlive: new Map([['n1', true]]) };
    mockReplay.mockReturnValue(fakeState);

    const result = await ctrl.materializeSlice('node:x');

    expect(result.state).toBe(fakeState);
    expect(result.patchCount).toBe(1);
    expect(result).not.toHaveProperty('receipts');
    expect(ProvenancePayload).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          sha: 'sha1',
          patch: expect.objectContaining({ writer: patch['writer'], lamport: (patch as any).lamport }),
        }),
      ]),
    );
  });

  it('uses reduceV5 with receipts when options.receipts is true', async () => {
    const patch = makePatch({ writer: 'w1', lamport: 1 });
    host._provenanceIndex.patchesFor.mockReturnValue(['sha1']);
    host._codec.decode.mockReturnValue(patch);

    const fakeState = { nodeAlive: new Map() };
    const fakeReceipts = [{ type: 'tick' }];
    (mockReduceV5 as any).mockReturnValue({ state: fakeState, receipts: fakeReceipts });

    const result = await ctrl.materializeSlice('node:x', { receipts: true });

    expect(result.state).toBe(fakeState);
    expect(result.patchCount).toBe(1);
    expect(result.receipts).toBe(fakeReceipts);
    expect(mockReduceV5).toHaveBeenCalledWith(
      expect.any(Array),
      undefined,
      { receipts: true },
    );
  });

  it('throws E_PROVENANCE_DEGRADED when provenance is degraded', async () => {
    host._provenanceDegraded = true;

    await expect(ctrl.materializeSlice('node:x')).rejects.toThrow(QueryError);
    await expect(ctrl.materializeSlice('node:x')).rejects.toMatchObject({
      code: 'E_PROVENANCE_DEGRADED',
    });
  });

  it('throws E_NO_STATE when provenance index is null', async () => {
    host._provenanceIndex = null;

    await expect(ctrl.materializeSlice('node:x')).rejects.toThrow(QueryError);
    await expect(ctrl.materializeSlice('node:x')).rejects.toMatchObject({
      code: 'E_NO_STATE',
    });
  });

  it('logs timing on error', async () => {
    host._provenanceDegraded = true;

    await expect(ctrl.materializeSlice('node:x')).rejects.toThrow();

    expect(host._logTiming).toHaveBeenCalledWith(
      'materializeSlice',
      expect.any(Number),
      expect.objectContaining({ error: expect.any(QueryError) }),
    );
  });
});

// ============================================================================
// _computeBackwardCone
// ============================================================================

describe('ProvenanceController — _computeBackwardCone', () => {
    let ctrl;
    let host;

  beforeEach(() => {
    vi.clearAllMocks();
    host = createHost();
    ctrl = new ProvenanceController(host);

    (mockDetectMessageKind as any).mockReturnValue('patch');
    (mockDecodePatchMessage as any).mockReturnValue({
      kind: 'patch',
      graph: 'g',
      writer: 'w1',
      lamport: 1,
      patchOid: 'abc',
      schema: 2,
      encrypted: false,
    });
  });

  it('returns empty map when entity has no patches', async () => {
    host._provenanceIndex.patchesFor.mockReturnValue([]);

    const cone = await ctrl._computeBackwardCone('node:x');

    expect(cone.size).toBe(0);
  });

  it('collects patches for a single entity without reads', async () => {
    const patch = makePatch({ writer: 'w1', lamport: 1 });
    host._provenanceIndex.patchesFor.mockReturnValue(['sha1']);
    host._codec.decode.mockReturnValue(patch);

    const cone = await ctrl._computeBackwardCone('node:x');

    expect(cone.size).toBe(1);
    expect(cone.get('sha1')).toEqual(expect.objectContaining({ writer: patch['writer'], lamport: (patch as any).lamport }));
  });

  it('follows reads transitively via BFS', async () => {
    const patchA = makePatch({ writer: 'w1', lamport: 1, reads: ['node:b'] });
    const patchB = makePatch({ writer: 'w2', lamport: 2 });

    host._provenanceIndex.patchesFor
      .mockReturnValueOnce(['sha-a'])   // node:x
      .mockReturnValueOnce(['sha-b']);  // node:b

    host._codec.decode
      .mockReturnValueOnce(patchA)
      .mockReturnValueOnce(patchB);

    const cone = await ctrl._computeBackwardCone('node:x');

    expect(cone.size).toBe(2);
    expect(cone.has('sha-a')).toBe(true);
    expect(cone.has('sha-b')).toBe(true);
  });

  it('deduplicates visited entities to avoid cycles', async () => {
    // node:x reads node:y, node:y reads node:x — cycle
    const patchX = makePatch({ writer: 'w1', lamport: 1, reads: ['node:y'] });
    const patchY = makePatch({ writer: 'w2', lamport: 2, reads: ['node:x'] });

    host._provenanceIndex.patchesFor
      .mockReturnValueOnce(['sha-x'])   // node:x
      .mockReturnValueOnce(['sha-y']);  // node:y

    host._codec.decode
      .mockReturnValueOnce(patchX)
      .mockReturnValueOnce(patchY);

    const cone = await ctrl._computeBackwardCone('node:x');

    // Should visit each entity only once despite cycle
    expect(cone.size).toBe(2);
    expect(host._provenanceIndex.patchesFor).toHaveBeenCalledTimes(2);
  });

  it('skips duplicate queued entities once one copy is already visited', async () => {
    const patchX = makePatch({ writer: 'w1', lamport: 1, reads: ['node:y', 'node:y'] });
    const patchY = makePatch({ writer: 'w2', lamport: 2 });

    host._provenanceIndex.patchesFor
      .mockReturnValueOnce(['sha-x'])
      .mockReturnValueOnce(['sha-y']);

    host._codec.decode
      .mockReturnValueOnce(patchX)
      .mockReturnValueOnce(patchY);

    const cone = await ctrl._computeBackwardCone('node:x');

    expect(cone.size).toBe(2);
    expect(host._provenanceIndex.patchesFor).toHaveBeenCalledTimes(2);
  });

  it('deduplicates patches shared across entities', async () => {
    // Both node:x and node:y reference the same patch sha
    const sharedPatch = makePatch({ writer: 'w1', lamport: 1, reads: ['node:y'] });

    host._provenanceIndex.patchesFor
      .mockReturnValueOnce(['shared-sha'])   // node:x
      .mockReturnValueOnce(['shared-sha']);  // node:y

    host._codec.decode.mockReturnValue(sharedPatch);

    const cone = await ctrl._computeBackwardCone('node:x');

    // shared-sha loaded only once
    expect(cone.size).toBe(1);
    expect(host._persistence.getNodeInfo).toHaveBeenCalledTimes(1);
  });

  it('throws E_NO_STATE when provenance index is null', async () => {
    host._provenanceIndex = null;

    await expect(ctrl._computeBackwardCone('node:x')).rejects.toThrow(QueryError);
    await expect(ctrl._computeBackwardCone('node:x')).rejects.toMatchObject({
      code: 'E_NO_STATE',
    });
  });
});

// ============================================================================
// loadPatchBySha
// ============================================================================

describe('ProvenanceController — loadPatchBySha', () => {
    let ctrl;
    let host;

  beforeEach(() => {
    vi.clearAllMocks();
    host = createHost();
    ctrl = new ProvenanceController(host);
  });

  it('loads and decodes a patch commit', async () => {
    const patch = {
      writer: 'w1',
      lamport: 5,
      context: { w1: 0 },
      ops: [{ type: 'NodeAdd', id: 'n1', dot: ['w1', 1] }],
    };

    (mockDetectMessageKind as any).mockReturnValue('patch');
    (mockDecodePatchMessage as any).mockReturnValue({
      kind: 'patch',
      graph: 'g',
      writer: 'w1',
      lamport: 5,
      patchOid: 'blob-oid',
      schema: 2,
      encrypted: false,
    });
    host._codec.decode.mockReturnValue(patch);

    const result = await ctrl.loadPatchBySha('abc123');

    expect(result).toBeInstanceOf(Patch);
    expect(result.ops[0]).toBeInstanceOf(NodeAdd);
    const firstOp = (result.ops[0] as NodeAdd);
    expect(firstOp?.dot).toBeInstanceOf(Dot);
    expect(firstOp?.node).toBe('n1');
    expect(host._persistence.getNodeInfo).toHaveBeenCalledWith('abc123');
    expect(mockDetectMessageKind).toHaveBeenCalledWith('patch-message');
    expect(mockDecodePatchMessage).toHaveBeenCalledWith('patch-message');
    expect(host._readPatchBlob).toHaveBeenCalledWith(
      expect.objectContaining({ patchOid: 'blob-oid' }),
    );
    expect(host._codec.decode).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
  });

  it('throws when commit is not a patch', async () => {
    (mockDetectMessageKind as any).mockReturnValue('checkpoint');

    await expect(ctrl.loadPatchBySha('abc123')).rejects.toThrow(
      /Commit abc123 is not a patch/,
    );
  });

  it('throws when commit kind is null', async () => {
    (mockDetectMessageKind as any).mockReturnValue(null);

    await expect(ctrl.loadPatchBySha('abc123')).rejects.toThrow(
      /Commit abc123 is not a patch/,
    );
  });

  it('_loadPatchesBySha preserves input order', async () => {
    const patchA = makePatch({ writer: 'w1', lamport: 1 });
    const patchB = makePatch({ writer: 'w2', lamport: 2 });
    const loadPatchBySha = vi.spyOn(ctrl, '_loadPatchBySha')
      .mockResolvedValueOnce((patchA))
      .mockResolvedValueOnce((patchB));

    const entries = await ctrl._loadPatchesBySha(['sha-a', 'sha-b']);

    expect(entries).toEqual([
      { patch: patchA, sha: 'sha-a' },
      { patch: patchB, sha: 'sha-b' },
    ]);
    expect(loadPatchBySha).toHaveBeenNthCalledWith(1, 'sha-a');
    expect(loadPatchBySha).toHaveBeenNthCalledWith(2, 'sha-b');
  });
});

// ============================================================================
// _sortPatchesCausally
// ============================================================================

describe('ProvenanceController — _sortPatchesCausally', () => {
    let ctrl;

  beforeEach(() => {
    vi.clearAllMocks();
    ctrl = new ProvenanceController(createHost() as any);
  });

  it('sorts by lamport timestamp ascending', () => {
    const entries = [
      { patch: makePatch({ lamport: 3, writer: 'w1' }), sha: 'aaa' },
      { patch: makePatch({ lamport: 1, writer: 'w1' }), sha: 'bbb' },
      { patch: makePatch({ lamport: 2, writer: 'w1' }), sha: 'ccc' },
    ];

    const sorted = ctrl._sortPatchesCausally((entries));

    expect(sorted.map((e) => (e as any).patch.lamport)).toEqual([1, 2, 3]);
  });

  it('breaks lamport ties by writer ID', () => {
    const entries = [
      { patch: makePatch({ lamport: 1, writer: 'charlie' }), sha: 'aaa' },
      { patch: makePatch({ lamport: 1, writer: 'alice' }), sha: 'bbb' },
      { patch: makePatch({ lamport: 1, writer: 'bob' }), sha: 'ccc' },
    ];

    const sorted = ctrl._sortPatchesCausally((entries));

    expect(sorted.map((e) => e.patch.writer)).toEqual(['alice', 'bob', 'charlie']);
  });

  it('breaks writer ties by SHA', () => {
    const entries = [
      { patch: makePatch({ lamport: 1, writer: 'w1' }), sha: 'ccc' },
      { patch: makePatch({ lamport: 1, writer: 'w1' }), sha: 'aaa' },
      { patch: makePatch({ lamport: 1, writer: 'w1' }), sha: 'bbb' },
    ];

    const sorted = ctrl._sortPatchesCausally((entries));

    expect(sorted.map((e) => e.sha)).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('does not mutate the input array', () => {
    const entries = [
      { patch: makePatch({ lamport: 2, writer: 'w1' }), sha: 'aaa' },
      { patch: makePatch({ lamport: 1, writer: 'w1' }), sha: 'bbb' },
    ];

    const sorted = ctrl._sortPatchesCausally((entries));

    expect(sorted).not.toBe(entries);
    expect(entries[0]?.patch['lamport']).toBe(2);
  });

  it('handles missing lamport/writer gracefully (defaults to 0/empty)', () => {
    const entries = [
      { patch: { ops: [] }, sha: 'bbb' },
      { patch: { ops: [], lamport: 1 }, sha: 'aaa' },
    ];

    const sorted = ctrl._sortPatchesCausally((entries));

    expect(sorted[0]?.sha).toBe('bbb'); // lamport 0 < 1
    expect(sorted[1]?.sha).toBe('aaa');
  });
});
