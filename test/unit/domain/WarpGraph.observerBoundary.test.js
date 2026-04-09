// @ts-nocheck

import { beforeEach, describe, expect, it, vi } from 'vitest';

import WarpCore from '../../../src/domain/WarpCore.ts';
import { createDot } from '../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../src/domain/crdt/VersionVector.ts';
import { createStateReaderV5 } from '../../../src/domain/services/state/StateReaderV5.js';
import { encodePropKey } from '../../../src/domain/services/KeyCodec.js';
import WarpError from '../../../src/domain/errors/WarpError.ts';

/** @typedef {any} WarpCoreRuntime */

/**
 * @param {number} counter
 * @returns {string}
 */
function hexSha(counter) {
  return String(counter).padStart(40, '0');
}

/**
 * Behavioral in-memory persistence for read/materialization tests.
 *
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
  const { encode } = await import('../../../src/infrastructure/codecs/CborCodec.js');
  const { encodePatchMessage } = await import('../../../src/domain/services/codec/WarpMessageCodec.js');
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

describe('WarpCore plumbing vs porcelain observer boundary', () => {
  /** @type {any} */
  let persistence;
  /** @type {WarpCoreRuntime} */
  let graph;
  const graphName = 'observer-boundary-demo';

  beforeEach(async () => {
    persistence = createMockPersistence();
    graph = /** @type {WarpCoreRuntime} */ (await WarpCore.open({
      persistence,
      graphName,
      writerId: 'tester',
      autoMaterialize: false,
    }));
  });

  it('materialize() returns a transitively immutable detached snapshot', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: createDot('alice', 1) },
        { type: 'PropSet', node: 'n1', key: 'color', value: { tone: 'red' } },
      ],
    });

    const state = /** @type {any} */ (await graph.materialize());
    const propKey = encodePropKey('n1', 'color');
    const colorRegister = state.prop.get(propKey);
    const liveDots = state.nodeAlive.entries.get('n1');

    expect(colorRegister).toBeDefined();
    expect(liveDots).toBeDefined();
    expect(Object.isFrozen(colorRegister)).toBe(true);
    expect(Object.isFrozen(colorRegister.value)).toBe(true);
    expect(() => state.prop.set(propKey, colorRegister)).toThrow(WarpError);
    expect(() => state.nodeAlive.entries.set('evil', new Set())).toThrow(WarpError);
    expect(() => liveDots.add('alice:999')).toThrow(WarpError);
    expect(() => {
      colorRegister.value.tone = 'green';
    }).toThrow(TypeError);

    const liveSnapshot = await graph.getStateSnapshot();
    const reader = createStateReaderV5(/** @type {any} */ (liveSnapshot));

    expect(reader.getNodeProps('n1')).toMatchObject({ color: { tone: 'red' } });
  });

  it('materializeCoordinate() returns a coordinate snapshot without retargeting the live graph handle', async () => {
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

    await graph.materialize();
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'blue' });

    const redState = /** @type {any} */ (await graph.materializeCoordinate({
      frontier: Object.fromEntries(frontierAtRed),
      ceiling: null,
    }));
    const redReader = createStateReaderV5(redState);

    expect(() => redState.prop.set('intruder', null)).toThrow(WarpError);
    expect(redReader.getNodeProps('n1')).toMatchObject({ color: 'red' });
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'blue' });
  });

  it('materializeStrand() returns a strand snapshot without retargeting the live graph handle', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: createDot('alice', 1) },
        { type: 'PropSet', node: 'n1', key: 'color', value: 'red' },
      ],
    });

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

    await graph.materialize();
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'blue' });

    const strandState = /** @type {any} */ (await graph.materializeStrand('ws_red'));
    const strandReader = createStateReaderV5(strandState);

    expect(() => strandState.prop.set('intruder', null)).toThrow(WarpError);
    expect(strandReader.getNodeProps('n1')).toMatchObject({
      color: 'red',
      status: 'reviewing',
    });
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'blue' });
  });

  it('observer() can create independent read-only handles at two explicit coordinates simultaneously', async () => {
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
    const frontierAtBlue = await graph.getFrontier();

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
    const blueObserver = await graph.observer(
      'blue-coordinate',
      { match: 'n1' },
      {
        source: {
          kind: 'coordinate',
          frontier: Object.fromEntries(frontierAtBlue),
          ceiling: null,
        },
      },
    );

    await expect(redObserver.getNodeProps('n1')).resolves.toMatchObject({ color: 'red' });
    await expect(blueObserver.getNodeProps('n1')).resolves.toMatchObject({ color: 'blue' });
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'blue' });
  });

  it('observer(config, { source }) supports the unlabeled call shape', async () => {
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

    const observer = await graph.observer(
      { match: 'n1' },
      {
        source: {
          kind: 'coordinate',
          frontier: Object.fromEntries(frontierAtRed),
          ceiling: null,
        },
      },
    );

    expect(observer.name).toBe('observer');
    await expect(observer.getNodeProps('n1')).resolves.toMatchObject({ color: 'red' });
  });

  it('observer.seek() returns a new live observer without mutating the original observer or caller graph', async () => {
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
    const redObserver = await graph.observer('lane', { match: 'n1' });

    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 2,
      ops: [
        { type: 'PropSet', node: 'n1', key: 'color', value: 'blue' },
      ],
    });

    const liveObserver = await redObserver.seek();

    expect(liveObserver).not.toBe(redObserver);
    const redSource = redObserver.source;
    const liveSource = liveObserver.source;
    expect(redSource).not.toBeNull();
    expect(liveSource).not.toBeNull();
    if (!redSource || !liveSource) {
      throw new Error('expected pinned observer sources');
    }
    expect(redSource.kind).toBe('live');
    expect(liveSource.kind).toBe('live');
    expect(typeof redObserver.stateHash).toBe('string');
    expect(typeof liveObserver.stateHash).toBe('string');
    expect(liveObserver.stateHash).not.toBe(redObserver.stateHash);

    await expect(redObserver.getNodeProps('n1')).resolves.toMatchObject({ color: 'red' });
    await expect(liveObserver.getNodeProps('n1')).resolves.toMatchObject({ color: 'blue' });
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'red' });
  });

  it('observer.seek() can time-travel to an explicit coordinate while preserving the current observer', async () => {
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

    await graph.materialize();
    const liveObserver = await (await graph.observer('lane', { match: 'n1' })).seek();
    const redObserver = await liveObserver.seek({
      source: {
        kind: 'coordinate',
        frontier: Object.fromEntries(frontierAtRed),
        ceiling: null,
      },
    });

    const redSource = redObserver.source;
    expect(redSource).not.toBeNull();
    if (!redSource) {
      throw new Error('expected coordinate observer source');
    }
    expect(redSource.kind).toBe('coordinate');
    await expect(liveObserver.getNodeProps('n1')).resolves.toMatchObject({ color: 'blue' });
    await expect(redObserver.getNodeProps('n1')).resolves.toMatchObject({ color: 'red' });
  });

  it('observer.seek() can pin a strand source without mutating live graph state', async () => {
    await simulatePatchCommit(persistence, {
      graphName,
      writerId: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'n1', dot: createDot('alice', 1) },
        { type: 'PropSet', node: 'n1', key: 'color', value: 'red' },
      ],
    });

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

    await graph.materialize();
    const liveObserver = await (await graph.observer('lane', { match: 'n1' })).seek();
    const strandObserver = await liveObserver.seek({
      source: {
        kind: 'strand',
        strandId: 'ws_red',
      },
    });

    const strandSource = strandObserver.source;
    expect(strandSource).not.toBeNull();
    if (!strandSource) {
      throw new Error('expected strand observer source');
    }
    expect(strandSource.kind).toBe('strand');
    await expect(liveObserver.getNodeProps('n1')).resolves.toMatchObject({ color: 'blue' });
    await expect(strandObserver.getNodeProps('n1')).resolves.toMatchObject({
      color: 'red',
      status: 'reviewing',
    });
    await expect(graph.getNodeProps('n1')).resolves.toMatchObject({ color: 'blue' });
  });
});
