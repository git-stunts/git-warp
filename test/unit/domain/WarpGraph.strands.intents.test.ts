// @ts-nocheck

import { beforeEach, describe, expect, it, vi } from 'vitest';

import WarpCore from '../../../src/domain/WarpCore.ts';
import {
  exportCoordinateComparisonFact,
  exportCoordinateTransferPlanFact,
} from '../../../src/domain/services/CoordinateFactExport.ts';
import { createStateReader } from '../../../src/domain/services/state/StateReader.ts';
import VersionVector from '../../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import { buildStrandBraidRef, buildStrandOverlayRef } from '../../../src/domain/utils/RefLayout.ts';

type WarpCoreRuntime = Awaited<ReturnType<typeof WarpCore.open>>;

/**
 * @param {number} counter
 * @returns {string}
 */
function hexSha(counter) {
  return String(counter).padStart(40, '0');
}

/**
 * @returns {object}
 */
function createMockPersistence() {
  const refs = new Map();
  const blobs = new Map();
  const commits = new Map();
  const trees = new Map();
  let blobCounter = 0;
  let commitCounter = 0;
  let treeCounter = 0;

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
    compareAndSwapRef: vi.fn(async (ref, newOid, expectedOid) => {
      const actualOid = refs.get(ref) || null;
      if (actualOid !== expectedOid) {
        throw new Error(`CAS mismatch for ${ref}`);
      }
      refs.set(ref, newOid);
    }),
    deleteRef: vi.fn(async (ref) => {
      refs.delete(ref);
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
    writeTree: vi.fn(async (entries) => {
      const oid = hexSha(2000000 + (++treeCounter));
      trees.set(oid, entries);
      return oid;
    }),
    commitNodeWithTree: vi.fn(async ({ treeOid, message, parents }) => {
      const sha = hexSha(3000000 + (++commitCounter));
      commits.set(sha, { treeOid, message, parents: parents || [] });
      return sha;
    }),
    readBlob: vi.fn(async (oid) => blobs.get(oid) || null),
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
    nodeExists: vi.fn(async (sha) => commits.has(sha)),
    readTreeOids: vi.fn(),
  };
}

/**
 * @param {object} persistence
 * @param {{
 *   graphName: string,
 *   writerId: string,
 *   lamport: number,
 *   ops: Array<object>,
 *   reads?: string[],
 *   writes?: string[],
 *   context?: Map<string, number>|Record<string, number>|null
 * }} options
 * @returns {Promise<string>}
 */
async function simulatePatchCommit(persistence, {
  graphName,
  writerId,
  lamport,
  ops,
  reads,
  writes,
  context,
}) {
  const { encode } = await import('../../../src/infrastructure/codecs/CborCodec.ts');
  const { encodePatchMessage } = await import('../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts');
  const { buildWriterRef } = await import('../../../src/domain/utils/RefLayout.ts');

  const patch = {
    schema: 2,
    writer: writerId,
    lamport,
    ops,
    ...(reads ? { reads } : {}),
    ...(writes ? { writes } : {}),
    context: context || VersionVector.empty(),
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

describe('WarpCore strand foundation', () => {
    let persistence;
    let graph;
  const graphName = 'strands-demo';

  beforeEach(async () => {
    persistence = createMockPersistence();
    graph = ((await WarpCore.open({
      persistence,
      graphName,
      writerId: 'tester',
      autoMaterialize: false,
    })) as WarpCoreRuntime);
  });

  it('planStrandTransfer includes braided support visibility in the candidate transfer plan', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      context: VersionVector.empty(),
      ops: [
        { type: 'NodeAdd', node: 'task:1', dot: Dot.create('alice', 1) },
        { type: 'PropSet', node: 'task:1', key: 'status', value: 'base' },
      ],
      reads: [],
      writes: ['task:1'],
    });

    await graph.createStrand({ strandId: 'ws_target', owner: 'alice' });
    await graph.createStrand({ strandId: 'ws_support', owner: 'alice' });

    await graph.patchStrand('ws_target', (p) => {
      p.setProperty('task:1', 'status', 'target');
    });
    await graph.patchStrand('ws_support', (p) => {
      p.addNode('task:2');
      p.setProperty('task:2', 'kind', 'support');
    });

    await graph.braidStrand('ws_target', {
      braidedStrandIds: ['ws_support'],
      writable: false,
    });

    const transferPlan = await graph.planStrandTransfer('ws_target');

    expect(transferPlan.source.resolved.strand?.braid.braidedStrandIds).toEqual(['ws_support']);
    expect(transferPlan.ops).toContainEqual({
      op: 'set_node_property',
      nodeId: 'task:1',
      key: 'status',
      value: 'target',
    });
    expect(transferPlan.ops).toContainEqual({
      op: 'add_node',
      nodeId: 'task:2',
    });
    expect(transferPlan.ops).toContainEqual({
      op: 'set_node_property',
      nodeId: 'task:2',
      key: 'kind',
      value: 'support',
    });
  });

  it('planStrandTransfer represents content removals as explicit clear operations', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      context: VersionVector.empty(),
      ops: [
        { type: 'NodeAdd', node: 'doc:clear', dot: Dot.create('alice', 1) },
      ],
      reads: [],
      writes: ['doc:clear'],
    });

    await graph.materialize();
    await graph.patch(async (p) => {
      await p.attachContent('doc:clear', 'live-only', { mime: 'text/plain', size: 9 });
    });

    await graph.createStrand({
      strandId: 'ws_clear_content',
      owner: 'alice',
    });

    await graph.patchStrand('ws_clear_content', (p) => {
      p.clearContent('doc:clear');
    });

    const transferPlan = await graph.planStrandTransfer('ws_clear_content');

    expect(transferPlan.summary).toMatchObject({
      opCount: 1,
      clearNodeContentCount: 1,
    });
    expect(transferPlan.ops).toEqual([
      {
        op: 'clear_node_content',
        nodeId: 'doc:clear',
      },
    ]);
  });

  it('queues strand intents without mutating visible state or live truth', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      context: VersionVector.empty(),
      ops: [
        { type: 'NodeAdd', node: 'task:queued', dot: Dot.create('alice', 1) },
        { type: 'PropSet', node: 'task:queued', key: 'status', value: 'base' },
      ],
      reads: [],
      writes: ['task:queued'],
    });

    await graph.createStrand({ strandId: 'ws_queue', owner: 'alice' });

    const queued = await graph.queueStrandIntent('ws_queue', (p) => {
      p.setProperty('task:queued', 'status', 'queued');
    });

    expect(queued.intentId).toBe('ws_queue.intent.0001');
    expect(queued.patch.writes).toEqual(['task:queued']);

    const intents = await graph.listStrandIntents('ws_queue');
    expect(intents.map((intent) => intent.intentId)).toEqual(['ws_queue.intent.0001']);

    const strandState = await graph.materializeStrand('ws_queue');
    const strandReader = createStateReader(strandState);
    expect(strandReader.getNodeProps('task:queued')).toMatchObject({ status: 'base' });

    const liveState = await graph.materialize();
    const liveReader = createStateReader(liveState);
    expect(liveReader.getNodeProps('task:queued')).toMatchObject({ status: 'base' });
  });

  it('ticks strands deterministically and admits independent intents together', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      context: VersionVector.empty(),
      ops: [
        { type: 'NodeAdd', node: 'task:red', dot: Dot.create('alice', 1) },
        { type: 'NodeAdd', node: 'task:blue', dot: Dot.create('alice', 2) },
      ],
      reads: [],
      writes: ['task:red', 'task:blue'],
    });

    await graph.createStrand({ strandId: 'ws_tick', owner: 'alice' });

    await graph.queueStrandIntent('ws_tick', (p) => {
      p.setProperty('task:red', 'status', 'ready');
    });
    await graph.queueStrandIntent('ws_tick', (p) => {
      p.setProperty('task:blue', 'status', 'review');
    });

    const result = await graph.tickStrand('ws_tick');

    expect(result.admittedIntentIds).toEqual([
      'ws_tick.intent.0001',
      'ws_tick.intent.0002',
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.overlayPatchShas).toHaveLength(2);

    const strandState = await graph.materializeStrand('ws_tick');
    const strandReader = createStateReader(strandState);
    expect(strandReader.getNodeProps('task:red')).toMatchObject({ status: 'ready' });
    expect(strandReader.getNodeProps('task:blue')).toMatchObject({ status: 'review' });

    const descriptor = await graph.getStrand('ws_tick');
    expect(descriptor?.overlay.patchCount).toBe(2);
    expect(descriptor?.intentQueue?.intents ?? []).toHaveLength(0);
    expect(descriptor?.evolution?.tickCount).toBe(1);
  });

  it('records overlapping queued intents as counterfactuals and leaves sibling lanes untouched', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      context: VersionVector.empty(),
      ops: [
        { type: 'NodeAdd', node: 'task:conflict', dot: Dot.create('alice', 1) },
        { type: 'PropSet', node: 'task:conflict', key: 'status', value: 'base' },
      ],
      reads: [],
      writes: ['task:conflict'],
    });

    await graph.createStrand({ strandId: 'ws_primary', owner: 'alice' });
    await graph.createStrand({ strandId: 'ws_sibling', owner: 'alice' });

    await graph.queueStrandIntent('ws_primary', (p) => {
      p.setProperty('task:conflict', 'status', 'approved');
    });
    await graph.queueStrandIntent('ws_primary', (p) => {
      p.setProperty('task:conflict', 'priority', 'urgent');
    });

    const result = await graph.tickStrand('ws_primary');

    expect(result.admittedIntentIds).toEqual(['ws_primary.intent.0001']);
    expect(result.rejected).toEqual([
      {
        intentId: 'ws_primary.intent.0002',
        reason: 'footprint_overlap',
        conflictsWith: ['ws_primary.intent.0001'],
        reads: ['task:conflict'],
        writes: ['task:conflict'],
      },
    ]);

    const primaryState = await graph.materializeStrand('ws_primary');
    const primaryReader = createStateReader(primaryState);
    expect(primaryReader.getNodeProps('task:conflict')).toMatchObject({ status: 'approved' });
    expect(primaryReader.getNodeProps('task:conflict')).not.toHaveProperty('priority');

    const siblingState = await graph.materializeStrand('ws_sibling');
    const siblingReader = createStateReader(siblingState);
    expect(siblingReader.getNodeProps('task:conflict')).toMatchObject({ status: 'base' });

    const liveState = await graph.materialize();
    const liveReader = createStateReader(liveState);
    expect(liveReader.getNodeProps('task:conflict')).toMatchObject({ status: 'base' });
    expect(liveReader.getNodeProps('task:conflict')).not.toHaveProperty('priority');
  });
});
