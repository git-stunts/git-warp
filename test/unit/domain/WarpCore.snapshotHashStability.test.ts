// @ts-nocheck

import { beforeEach, describe, expect, it, vi } from 'vitest';

import WarpCore from '../../../src/domain/WarpCore.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../src/domain/crdt/VersionVector.ts';
import { computeStateHash } from '../../../src/domain/services/state/StateSerializer.ts';
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';

type WarpCoreHarness = any;

const crypto = new NodeCryptoAdapter();

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
    _trees: trees,
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
  const { encode } = await import('../../../src/infrastructure/codecs/CborCodec.ts');
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
  const message = encodePatchMessage({
    graph: graphName,
    writer: writerId,
    patchOid,
    lamport,
  });
  const sha = await persistence.commitNode({ message, parents });
  await persistence.updateRef(writerRef, sha);
  return sha;
}

/**
 * @param {unknown} state
 * @returns {Promise<string>}
 */
async function hashState(state) {
  return await computeStateHash(
    (state),
    { crypto },
  );
}

/**
 * @param {Map<string, string>} frontier
 * @returns {{ kind: 'coordinate', frontier: Record<string, string>, ceiling: null }}
 */
function createCoordinateSource(frontier) {
  return {
    kind: 'coordinate',
    frontier: Object.fromEntries(frontier),
    ceiling: null,
  };
}

describe('WarpCore public snapshot hash stability', () => {
    let persistence;
    let graph;
  /** @type {{ kind: 'coordinate', frontier: Record<string, string>, ceiling: null }} */
  let coordinateSource;
  const graphName = 'hash-stability-demo';

  beforeEach(async () => {
    persistence = createMockPersistence();
    graph = ((await WarpCore.open({
      persistence,
      graphName,
      writerId: 'tester',
      autoMaterialize: false,
    })) as WarpCoreHarness);

    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: Dot.create('alice', 1) },
        { type: 'PropSet', node: 'n1', key: 'color', value: 'red' },
      ],
    });

    coordinateSource = createCoordinateSource(await graph.getFrontier());

    await graph.createStrand({
      strandId: 'ws_red',
      owner: 'alice',
    });

    await graph.patchStrand('ws_red', (patch) => {
      patch.setProperty('n1', 'status', 'reviewing');
    });

    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 2,
      ops: [
        { type: 'PropSet', node: 'n1', key: 'color', value: 'blue' },
      ],
    });
  });

  it('preserves the same live state hash across repeated materialize calls and receipt mode', async () => {
    const liveStateA = await graph.materialize();
    const liveStateB = await graph.materialize();
    const withReceipts = /** @type {{ state: unknown, receipts: unknown[] }} */ (await graph.materialize({ receipts: true }));

    expect(await hashState(liveStateA)).toBe(await hashState(liveStateB));
    expect(await hashState(liveStateA)).toBe(await hashState(withReceipts.state));
  });

  it('preserves the current live state hash through getStateSnapshot()', async () => {
    const liveState = await graph.materialize();
    const snapshot = await graph.getStateSnapshot();

    expect(snapshot).not.toBeNull();
    expect(await hashState(snapshot)).toBe(await hashState(liveState));
  });

  it('preserves the same coordinate hash across direct runtime and worldline materialization', async () => {
    const directState = await graph.materializeCoordinate({
      frontier: coordinateSource.frontier,
      ceiling: coordinateSource.ceiling,
    });
    const worldline = graph.worldline({ source: createCoordinateSource(new Map(Object.entries(coordinateSource.frontier))) });
    const worldlineState = await worldline.materialize();

    expect(await hashState(directState)).toBe(await hashState(worldlineState));
  });

  it('preserves the same strand hash across repeated reads and receipt mode', async () => {
    const stateA = await graph.materializeStrand('ws_red');
    const stateB = await graph.materializeStrand('ws_red');
    const withReceipts = /** @type {{ state: unknown, receipts: unknown[] }} */ (
      await graph.materializeStrand('ws_red', { receipts: true })
    );

    expect(await hashState(stateA)).toBe(await hashState(stateB));
    expect(await hashState(stateA)).toBe(await hashState(withReceipts.state));
  });

  it('keeps observer.stateHash aligned with the pinned coordinate snapshot hash', async () => {
    const coordinateState = await graph.materializeCoordinate({
      frontier: coordinateSource.frontier,
      ceiling: coordinateSource.ceiling,
    });
    const observer = await graph.observer(
      'red-lane',
      { match: 'n1' },
      { source: createCoordinateSource(new Map(Object.entries(coordinateSource.frontier))) },
    );

    expect(observer.stateHash).toBe(await hashState(coordinateState));
  });
});
