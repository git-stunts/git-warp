import { describe, it, expect, beforeEach } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { encode } from '../../../src/infrastructure/codecs/CborCodec.js';
import { encodePatchMessage } from '../../../src/domain/services/WarpMessageCodec.js';
import { createMockPersistence } from '../../helpers/warpGraphTestUtils.js';

/**
 * Creates a minimal schema:2 patch object.
 */
function createPatch(/** @type {any} */ writer, /** @type {any} */ lamport, /** @type {any} */ ops) {
  return {
    schema: 2,
    writer,
    lamport,
    context: { [writer]: lamport },
    ops,
  };
}

function fakeSha(/** @type {any} */ label) {
  const hex = Buffer.from(String(label)).toString('hex');
  return hex.padEnd(40, 'a').slice(0, 40);
}

/**
 * Sets up persistence with a single writer that has multiple patches.
 *
 * patchSpecs: [{ lamport, ops }]
 */
function setupPersistence(/** @type {any} */ persistence, /** @type {any} */ writer, /** @type {any} */ patchSpecs, /** @type {any} */ graphName = 'test') {
  const nodeInfoMap = new Map();
  const blobMap = new Map();

  // Build shas from highest lamport to lowest (tip first)
  const sorted = [...patchSpecs].sort((a, b) => b.lamport - a.lamport);
  const shas = sorted.map((s) => fakeSha(`${writer}-${s.lamport}`));

  for (let j = 0; j < sorted.length; j++) {
    const spec = sorted[j];
    const patchOid = fakeSha(`blob-${writer}-${spec.lamport}`);
    const message = encodePatchMessage({
      graph: graphName,
      writer,
      lamport: spec.lamport,
      patchOid,
      schema: 2,
    });
    const parents = j < sorted.length - 1 ? [shas[j + 1]] : [];
    nodeInfoMap.set(shas[j], { message, parents });
    blobMap.set(patchOid, encode(createPatch(writer, spec.lamport, spec.ops)));
  }

  const tipSha = shas[0];
  const writerRef = `refs/warp/${graphName}/writers/${writer}`;

  persistence.getNodeInfo.mockImplementation((/** @type {any} */ sha) => {
    const info = nodeInfoMap.get(sha);
    return Promise.resolve(info || { message: '', parents: [] });
  });

  persistence.readBlob.mockImplementation((/** @type {any} */ oid) => {
    const buf = blobMap.get(oid);
    return Promise.resolve(buf || Buffer.alloc(0));
  });

  persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
    if (ref === `refs/warp/${graphName}/checkpoints/head`) {
      return Promise.resolve(null);
    }
    if (ref === writerRef) {
      return Promise.resolve(tipSha);
    }
    return Promise.resolve(null);
  });

  persistence.listRefs.mockImplementation((/** @type {any} */ prefix) => {
    if (prefix.startsWith(`refs/warp/${graphName}/writers`)) {
      return Promise.resolve([writerRef]);
    }
    return Promise.resolve([]);
  });
}

describe('WarpGraph.getStateSnapshot()', () => {
  /** @type {any} */
  let persistence;

  beforeEach(() => {
    persistence = createMockPersistence();
  });

  it('returns null when no state is materialized', async () => {
    persistence.listRefs.mockResolvedValue([]);
    persistence.readRef.mockResolvedValue(null);

    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      autoMaterialize: false,
    });

    const snap = await graph.getStateSnapshot();
    expect(snap).toBeNull();
  });

  it('auto-materializes when autoMaterialize is enabled and no cached state', async () => {
    setupPersistence(persistence, 'alice', [
      { lamport: 1, ops: [{ type: 'NodeAdd', node: 'n1', dot: { writer: 'alice', counter: 1 } }] },
    ]);

    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
      autoMaterialize: true,
    });

    // No explicit materialize() call — getStateSnapshot should trigger it
    const snap = await graph.getStateSnapshot();
    expect(snap).not.toBeNull();
    expect(/** @type {*} */ (snap).nodeAlive).toBeDefined();
  });

  it('returns a defensive copy of materialized state', async () => {
    setupPersistence(persistence, 'alice', [
      { lamport: 1, ops: [{ type: 'NodeAdd', node: 'n1', dot: { writer: 'alice', counter: 1 } }] },
    ]);

    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
    });

    await graph.materialize({ ceiling: 1 });
    const snap = await graph.getStateSnapshot();
    expect(snap).not.toBeNull();

    // Verify it has the expected node
    const nodes = await graph.getNodes();
    expect(nodes).toContain('n1');

    // Verify defensive copy: modifying the snapshot doesn't affect the graph
    /** @type {*} */ (snap).prop.set('injected', { value: 'bad' });
    const snap2 = /** @type {*} */ (await graph.getStateSnapshot());
    expect(snap2.prop.has('injected')).toBe(false);
  });

  it('produces distinct state references at different ceilings', async () => {
    setupPersistence(persistence, 'alice', [
      { lamport: 1, ops: [{ type: 'NodeAdd', node: 'n1', dot: { writer: 'alice', counter: 1 } }] },
      { lamport: 2, ops: [{ type: 'NodeAdd', node: 'n2', dot: { writer: 'alice', counter: 2 } }] },
    ]);

    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
    });

    await graph.materialize({ ceiling: 1 });
    const snap1 = /** @type {*} */ (await graph.getStateSnapshot());

    await graph.materialize({ ceiling: 2 });
    const snap2 = /** @type {*} */ (await graph.getStateSnapshot());

    // snap1 should have 1 node, snap2 should have 2
    expect(snap1).not.toBe(snap2);
    expect(snap1.nodeAlive).not.toBe(snap2.nodeAlive);
  });
});

describe('Structural seek diff (diffStates integration)', () => {
  /** @type {any} */
  let persistence;

  beforeEach(() => {
    persistence = createMockPersistence();
  });

  it('forward step shows added nodes', async () => {
    setupPersistence(persistence, 'alice', [
      { lamport: 1, ops: [{ type: 'NodeAdd', node: 'n1', dot: { writer: 'alice', counter: 1 } }] },
      { lamport: 2, ops: [{ type: 'NodeAdd', node: 'n2', dot: { writer: 'alice', counter: 2 } }] },
    ]);

    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
    });

    // Get state at tick 1
    await graph.materialize({ ceiling: 1 });
    const before = await graph.getStateSnapshot();

    // Get state at tick 2
    await graph.materialize({ ceiling: 2 });
    const after = await graph.getStateSnapshot();

    const { diffStates } = await import('../../../src/domain/services/StateDiff.js');
    const diff = diffStates(before, /** @type {*} */ (after));

    expect(diff.nodes.added).toContain('n2');
    expect(diff.nodes.removed).toEqual([]);
  });

  it('backward step shows removed nodes', async () => {
    setupPersistence(persistence, 'alice', [
      { lamport: 1, ops: [{ type: 'NodeAdd', node: 'n1', dot: { writer: 'alice', counter: 1 } }] },
      { lamport: 2, ops: [{ type: 'NodeAdd', node: 'n2', dot: { writer: 'alice', counter: 2 } }] },
    ]);

    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
    });

    // Get state at tick 2
    await graph.materialize({ ceiling: 2 });
    const before = await graph.getStateSnapshot();

    // Get state at tick 1
    await graph.materialize({ ceiling: 1 });
    const after = await graph.getStateSnapshot();

    const { diffStates } = await import('../../../src/domain/services/StateDiff.js');
    const diff = diffStates(before, /** @type {*} */ (after));

    expect(diff.nodes.removed).toContain('n2');
    expect(diff.nodes.added).toEqual([]);
  });

  it('first seek (from empty) shows all as additions', async () => {
    setupPersistence(persistence, 'alice', [
      { lamport: 1, ops: [
        { type: 'NodeAdd', node: 'n1', dot: { writer: 'alice', counter: 1 } },
        { type: 'NodeAdd', node: 'n2', dot: { writer: 'alice', counter: 1 } },
      ] },
    ]);

    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
    });

    await graph.materialize({ ceiling: 1 });
    const after = await graph.getStateSnapshot();

    const { diffStates } = await import('../../../src/domain/services/StateDiff.js');
    const diff = diffStates(null, /** @type {*} */ (after));

    expect(diff.nodes.added.sort()).toEqual(['n1', 'n2']);
    expect(diff.nodes.removed).toEqual([]);
  });

  it('same-tick no-op produces empty diff', async () => {
    setupPersistence(persistence, 'alice', [
      { lamport: 1, ops: [{ type: 'NodeAdd', node: 'n1', dot: { writer: 'alice', counter: 1 } }] },
    ]);

    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
    });

    await graph.materialize({ ceiling: 1 });
    const snap1 = await graph.getStateSnapshot();

    await graph.materialize({ ceiling: 1 });
    const snap2 = await graph.getStateSnapshot();

    const { diffStates, isEmptyDiff } = await import('../../../src/domain/services/StateDiff.js');
    const diff = diffStates(snap1, /** @type {*} */ (snap2));

    expect(isEmptyDiff(diff)).toBe(true);
  });

  it('detects property changes with old/new values', async () => {
    setupPersistence(persistence, 'alice', [
      { lamport: 1, ops: [
        { type: 'NodeAdd', node: 'n1', dot: { writer: 'alice', counter: 1 } },
        { type: 'PropSet', node: 'n1', key: 'name', value: 'Alice' },
      ] },
      { lamport: 2, ops: [
        { type: 'PropSet', node: 'n1', key: 'name', value: 'Alicia' },
      ] },
    ]);

    const graph = await WarpGraph.open({
      persistence,
      graphName: 'test',
      writerId: 'w1',
    });

    await graph.materialize({ ceiling: 1 });
    const before = await graph.getStateSnapshot();

    await graph.materialize({ ceiling: 2 });
    const after = await graph.getStateSnapshot();

    const { diffStates } = await import('../../../src/domain/services/StateDiff.js');
    const diff = diffStates(before, /** @type {*} */ (after));

    expect(diff.props.set.length).toBe(1);
    expect(diff.props.set[0].propKey).toBe('name');
    expect(diff.props.set[0].oldValue).toBe('Alice');
    expect(diff.props.set[0].newValue).toBe('Alicia');
  });
});
