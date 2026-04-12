// @ts-nocheck

import { beforeEach, describe, expect, it, vi } from 'vitest';

import WarpCore from '../../../src/domain/WarpCore.ts';
import {
  exportCoordinateComparisonFact,
  exportCoordinateTransferPlanFact,
} from '../../../src/domain/services/CoordinateFactExport.js';
import { createStateReader } from '../../../src/domain/services/state/StateReader.js';
import VersionVector from '../../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import { buildStrandBraidRef, buildStrandOverlayRef } from '../../../src/domain/utils/RefLayout.ts';

/** @typedef {any} WarpCoreRuntime */

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
    readTreeOids: vi.fn(),
  };
}

/**
 * @param {any} persistence
 * @param {{
 *   graphName: string,
 *   writerId: string,
 *   lamport: number,
 *   ops: Array<Record<string, unknown>>,
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
  const { encode } = await import('../../../src/infrastructure/codecs/CborCodec.js');
  const { encodePatchMessage } = await import('../../../src/domain/services/codec/WarpMessageCodec.ts');
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
  /** @type {any} */
  let persistence;
  /** @type {WarpCoreRuntime} */
  let graph;
  const graphName = 'strands-demo';

  beforeEach(async () => {
    persistence = createMockPersistence();
    graph = /** @type {WarpCoreRuntime} */ (await WarpCore.open({
      persistence,
      graphName,
      writerId: 'tester',
      autoMaterialize: false,
    }));
  });

  it('creates durable strand descriptors with empty overlay identity', async () => {
    const sha = await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: Dot.create('alice', 1) },
      ],
    });

    const created = await graph.createStrand({
      strandId: 'ws_demo',
      lamportCeiling: 1,
      owner: 'alice',
      scope: 'review',
      leaseExpiresAt: '2026-03-17T00:00:00Z',
    });

    expect(created.strandId).toBe('ws_demo');
    expect(created.owner).toBe('alice');
    expect(created.scope).toBe('review');
    expect(created.baseObservation.lamportCeiling).toBe(1);
    expect(created.baseObservation.frontier.alice).toBe(sha);
    expect(created.overlay).toEqual({
      overlayId: 'ws_demo',
      kind: 'patch-log',
      headPatchSha: null,
      patchCount: 0,
      writable: true,
    });
    expect(created.braid).toEqual({ readOverlays: [] });

    const loaded = await graph.getStrand('ws_demo');
    expect(loaded).not.toBeNull();
    expect(loaded?.baseObservation.frontierDigest).toBe(created.baseObservation.frontierDigest);

    const listed = await graph.listStrands();
    expect(listed.map((entry) => entry.strandId)).toEqual(['ws_demo']);

    const dropped = await graph.dropStrand('ws_demo');
    expect(dropped).toBe(true);
    await expect(graph.getStrand('ws_demo')).resolves.toBeNull();
  });

  it('materializeCoordinate replays an explicit frontier snapshot instead of the live frontier', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: Dot.create('alice', 1) },
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

    const redState = /** @type {any} */ (await graph.materializeCoordinate({
      frontier: Object.fromEntries(frontierAtRed),
      ceiling: null,
    }));
    const redReader = createStateReader(redState);

    expect(redReader.getNodeProps('n1')).toMatchObject({ color: 'red' });

    await graph.materialize();
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'blue' });
  });

  it('materializeStrand replays the pinned base observation even after later writes', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: Dot.create('alice', 1) },
        { type: 'PropSet', node: 'n1', key: 'color', value: 'red' },
      ],
    });

    await graph.createStrand({
      strandId: 'ws_red',
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

    const result = /** @type {{ state: any, receipts: any[] }} */ (await graph.materializeStrand('ws_red', { receipts: true }));
    const reader = createStateReader(result.state);

    expect(result.receipts).toHaveLength(1);
    expect(reader.getNodeProps('n1')).toMatchObject({ color: 'red' });

    await graph.materialize();
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'blue' });
  });

  it('observer() pins the read coordinate it was created from even after live truth advances', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: Dot.create('alice', 1) },
        { type: 'PropSet', node: 'n1', key: 'color', value: 'red' },
      ],
    });

    await graph.materialize();
    const redObserver = await graph.observer('red', { match: 'n1' });

    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 2,
      ops: [
        { type: 'PropSet', node: 'n1', key: 'color', value: 'blue' },
      ],
    });

    await graph.materialize();

    await expect(redObserver.getNodeProps('n1')).resolves.toMatchObject({ color: 'red' });
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'blue' });
  });

  it('observer() can bind directly to an explicit coordinate instead of the live frontier', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: Dot.create('alice', 1) },
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

    await graph.materialize();
    const redObserver = await graph.observer(
      'red-coordinate',
      { match: 'n1' },
      {
        source: {
          kind: 'coordinate',
          frontier: Object.fromEntries(frontierAtRed),
          ceiling: null,
        },
      },
    );

    await expect(redObserver.getNodeProps('n1')).resolves.toMatchObject({ color: 'red' });
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'blue' });
  });

  it('observer() can bind directly to a pinned strand instead of live truth', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: Dot.create('alice', 1) },
        { type: 'PropSet', node: 'n1', key: 'color', value: 'red' },
      ],
    });

    await graph.createStrand({
      strandId: 'ws_red',
      owner: 'alice',
    });

    await graph.patchStrand('ws_red', (p) => {
      p.setProperty('n1', 'status', 'reviewing');
    });

    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 2,
      ops: [
        { type: 'PropSet', node: 'n1', key: 'color', value: 'blue' },
      ],
    });

    await graph.materialize();
    const strandObserver = await graph.observer(
      'ws-red',
      { match: 'n1' },
      {
        source: {
          kind: 'strand',
          strandId: 'ws_red',
        },
      },
    );

    await expect(strandObserver.getNodeProps('n1')).resolves.toMatchObject({
      color: 'red',
      status: 'reviewing',
    });
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'blue' });
  });

  it('patchStrand persists overlay patches without mutating the live frontier', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: Dot.create('alice', 1) },
        { type: 'PropSet', node: 'n1', key: 'color', value: 'red' },
      ],
    });

    await graph.createStrand({
      strandId: 'ws_overlay',
      owner: 'alice',
    });

    const liveFrontierBefore = await graph.getFrontier();
    const overlayRef = buildStrandOverlayRef(graphName, 'ws_overlay');

    const overlaySha = await graph.patchStrand('ws_overlay', (p) => {
      p.setProperty('n1', 'color', 'blue');
    });

    expect(typeof overlaySha).toBe('string');
    expect(await persistence.readRef(overlayRef)).toBe(overlaySha);
    expect(await graph.getFrontier()).toEqual(liveFrontierBefore);

    const descriptor = await graph.getStrand('ws_overlay');
    expect(descriptor?.overlay).toEqual({
      overlayId: 'ws_overlay',
      kind: 'patch-log',
      headPatchSha: overlaySha,
      patchCount: 1,
      writable: true,
    });
    expect(descriptor?.braid).toEqual({ readOverlays: [] });

    const strandState = /** @type {any} */ (await graph.materializeStrand('ws_overlay'));
    const reader = createStateReader(strandState);

    expect(reader.getNodeProps('n1')).toMatchObject({ color: 'blue' });

    await graph.materialize();
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'red' });
    expect(strandState.prop.size).toBeGreaterThan(0);
  });

  it('materializeStrand includes overlay receipts and drop removes the overlay ref', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: Dot.create('alice', 1) },
      ],
    });

    await graph.createStrand({
      strandId: 'ws_receipts',
      owner: 'alice',
    });

    const builder = await graph.createStrandPatch('ws_receipts');
    builder.setProperty('n1', 'status', 'overlay');
    const overlaySha = await builder.commit();

    const materialized = /** @type {{ state: any, receipts: any[] }} */ (await graph.materializeStrand('ws_receipts', { receipts: true }));
    const reader = createStateReader(materialized.state);

    expect(materialized.receipts).toHaveLength(2);
    expect(reader.getNodeProps('n1')).toMatchObject({ status: 'overlay' });

    await graph.materialize();
    const liveProps = await graph.getNodeProps('n1');
    expect(liveProps).not.toBeNull();
    if (!liveProps) {
      throw new Error('expected live node props');
    }
    expect(liveProps.status).toBeUndefined();

    const overlayRef = buildStrandOverlayRef(graphName, 'ws_receipts');
    expect(await persistence.readRef(overlayRef)).toBe(overlaySha);

    await expect(graph.dropStrand('ws_receipts')).resolves.toBe(true);
    await expect(persistence.readRef(overlayRef)).resolves.toBeNull();
  });

  it('materializeStrand applies an additional ceiling over the strand patch universe', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: Dot.create('alice', 1) },
        { type: 'PropSet', node: 'n1', key: 'color', value: 'red' },
      ],
    });

    await graph.createStrand({
      strandId: 'ws_ceiling',
      owner: 'alice',
    });

    await graph.patchStrand('ws_ceiling', (p) => {
      p.setProperty('n1', 'color', 'blue');
    });

    const limitedState = /** @type {any} */ (await graph.materializeStrand('ws_ceiling', { ceiling: 1 }));
    const limitedReader = createStateReader(limitedState);

    expect(limitedReader.getNodeProps('n1')).toMatchObject({ color: 'red' });

    const fullState = /** @type {any} */ (await graph.materializeStrand('ws_ceiling'));
    const fullReader = createStateReader(fullState);

    expect(fullReader.getNodeProps('n1')).toMatchObject({ color: 'blue' });

    await graph.materialize();
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'red' });
  });

  it('braidStrand pins support overlays onto the visible patch universe and preserves target-owned braid refs', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: Dot.create('alice', 1) },
        { type: 'PropSet', node: 'n1', key: 'status', value: 'base' },
      ],
    });

    await graph.createStrand({
      strandId: 'ws_target',
      owner: 'alice',
    });
    await graph.createStrand({
      strandId: 'ws_support',
      owner: 'alice',
    });

    const supportSha = await graph.patchStrand('ws_support', (p) => {
      p.setProperty('n1', 'support', 'held');
    });
    const targetSha = await graph.patchStrand('ws_target', (p) => {
      p.setProperty('n1', 'status', 'target');
    });

    const braided = await graph.braidStrand('ws_target', {
      braidedStrandIds: ['ws_support'],
    });

    expect(braided.overlay.writable).toBe(true);
    expect(braided.braid.readOverlays).toEqual([
      {
        strandId: 'ws_support',
        overlayId: 'ws_support',
        kind: 'patch-log',
        headPatchSha: supportSha,
        patchCount: 1,
      },
    ]);
    expect(await persistence.readRef(buildStrandBraidRef(graphName, 'ws_target', 'ws_support'))).toBe(supportSha);

    const braidedState = /** @type {any} */ (await graph.materializeStrand('ws_target'));
    const braidedReader = createStateReader(braidedState);

    expect(braidedReader.getNodeProps('n1')).toMatchObject({
      status: 'target',
      support: 'held',
    });

    await graph.materialize();
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({
      status: 'base',
    });

    const comparison = await graph.compareStrand('ws_target', { targetId: 'n1' });
    expect(comparison.left.resolved.strand).toMatchObject({
      strandId: 'ws_target',
      overlayHeadPatchSha: targetSha,
      overlayPatchCount: 1,
      overlayWritable: true,
      braid: {
        readOverlayCount: 1,
        braidedStrandIds: ['ws_support'],
      },
    });

    await expect(graph.dropStrand('ws_support')).resolves.toBe(true);
    expect(await persistence.readRef(buildStrandBraidRef(graphName, 'ws_target', 'ws_support'))).toBe(supportSha);
  });

  it('braidStrand rejects support strands with a different pinned base observation', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: Dot.create('alice', 1) },
      ],
    });

    await graph.createStrand({ strandId: 'ws_target', owner: 'alice' });

    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 2,
      context: new Map([['alice', 1]]),
      ops: [
        { type: 'PropSet', node: 'n1', key: 'status', value: 'later' },
      ],
    });

    await graph.createStrand({ strandId: 'ws_support', owner: 'alice' });

    await expect(graph.braidStrand('ws_target', {
      braidedStrandIds: ['ws_support'],
    })).rejects.toMatchObject({
      code: 'E_STRAND_COORDINATE_INVALID',
    });
  });

  it('patchStrand rejects read-only braid targets and drop removes braid refs with the target', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: Dot.create('alice', 1) },
      ],
    });

    await graph.createStrand({ strandId: 'ws_target', owner: 'alice' });
    await graph.createStrand({ strandId: 'ws_support', owner: 'alice' });

    const supportSha = await graph.patchStrand('ws_support', (p) => {
      p.setProperty('n1', 'support', 'held');
    });

    await graph.braidStrand('ws_target', {
      braidedStrandIds: ['ws_support'],
      writable: false,
    });

    await expect(graph.patchStrand('ws_target', (p) => {
      p.setProperty('n1', 'status', 'blocked');
    })).rejects.toMatchObject({
      code: 'E_STRAND_INVALID_ARGS',
    });

    const braidRef = buildStrandBraidRef(graphName, 'ws_target', 'ws_support');
    expect(await persistence.readRef(braidRef)).toBe(supportSha);
    await expect(graph.dropStrand('ws_target')).resolves.toBe(true);
    await expect(persistence.readRef(braidRef)).resolves.toBeNull();
  });

  it('braid-visible patch inspection and receipts include pinned support overlays automatically', async () => {
    const baseSha = await simulatePatchCommit(persistence, {
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

    await graph.createStrand({ strandId: 'ws_target', owner: 'alice' });
    await graph.createStrand({ strandId: 'ws_support', owner: 'alice' });

    const supportSha = await graph.patchStrand('ws_support', (p) => {
      p.setProperty('n1', 'support', 'held');
    });
    const targetSha = await graph.patchStrand('ws_target', (p) => {
      p.setProperty('n1', 'status', 'target');
    });

    await graph.braidStrand('ws_target', {
      braidedStrandIds: ['ws_support'],
    });

    const entries = await graph.getStrandPatches('ws_target');
    expect(entries.map(({ sha }) => sha).sort()).toEqual([baseSha, supportSha, targetSha].sort());

    const shas = await graph.patchesForStrand('ws_target', 'n1');
    expect(shas).toEqual([baseSha, supportSha, targetSha].sort());

    const materialized = await graph.materializeStrand('ws_target', { receipts: true });
    expect(materialized.receipts.map((receipt) => receipt.patchSha).sort()).toEqual(
      [baseSha, supportSha, targetSha].sort(),
    );
  });

  it('getStrandPatches returns the visible base-plus-overlay entries for a strand', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: Dot.create('alice', 1) },
      ],
    });

    await graph.createStrand({
      strandId: 'ws_entries',
      owner: 'alice',
    });

    await graph.patchStrand('ws_entries', (p) => {
      p.setProperty('n1', 'status', 'overlay');
    });

    const full = await graph.getStrandPatches('ws_entries');
    const baseOnly = await graph.getStrandPatches('ws_entries', { ceiling: 1 });

    expect(full).toHaveLength(2);
    expect(full.map(({ patch }) => patch.writer)).toEqual(['alice', 'ws_entries']);
    expect(baseOnly).toHaveLength(1);
    expect(baseOnly[0].patch.writer).toBe('alice');
  });

  it('patchesForStrand returns the visible base-plus-overlay provenance set for one entity', async () => {
    const baseSha = await simulatePatchCommit(persistence, {
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
      strandId: 'ws_entries_prov',
      owner: 'alice',
    });

    const overlaySha = await graph.patchStrand('ws_entries_prov', (p) => {
      p.setProperty('n1', 'color', 'blue');
    });

    const shas = await graph.patchesForStrand('ws_entries_prov', 'n1');

    expect(shas).toEqual([baseSha, overlaySha].sort());
  });

  it('createStateReader inspects entity-local strand truth without touching OR-Set internals', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: Dot.create('alice', 1) },
        { type: 'NodeAdd', node: 'n2', dot: Dot.create('alice', 2) },
        { type: 'EdgeAdd', from: 'n1', to: 'n2', label: 'links', dot: Dot.create('alice', 3) },
        { type: 'PropSet', node: 'n1', key: 'status', value: 'base' },
      ],
    });

    await graph.createStrand({
      strandId: 'ws_reader',
      owner: 'alice',
    });

    await graph.patchStrand('ws_reader', async (p) => {
      p.setProperty('n1', 'status', 'overlay');
      await p.attachContent('n1', 'hello', { mime: 'text/plain', size: 5 });
    });

    const state = await graph.materializeStrand('ws_reader');
    const reader = createStateReader(state);

    expect(reader.inspectNode('n1')).toEqual({
      nodeId: 'n1',
      props: {
        status: 'overlay',
        _content: expect.any(String),
        '_content.mime': 'text/plain',
        '_content.size': 5,
      },
      outgoing: [{ nodeId: 'n2', label: 'links', direction: 'outgoing' }],
      incoming: [],
      content: {
        oid: expect.any(String),
        mime: 'text/plain',
        size: 5,
      },
    });
    expect(reader.getEdgeProps('n1', 'n2', 'links')).toEqual({});
    expect(reader.getNodeContentMeta('n1')).toEqual({
      oid: expect.any(String),
      mime: 'text/plain',
      size: 5,
    });
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
      ops: [
        { type: 'PropSet', node: 'n1', key: 'status', value: 'live' },
      ],
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
      ops: [
        { type: 'PropSet', node: 'n1', key: 'color', value: 'blue' },
      ],
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
    expect(JSON.parse(factExport.canonicalFactJson)).toEqual(factExport.fact);
    await expect(graph._crypto.hash('sha256', factExport.canonicalFactJson)).resolves.toBe(factExport.factDigest);
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
        { type: 'PropSet', node: 'comparison-artifact:cmp-1', key: 'kind', value: 'comparison-artifact' },
        { type: 'EdgeAdd', from: 'task:1', to: 'comparison-artifact:cmp-1', label: 'governs', dot: Dot.create('alice', 3) },
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
    expect(scopedComparison.left.resolved.patchUniverseDigest).toBe(scopedComparison.right.resolved.patchUniverseDigest);

    const scopedFactExport = exportCoordinateComparisonFact(scopedComparison);
    expect(scopedFactExport.fact.scope).toEqual(scope);
    expect(JSON.parse(scopedFactExport.canonicalFactJson)).toEqual(scopedFactExport.fact);
    await expect(graph._crypto.hash('sha256', scopedFactExport.canonicalFactJson)).resolves.toBe(scopedFactExport.factDigest);

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
      oid: expect.any(String),
      mime: 'text/plain',
      size: 14,
    });
    persistence._blobs.set(
      /** @type {{ oid: string }} */ (strandContentMeta).oid,
      Buffer.from('worldline-body'),
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
    const attachOp = /** @type {import('../../../index.js').VisibleStateTransferOperationV1 & { op: 'attach_node_content', nodeId: string, content: Uint8Array, contentOid: string, mime?: string|null, size?: number|null }} */ (
      transferPlan.ops.find((op) => op.op === 'attach_node_content' && op.nodeId === 'doc:1')
    );
    expect(attachOp).toMatchObject({
      op: 'attach_node_content',
      nodeId: 'doc:1',
      contentOid: expect.any(String),
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
            contentOid: attachOp.contentOid,
            mime: 'text/plain',
            size: 14,
          },
        ]),
      }),
    });
    expect(JSON.parse(factExport.canonicalFactJson)).toEqual(factExport.fact);
    await expect(graph._crypto.hash('sha256', factExport.canonicalFactJson)).resolves.toBe(factExport.factDigest);
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
