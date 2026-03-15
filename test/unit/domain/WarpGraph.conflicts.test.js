import { beforeEach, describe, expect, it, vi } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { createVersionVector } from '../../../src/domain/crdt/VersionVector.js';
import { createDot } from '../../../src/domain/crdt/Dot.js';

/**
 * @param {number} counter
 * @returns {string}
 */
function hexSha(counter) {
  return String(counter).padStart(40, '0');
}

/**
 * @returns {any}
 */
function createMockPersistence() {
  const refs = new Map();
  const blobs = new Map();
  const commits = new Map();
  let blobCounter = 0;
  let commitCounter = 0;

  return {
    _refs: refs,
    _blobs: blobs,
    _commits: commits,
    readRef: vi.fn(async (ref) => refs.get(ref) || null),
    listRefs: vi.fn(async (prefix) => {
      const result = [];
      for (const key of refs.keys()) {
        if (key.startsWith(prefix)) {
          result.push(key);
        }
      }
      return result;
    }),
    updateRef: vi.fn(async (ref, sha) => {
      refs.set(ref, sha);
    }),
    configGet: vi.fn(async () => null),
    configSet: vi.fn(async () => {}),
    showNode: vi.fn(async (sha) => {
      const commit = commits.get(sha);
      return commit ? commit.message : '';
    }),
    getNodeInfo: vi.fn(async (sha) => {
      const commit = commits.get(sha);
      return commit || { message: '', parents: [] };
    }),
    readBlob: vi.fn(async (oid) => blobs.get(oid)),
    writeBlob: vi.fn(async (buf) => {
      const oid = hexSha(++blobCounter);
      blobs.set(oid, buf);
      return oid;
    }),
    commitNode: vi.fn(async ({ message, parents }) => {
      const sha = hexSha(1000000 + (++commitCounter));
      commits.set(sha, { message, parents: parents || [] });
      return sha;
    }),
  };
}

/**
 * @param {any} persistence
 * @param {{
 *   graphName: string,
 *   writerId: string,
 *   lamport: number,
 *   ops: Array<Record<string, unknown>>,
 *   context?: Map<string, number>|Record<string, number>|null
 * }} options
 * @returns {Promise<string>}
 */
async function simulatePatchCommit(persistence, {
  graphName,
  writerId,
  lamport,
  ops,
  context,
}) {
  const { encode } = await import('../../../src/infrastructure/codecs/CborCodec.js');
  const { encodePatchMessage } = await import('../../../src/domain/services/WarpMessageCodec.js');
  const { buildWriterRef } = await import('../../../src/domain/utils/RefLayout.js');

  const patch = {
    schema: 2,
    writer: writerId,
    lamport,
    ops,
    context: context || createVersionVector(),
  };

  const patchBuffer = encode(patch);
  const patchOid = await persistence.writeBlob(patchBuffer);

  const writerRef = buildWriterRef(graphName, writerId);
  const parentSha = await persistence.readRef(writerRef);
  const parents = parentSha ? [parentSha] : [];
  const message = encodePatchMessage({ graph: graphName, writer: writerId, patchOid, lamport });
  const sha = await persistence.commitNode({ message, parents });
  await persistence.updateRef(writerRef, sha);
  return sha;
}

describe('WarpGraph.analyzeConflicts()', () => {
  /** @type {any} */
  let persistence;
  /** @type {WarpGraph} */
  let graph;
  const graphName = 'conflicts';

  beforeEach(async () => {
    persistence = createMockPersistence();
    graph = await WarpGraph.open({
      persistence,
      graphName,
      writerId: 'tester',
      autoMaterialize: false,
    });
  });

  it('returns deterministic supersession traces for competing property writes', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 10,
      ops: [{ type: 'PropSet', node: 'n1', key: 'color', value: 'red' }],
    });
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'bob',
      lamport: 1,
      ops: [{ type: 'PropSet', node: 'n1', key: 'color', value: 'blue' }],
    });

    const first = await graph.analyzeConflicts({ kind: 'supersession', evidence: 'full' });
    const second = await graph.analyzeConflicts({ kind: 'supersession', evidence: 'summary' });

    expect(first.analysisVersion).toBe('conflict-analyzer/v1');
    expect(first.analysisSnapshotHash).toBe(second.analysisSnapshotHash);
    expect(first.conflicts).toHaveLength(1);

    const trace = first.conflicts[0];
    expect(trace.kind).toBe('supersession');
    expect(trace.target).toMatchObject({
      targetKind: 'node_property',
      entityId: 'n1',
      propertyKey: 'color',
    });
    expect(trace.winner.anchor.writerId).toBe('alice');
    expect(trace.losers).toHaveLength(1);
    expect(trace.losers[0].anchor.writerId).toBe('bob');
    expect(trace.resolution.basis.code).toBe('receipt_superseded');
    expect(trace.resolution.winnerMode).toBe('immediate');
    expect(trace.classificationNotes).toContain('receipt_superseded');
  });

  it('treats same-writer sequential property edits as normal evolution, not eventual override', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [{ type: 'PropSet', node: 'n1', key: 'color', value: 'red' }],
    });
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 2,
      ops: [{ type: 'PropSet', node: 'n1', key: 'color', value: 'blue' }],
    });

    const analysis = await graph.analyzeConflicts({ kind: 'eventual_override' });
    expect(analysis.conflicts).toHaveLength(0);
  });

  it('classifies replay-equivalent redundant writes with loser-level detail', async () => {
    const dot = createDot('alice', 1);
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [{ type: 'NodeAdd', node: 'n1', dot }],
    });
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 2,
      ops: [{ type: 'NodeAdd', node: 'n1', dot }],
    });

    const analysis = await graph.analyzeConflicts({ kind: 'redundancy', evidence: 'full' });
    expect(analysis.conflicts).toHaveLength(1);

    const trace = analysis.conflicts[0];
    expect(trace.target).toMatchObject({
      targetKind: 'node',
      entityId: 'n1',
    });
    expect(trace.winner.anchor.lamport).toBe(1);
    expect(trace.losers[0].anchor.lamport).toBe(2);
    expect(trace.losers[0].structurallyDistinctAlternative).toBe(false);
    expect(trace.losers[0].causalRelationToWinner).toBe('replay_equivalent');
    expect(trace.losers[0].notes).toContain('receipt_redundant');
  });

  it('applies writerId as a return-set filter without changing conflict identity', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 10,
      ops: [{ type: 'PropSet', node: 'n1', key: 'color', value: 'red' }],
    });
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'bob',
      lamport: 1,
      ops: [{ type: 'PropSet', node: 'n1', key: 'color', value: 'blue' }],
    });

    const full = await graph.analyzeConflicts({ kind: 'supersession' });
    const filtered = await graph.analyzeConflicts({ kind: 'supersession', writerId: 'bob' });

    expect(full.conflicts).toHaveLength(1);
    expect(filtered.conflicts).toHaveLength(1);
    expect(filtered.conflicts[0].conflictId).toBe(full.conflicts[0].conflictId);
  });

  it('reports deterministic truncation diagnostics using reverse causal traversal order', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 10,
      ops: [{ type: 'PropSet', node: 'n1', key: 'color', value: 'red' }],
    });
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'bob',
      lamport: 1,
      ops: [{ type: 'PropSet', node: 'n1', key: 'color', value: 'blue' }],
    });
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'charlie',
      lamport: 20,
      ops: [{ type: 'NodeAdd', node: 'n2', dot: createDot('charlie', 20) }],
    });

    const analysis = await graph.analyzeConflicts({ scanBudget: { maxPatches: 1 } });
    expect(analysis.diagnostics?.[0]).toMatchObject({
      code: 'budget_truncated',
      data: {
        traversalOrder: 'lamport_desc_writer_desc_patch_desc',
        scannedPatchCount: 1,
        lastScannedAnchor: {
          writerId: 'charlie',
          lamport: 20,
          opIndex: 0,
        },
      },
    });
  });

  it('validates lamport ceiling at runtime', async () => {
    await expect(graph.analyzeConflicts({
      at: { lamportCeiling: -1 },
    })).rejects.toMatchObject({
      code: 'invalid_coordinate',
    });
  });

  it('does not write refs, blobs, or commits during analysis', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [{ type: 'PropSet', node: 'n1', key: 'color', value: 'red' }],
    });

    persistence.updateRef.mockClear();
    persistence.writeBlob.mockClear();
    persistence.commitNode.mockClear();

    await graph.analyzeConflicts();

    expect(persistence.updateRef).not.toHaveBeenCalled();
    expect(persistence.writeBlob).not.toHaveBeenCalled();
    expect(persistence.commitNode).not.toHaveBeenCalled();
  });
});
