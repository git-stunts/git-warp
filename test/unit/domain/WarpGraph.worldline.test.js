import { beforeEach, describe, expect, it, vi } from 'vitest';

import WarpRuntime from '../../../src/domain/WarpRuntime.js';
import { createDot } from '../../../src/domain/crdt/Dot.js';
import { createVersionVector } from '../../../src/domain/crdt/VersionVector.js';
import { encodePropKey } from '../../../src/domain/services/KeyCodec.js';
import { createStateReaderV5 } from '../../../src/domain/services/StateReaderV5.js';

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
  const { encodePatchMessage } = await import('../../../src/domain/services/WarpMessageCodec.js');
  const { buildWriterRef } = await import('../../../src/domain/utils/RefLayout.js');

  const patch = {
    schema: 2,
    writer: writerId,
    lamport,
    ops,
    ...(reads ? { reads } : {}),
    ...(writes ? { writes } : {}),
    context: context || createVersionVector(),
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

describe('WarpRuntime worldline surface', () => {
  /** @type {any} */
  let persistence;
  /** @type {WarpRuntime} */
  let graph;
  const graphName = 'worldline-demo';

  beforeEach(async () => {
    persistence = createMockPersistence();
    graph = await WarpRuntime.open({
      persistence,
      graphName,
      writerId: 'tester',
      autoMaterialize: false,
    });
  });

  it('graph.worldline() returns a live worldline handle', () => {
    const worldline = graph.worldline();

    expect(worldline).toBeDefined();
    expect(worldline.source.kind).toBe('live');
  });

  it('worldline.materialize() returns detached live truth without retargeting the caller graph', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: createDot('alice', 1) },
        { type: 'PropSet', node: 'n1', key: 'color', value: 'red' },
      ],
    });

    await graph.materialize();
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'red' });

    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 2,
      ops: [
        { type: 'PropSet', node: 'n1', key: 'color', value: 'blue' },
      ],
    });

    const state = /** @type {any} */ (await graph.worldline().materialize());
    const reader = createStateReaderV5(state);
    const propKey = encodePropKey('n1', 'color');
    const liveDots = state.nodeAlive.entries.get('n1');

    expect(() => state.prop.set(propKey, null)).toThrow(TypeError);
    expect(() => state.nodeAlive.tombstones.add('alice:999')).toThrow(TypeError);
    expect(() => liveDots.add('alice:1000')).toThrow(TypeError);
    expect(reader.getNodeProps('n1')).toMatchObject({ color: 'blue' });
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'red' });
  });

  it('worldline.observer() creates an observer pinned to the worldline source', async () => {
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

    const redWorldline = await graph.worldline({
      source: {
        kind: 'coordinate',
        frontier: Object.fromEntries(frontierAtRed),
        ceiling: null,
      },
    });

    const redObserver = await redWorldline.observer('red-lane', { match: 'n1' });
    await expect(redObserver.getNodeProps('n1')).resolves.toMatchObject({ color: 'red' });
  });

  it('worldline.seek() returns a new worldline while preserving the original source', async () => {
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

    const liveWorldline = graph.worldline();
    const redWorldline = await liveWorldline.seek({
      source: {
        kind: 'coordinate',
        frontier: Object.fromEntries(frontierAtRed),
        ceiling: null,
      },
    });

    expect(redWorldline).not.toBe(liveWorldline);
    expect(liveWorldline.source.kind).toBe('live');
    expect(redWorldline.source.kind).toBe('coordinate');

    const liveObserver = await liveWorldline.observer('live', { match: 'n1' });
    const redObserver = await redWorldline.observer('red', { match: 'n1' });

    await expect(liveObserver.getNodeProps('n1')).resolves.toMatchObject({ color: 'blue' });
    await expect(redObserver.getNodeProps('n1')).resolves.toMatchObject({ color: 'red' });
  });

  it('working-set worldlines create observers and materializations without mutating live caller state', async () => {
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

    await graph.patchWorkingSet('ws_red', (patch) => {
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

    await graph.materialize();
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'blue' });

    const worldline = graph.worldline({
      source: {
        kind: 'working_set',
        workingSetId: 'ws_red',
      },
    });

    const state = /** @type {any} */ (await worldline.materialize());
    const reader = createStateReaderV5(state);
    const observer = await worldline.observer('ws', { match: 'n1' });

    expect(reader.getNodeProps('n1')).toMatchObject({
      color: 'red',
      status: 'reviewing',
    });
    await expect(observer.getNodeProps('n1')).resolves.toMatchObject({
      color: 'red',
      status: 'reviewing',
    });
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'blue' });
  });
});
