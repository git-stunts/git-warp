// @ts-nocheck

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { openMemoryWarpCore } from '../../helpers/MemoryRuntimeHost.ts';
import type WarpCore from '../../../src/domain/WarpCore.ts';
import {
  exportCoordinateComparisonFact,
  exportCoordinateTransferPlanFact,
} from '../../../src/domain/services/CoordinateFactExport.ts';
import { createStateReader } from '../../../src/domain/services/state/StateReader.ts';
import VersionVector from '../../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import { buildStrandBraidRef, buildStrandOverlayRef } from '../../../src/domain/utils/RefLayout.ts';
import { canonicalStringify } from '../../../src/domain/utils/canonicalStringify.ts';

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
      const oid = hexSha(2000000 + ++treeCounter);
      trees.set(oid, entries);
      return oid;
    }),
    commitNodeWithTree: vi.fn(async ({ treeOid, message, parents }) => {
      const sha = hexSha(3000000 + ++commitCounter);
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
      const sha = hexSha(1000000 + ++commitCounter);
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
async function simulatePatchCommit(
  persistence,
  { graphName, writerId, lamport, ops, reads, writes, context }
) {
  const { encode } = await import('../../../src/infrastructure/codecs/CborCodec.ts');
  const { encodePatchMessage } =
    await import('../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts');
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
    graph = (await openMemoryWarpCore({
      persistence,
      graphName,
      writerId: 'tester',
      autoMaterialize: false,
    })) as WarpCoreRuntime;
  });

  it('compareStrand reports strand-vs-base divergence as substrate facts', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      context: VersionVector.empty(),
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: Dot.create('alice', 1) },
        { type: 'PropSet', node: 'n1', key: 'status', value: 'base' },
      ],
      reads: [],
      writes: ['n1'],
    });

    await graph.createStrand({
      strandId: 'ws_compare_base',
      owner: 'alice',
    });

    const overlaySha = await graph.patchStrand('ws_compare_base', (p) => {
      p.setProperty('n1', 'status', 'overlay');
    });

    const comparison = await graph.compareStrand('ws_compare_base', { targetId: 'n1' });

    expect(comparison.comparisonVersion).toBe('coordinate-compare/v1');
    expect(typeof comparison.comparisonDigest).toBe('string');
    expect(comparison.left.requested).toEqual({
      kind: 'strand',
      strandId: 'ws_compare_base',
    });
    expect(comparison.right.requested).toMatchObject({
      kind: 'strand_base',
      strandId: 'ws_compare_base',
    });
    expect(comparison.visiblePatchDivergence).toEqual({
      sharedCount: 1,
      leftOnlyCount: 1,
      rightOnlyCount: 0,
      leftOnlyPatchShas: [overlaySha],
      rightOnlyPatchShas: [],
      target: {
        targetId: 'n1',
        leftCount: 2,
        rightCount: 1,
        sharedCount: 1,
        leftOnlyCount: 1,
        rightOnlyCount: 0,
        leftOnlyPatchShas: [overlaySha],
        rightOnlyPatchShas: [],
      },
    });
    expect(comparison.visibleState.changed).toBe(true);
    expect(comparison.visibleState.nodeProperties.changed).toEqual([
      { node: 'n1', key: 'status', leftValue: 'overlay', rightValue: 'base' },
    ]);
    expect(comparison.visibleState.target).toMatchObject({
      targetId: 'n1',
      changed: true,
      propertyDelta: {
        added: [],
        removed: [],
        changed: [{ key: 'status', leftValue: 'overlay', rightValue: 'base' }],
      },
    });
  });

  it('compareStrand supports live-frontier comparisons without mutating the strand boundary', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      context: VersionVector.empty(),
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: Dot.create('alice', 1) },
        { type: 'PropSet', node: 'n1', key: 'status', value: 'base' },
      ],
      reads: [],
      writes: ['n1'],
    });

    await graph.createStrand({
      strandId: 'ws_compare_live',
      owner: 'alice',
    });

    const overlaySha = await graph.patchStrand('ws_compare_live', (p) => {
      p.setProperty('n1', 'status', 'overlay');
    });
    const liveSha = await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 2,
      context: new Map([['alice', 1]]),
      ops: [{ type: 'PropSet', node: 'n1', key: 'status', value: 'live' }],
      reads: ['n1'],
      writes: ['n1'],
    });

    const comparison = await graph.compareStrand('ws_compare_live', {
      against: 'live',
      targetId: 'n1',
    });

    expect(comparison.right.requested).toEqual({
      kind: 'live',
    });
    expect(comparison.visiblePatchDivergence.leftOnlyPatchShas).toEqual([overlaySha]);
    expect(comparison.visiblePatchDivergence.rightOnlyPatchShas).toEqual([liveSha]);
    expect(comparison.visiblePatchDivergence.sharedCount).toBe(1);
    expect(comparison.visibleState.nodeProperties.changed).toEqual([
      { node: 'n1', key: 'status', leftValue: 'overlay', rightValue: 'live' },
    ]);
  });

  it('compareStrand supports strand-vs-strand comparisons and compareCoordinates handles explicit coordinates', async () => {
    const redSha = await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      context: VersionVector.empty(),
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: Dot.create('alice', 1) },
        { type: 'PropSet', node: 'n1', key: 'color', value: 'red' },
      ],
      reads: [],
      writes: ['n1'],
    });

    await graph.createStrand({
      strandId: 'ws_left',
      owner: 'alice',
    });
    await graph.createStrand({
      strandId: 'ws_right',
      owner: 'alice',
    });

    const leftOverlaySha = await graph.patchStrand('ws_left', (p) => {
      p.setProperty('n1', 'color', 'blue');
    });
    const rightOverlaySha = await graph.patchStrand('ws_right', (p) => {
      p.setProperty('n1', 'color', 'green');
    });

    const wsComparison = await graph.compareStrand('ws_left', {
      against: { kind: 'strand', strandId: 'ws_right' },
      targetId: 'n1',
    });

    expect(wsComparison.visiblePatchDivergence).toEqual({
      sharedCount: 1,
      leftOnlyCount: 1,
      rightOnlyCount: 1,
      leftOnlyPatchShas: [leftOverlaySha],
      rightOnlyPatchShas: [rightOverlaySha],
      target: {
        targetId: 'n1',
        leftCount: 2,
        rightCount: 2,
        sharedCount: 1,
        leftOnlyCount: 1,
        rightOnlyCount: 1,
        leftOnlyPatchShas: [leftOverlaySha],
        rightOnlyPatchShas: [rightOverlaySha],
      },
    });
    expect(wsComparison.visibleState.nodeProperties.changed).toEqual([
      { node: 'n1', key: 'color', leftValue: 'blue', rightValue: 'green' },
    ]);

    const frontierAtRed = { alice: redSha };
    const blueSha = await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 2,
      context: new Map([['alice', 1]]),
      ops: [{ type: 'PropSet', node: 'n1', key: 'color', value: 'blue' }],
      reads: ['n1'],
      writes: ['n1'],
    });

    const coordinateComparison = await graph.compareCoordinates({
      left: { kind: 'coordinate', frontier: frontierAtRed },
      right: { kind: 'live' },
      targetId: 'n1',
    });

    expect(coordinateComparison.left.requested).toEqual({
      kind: 'coordinate',
      frontier: frontierAtRed,
      ceiling: null,
    });
    expect(coordinateComparison.visiblePatchDivergence.leftOnlyPatchShas).toEqual([]);
    expect(coordinateComparison.visiblePatchDivergence.rightOnlyPatchShas).toEqual([blueSha]);
    expect(coordinateComparison.visibleState.nodeProperties.changed).toEqual([
      { node: 'n1', key: 'color', leftValue: 'red', rightValue: 'blue' },
    ]);

    const graphDiff = await graph.diff({
      from: 1,
      to: 2,
      targetId: 'n1',
    });

    expect(graphDiff.diffVersion).toBe('graph-diff/v1');
    expect(graphDiff.changed).toBe(true);
    expect(graphDiff.left.resolved.lamportCeiling).toBe(1);
    expect(graphDiff.right.resolved.lamportCeiling).toBe(2);
    expect(graphDiff.nodeProperties.changed).toEqual([
      { node: 'n1', key: 'color', leftValue: 'red', rightValue: 'blue' },
    ]);
    expect(graphDiff.visiblePatchDivergence.rightOnlyPatchShas).toEqual([blueSha]);
    expect(Object.isFrozen(graphDiff)).toBe(true);

    const factExport = exportCoordinateComparisonFact(coordinateComparison);
    expect(factExport).toEqual({
      exportVersion: 'coordinate-comparison-fact/v1',
      factKind: 'coordinate-comparison',
      factDigest: coordinateComparison.comparisonDigest,
      canonicalFactJson: expect.any(String),
      fact: {
        comparisonVersion: coordinateComparison.comparisonVersion,
        left: coordinateComparison.left,
        right: coordinateComparison.right,
        visiblePatchDivergence: coordinateComparison.visiblePatchDivergence,
        visibleState: coordinateComparison.visibleState,
      },
    });
    expect(factExport.canonicalFactJson).toBe(canonicalStringify(factExport.fact));
    await expect(graph._crypto.hash('sha256', factExport.canonicalFactJson)).resolves.toBe(
      factExport.factDigest
    );
  });

  it('scopes coordinate comparison and transfer planning by node-id prefix without mutating the raw substrate truth', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      context: VersionVector.empty(),
      ops: [
        { type: 'NodeAdd', node: 'task:1', dot: Dot.create('alice', 1) },
        { type: 'PropSet', node: 'task:1', key: 'status', value: 'ready' },
      ],
      reads: [],
      writes: ['task:1'],
    });

    const operationalFrontier = Object.fromEntries(await graph.getFrontier());

    const governanceSha = await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 2,
      context: new Map([['alice', 1]]),
      ops: [
        { type: 'NodeAdd', node: 'comparison-artifact:cmp-1', dot: Dot.create('alice', 2) },
        {
          type: 'PropSet',
          node: 'comparison-artifact:cmp-1',
          key: 'kind',
          value: 'comparison-artifact',
        },
        {
          type: 'EdgeAdd',
          from: 'task:1',
          to: 'comparison-artifact:cmp-1',
          label: 'governs',
          dot: Dot.create('alice', 3),
        },
      ],
      reads: ['task:1', 'comparison-artifact:cmp-1'],
      writes: ['comparison-artifact:cmp-1', 'task:1\0comparison-artifact:cmp-1\0governs'],
    });

    const rawComparison = await graph.compareCoordinates({
      left: { kind: 'coordinate', frontier: operationalFrontier },
      right: { kind: 'live' },
    });
    expect(rawComparison.visiblePatchDivergence.rightOnlyPatchShas).toEqual([governanceSha]);
    expect(rawComparison.visibleState.changed).toBe(true);

    const scope = {
      nodeIdPrefixes: {
        include: [],
        exclude: ['comparison-artifact:'],
      },
    };

    const scopedComparison = await graph.compareCoordinates({
      left: { kind: 'coordinate', frontier: operationalFrontier },
      right: { kind: 'live' },
      scope,
    });

    expect(scopedComparison.scope).toEqual(scope);
    expect(scopedComparison.visibleState.changed).toBe(false);
    expect(scopedComparison.visiblePatchDivergence.leftOnlyCount).toBe(0);
    expect(scopedComparison.visiblePatchDivergence.rightOnlyCount).toBe(0);
    expect(scopedComparison.left.resolved.patchUniverseDigest).toBe(
      scopedComparison.right.resolved.patchUniverseDigest
    );

    const scopedFactExport = exportCoordinateComparisonFact(scopedComparison);
    expect(scopedFactExport.fact.scope).toEqual(scope);
    expect(scopedFactExport.canonicalFactJson).toBe(canonicalStringify(scopedFactExport.fact));
    await expect(graph._crypto.hash('sha256', scopedFactExport.canonicalFactJson)).resolves.toBe(
      scopedFactExport.factDigest
    );

    const scopedTransfer = await graph.planCoordinateTransfer({
      source: { kind: 'coordinate', frontier: operationalFrontier },
      target: { kind: 'live' },
      scope,
    });

    expect(scopedTransfer.scope).toEqual(scope);
    expect(scopedTransfer.changed).toBe(false);
    expect(scopedTransfer.summary.opCount).toBe(0);
    expect(scopedTransfer.ops).toEqual([]);

    const transferFactExport = exportCoordinateTransferPlanFact(scopedTransfer);
    expect(transferFactExport.fact.scope).toEqual(scope);
  });

  it('planStrandTransfer emits a deterministic transfer plan including property clears and content attachment updates', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      context: VersionVector.empty(),
      ops: [
        { type: 'NodeAdd', node: 'doc:1', dot: Dot.create('alice', 1) },
        { type: 'PropSet', node: 'doc:1', key: 'status', value: 'draft' },
        { type: 'PropSet', node: 'doc:1', key: 'obsolete', value: true },
      ],
      reads: [],
      writes: ['doc:1'],
    });

    await graph.materialize();
    await graph.patch(async (p) => {
      await p.attachContent('doc:1', 'live-body', { mime: 'text/plain', size: 9 });
    });

    await graph.createStrand({
      strandId: 'ws_transfer_live',
      owner: 'alice',
    });

    await graph.patchStrand('ws_transfer_live', async (p) => {
      p.setProperty('doc:1', 'status', 'ready');
      p.setProperty('doc:1', 'obsolete', null);
      await p.attachContent('doc:1', 'worldline-body', { mime: 'text/plain', size: 14 });
    });

    const strandState = await graph.materializeStrand('ws_transfer_live');
    const strandReader = createStateReader(strandState);
    const strandContentMeta = strandReader.getNodeContentMeta('doc:1');
    expect(strandContentMeta).toEqual({
      handle: expect.any(String),
      mime: 'text/plain',
      size: 14,
    });
    persistence._blobs.set(
      /** @type {{ oid: string }} */ strandContentMeta.oid,
      Buffer.from('worldline-body')
    );

    const transferPlan = await graph.planStrandTransfer('ws_transfer_live');

    expect(transferPlan.transferVersion).toBe('coordinate-transfer-plan/v1');
    expect(typeof transferPlan.transferDigest).toBe('string');
    expect(transferPlan.comparisonDigest).toEqual(expect.any(String));
    expect(transferPlan.source.requested).toEqual({
      kind: 'strand',
      strandId: 'ws_transfer_live',
    });
    expect(transferPlan.target.requested).toEqual({
      kind: 'live',
    });
    expect(transferPlan.summary).toMatchObject({
      opCount: 3,
      setNodePropertyCount: 1,
      clearNodePropertyCount: 1,
      attachNodeContentCount: 1,
      clearNodeContentCount: 0,
    });
    expect(transferPlan.ops).toContainEqual({
      op: 'set_node_property',
      nodeId: 'doc:1',
      key: 'status',
      value: 'ready',
    });
    expect(transferPlan.ops).toContainEqual({
      op: 'set_node_property',
      nodeId: 'doc:1',
      key: 'obsolete',
      value: null,
    });
    const attachOp =
      /** @type {import('../../../src/domain/types/CoordinateComparison.ts').VisibleStateTransferOperation & { op: 'attach_node_content', nodeId: string, content: Uint8Array, contentHandle: string, mime?: string|null, size?: number|null }} */ transferPlan.ops.find(
        (op) => op.op === 'attach_node_content' && op.nodeId === 'doc:1'
      );
    expect(attachOp).toMatchObject({
      op: 'attach_node_content',
      nodeId: 'doc:1',
      contentHandle: expect.any(String),
      mime: 'text/plain',
      size: 14,
    });
    expect(Buffer.from(attachOp.content).toString('utf8')).toBe('worldline-body');

    const factExport = exportCoordinateTransferPlanFact(transferPlan);
    expect(factExport).toEqual({
      exportVersion: 'coordinate-transfer-plan-fact/v1',
      factKind: 'coordinate-transfer-plan',
      factDigest: transferPlan.transferDigest,
      canonicalFactJson: expect.any(String),
      fact: expect.objectContaining({
        transferVersion: transferPlan.transferVersion,
        comparisonDigest: transferPlan.comparisonDigest,
        changed: transferPlan.changed,
        source: transferPlan.source,
        target: transferPlan.target,
        summary: transferPlan.summary,
        ops: expect.arrayContaining([
          expect.objectContaining({
            op: 'set_node_property',
            nodeId: 'doc:1',
            key: 'status',
            value: 'ready',
          }),
          expect.objectContaining({
            op: 'set_node_property',
            nodeId: 'doc:1',
            key: 'obsolete',
            value: null,
          }),
          {
            op: 'attach_node_content',
            nodeId: 'doc:1',
            contentHandle: attachOp.contentHandle,
            mime: 'text/plain',
            size: 14,
          },
        ]),
      }),
    });
    expect(factExport.canonicalFactJson).toBe(canonicalStringify(factExport.fact));
    await expect(graph._crypto.hash('sha256', factExport.canonicalFactJson)).resolves.toBe(
      factExport.factDigest
    );
  });
});
