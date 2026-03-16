import { beforeEach, describe, expect, it, vi } from 'vitest';

import WarpGraph from '../../../src/domain/WarpGraph.js';
import { createVersionVector } from '../../../src/domain/crdt/VersionVector.js';
import { createDot } from '../../../src/domain/crdt/Dot.js';
import { buildWorkingSetOverlayRef } from '../../../src/domain/utils/RefLayout.js';

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

describe('WarpGraph working-set foundation', () => {
  /** @type {any} */
  let persistence;
  /** @type {WarpGraph} */
  let graph;
  const graphName = 'working-sets-demo';

  beforeEach(async () => {
    persistence = createMockPersistence();
    graph = await WarpGraph.open({
      persistence,
      graphName,
      writerId: 'tester',
      autoMaterialize: false,
    });
  });

  it('creates durable working-set descriptors with empty overlay identity', async () => {
    const sha = await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: createDot('alice', 1) },
      ],
    });

    const created = await graph.createWorkingSet({
      workingSetId: 'ws_demo',
      lamportCeiling: 1,
      owner: 'alice',
      scope: 'review',
      leaseExpiresAt: '2026-03-17T00:00:00Z',
    });

    expect(created.workingSetId).toBe('ws_demo');
    expect(created.owner).toBe('alice');
    expect(created.scope).toBe('review');
    expect(created.baseObservation.lamportCeiling).toBe(1);
    expect(created.baseObservation.frontier.alice).toBe(sha);
    expect(created.overlay).toEqual({
      overlayId: 'ws_demo',
      kind: 'patch-log',
      headPatchSha: null,
      patchCount: 0,
    });

    const loaded = await graph.getWorkingSet('ws_demo');
    expect(loaded).not.toBeNull();
    expect(loaded?.baseObservation.frontierDigest).toBe(created.baseObservation.frontierDigest);

    const listed = await graph.listWorkingSets();
    expect(listed.map((entry) => entry.workingSetId)).toEqual(['ws_demo']);

    const dropped = await graph.dropWorkingSet('ws_demo');
    expect(dropped).toBe(true);
    await expect(graph.getWorkingSet('ws_demo')).resolves.toBeNull();
  });

  it('materializeCoordinate replays an explicit frontier snapshot instead of the live frontier', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: createDot('alice', 1) },
        { type: 'PropSet', node: 'n1', key: 'color', value: 'red' },
      ],
    });
    const frontierAtRed = await graph.getFrontier();

    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 2,
      ops: [
        { type: 'PropSet', node: 'n1', key: 'color', value: 'blue' },
      ],
    });

    await graph.materializeCoordinate({
      frontier: Object.fromEntries(frontierAtRed),
      ceiling: null,
    });
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'red' });

    await graph.materialize();
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'blue' });
  });

  it('materializeWorkingSet replays the pinned base observation even after later writes', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: createDot('alice', 1) },
        { type: 'PropSet', node: 'n1', key: 'color', value: 'red' },
      ],
    });

    await graph.createWorkingSet({
      workingSetId: 'ws_red',
      owner: 'alice',
    });

    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 2,
      ops: [
        { type: 'PropSet', node: 'n1', key: 'color', value: 'blue' },
      ],
    });

    const result = await graph.materializeWorkingSet('ws_red', { receipts: true });
    expect(result.receipts).toHaveLength(1);
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'red' });
  });

  it('patchWorkingSet persists overlay patches without mutating the live frontier', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: createDot('alice', 1) },
        { type: 'PropSet', node: 'n1', key: 'color', value: 'red' },
      ],
    });

    await graph.createWorkingSet({
      workingSetId: 'ws_overlay',
      owner: 'alice',
    });

    const liveFrontierBefore = await graph.getFrontier();
    const overlayRef = buildWorkingSetOverlayRef(graphName, 'ws_overlay');

    const overlaySha = await graph.patchWorkingSet('ws_overlay', (p) => {
      p.setProperty('n1', 'color', 'blue');
    });

    expect(typeof overlaySha).toBe('string');
    expect(await persistence.readRef(overlayRef)).toBe(overlaySha);
    expect(await graph.getFrontier()).toEqual(liveFrontierBefore);

    const descriptor = await graph.getWorkingSet('ws_overlay');
    expect(descriptor?.overlay).toEqual({
      overlayId: 'ws_overlay',
      kind: 'patch-log',
      headPatchSha: overlaySha,
      patchCount: 1,
    });

    const workingSetState = await graph.materializeWorkingSet('ws_overlay');
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'blue' });

    await graph.materialize();
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'red' });
    expect(workingSetState.prop.size).toBeGreaterThan(0);
  });

  it('materializeWorkingSet includes overlay receipts and drop removes the overlay ref', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: createDot('alice', 1) },
      ],
    });

    await graph.createWorkingSet({
      workingSetId: 'ws_receipts',
      owner: 'alice',
    });

    const builder = await graph.createWorkingSetPatch('ws_receipts');
    builder.setProperty('n1', 'status', 'overlay');
    const overlaySha = await builder.commit();

    const materialized = await graph.materializeWorkingSet('ws_receipts', { receipts: true });
    expect(materialized.receipts).toHaveLength(2);
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ status: 'overlay' });

    const overlayRef = buildWorkingSetOverlayRef(graphName, 'ws_receipts');
    expect(await persistence.readRef(overlayRef)).toBe(overlaySha);

    await expect(graph.dropWorkingSet('ws_receipts')).resolves.toBe(true);
    await expect(persistence.readRef(overlayRef)).resolves.toBeNull();
  });
});
