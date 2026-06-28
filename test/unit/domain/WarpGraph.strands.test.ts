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

type WarpCoreRuntime = any;

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

    const redState = ((await graph.materializeCoordinate({
      frontier: Object.fromEntries(frontierAtRed),
      ceiling: null,
    })) as any);
    const redReader = createStateReader(redState);

    expect(redReader.getNodeProps('n1')).toMatchObject({ color: 'red' });

    await graph.materialize();
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'blue' });
  });

  it('materializeStrand follows live parent truth outside overlay divergence', async () => {
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

    expect(result.receipts).toHaveLength(2);
    expect(reader.getNodeProps('n1')).toMatchObject({ color: 'blue' });

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

  it('observer() can bind to a strand overlay without sliding under live parent changes', async () => {
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

    const strandState = (await graph.materializeStrand('ws_overlay') as any);
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

    const limitedState = (await graph.materializeStrand('ws_ceiling', { ceiling: 1 }) as any);
    const limitedReader = createStateReader(limitedState);

    expect(limitedReader.getNodeProps('n1')).toMatchObject({ color: 'red' });

    const fullState = (await graph.materializeStrand('ws_ceiling') as any);
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

    const braidedState = (await graph.materializeStrand('ws_target') as any);
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

});
