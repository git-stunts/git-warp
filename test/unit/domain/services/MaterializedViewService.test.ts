import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { applyPatchOp, createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import computeShardKey from '../../../../src/domain/utils/shardKey.ts';
import { ReceiptShard } from '../../../../src/domain/artifacts/ReceiptShard.ts';
import LogicalIndexReader from '../../../../src/domain/services/index/LogicalIndexReader.ts';
import PropertyIndexReader from '../../../../src/domain/services/index/PropertyIndexReader.ts';
import * as viewHelpers from '../../../../src/domain/services/MaterializedViewHelpers.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import SequenceRandomPort from '../../../helpers/SequenceRandomPort.ts';
import { createEmptyDiff, PatchDiff } from '../../../../src/domain/types/PatchDiff.ts';
import MockIndexStorage from '../../../helpers/MockIndexStorage.ts';

function buildTestState() {
  const state = createEmptyState();
  const writer = 'w1';
  const sha = 'a'.repeat(40);
  let opIndex = 0;
  let lamport = 1;

  for (const nodeId of ['A', 'B', 'C']) {
    applyPatchOp(
      state,
      { type: 'NodeAdd', node: nodeId, dot: Dot.create(writer, lamport) },
      new EventId(lamport, writer, sha, opIndex++),
    );
    lamport += 1;
  }
  for (const edge of [
    { from: 'A', to: 'B', label: 'manages' },
    { from: 'A', to: 'C', label: 'owns' },
  ]) {
    applyPatchOp(
      state,
      { type: 'EdgeAdd', ...edge, dot: Dot.create(writer, lamport) },
      new EventId(lamport, writer, sha, opIndex++),
    );
    lamport += 1;
  }
  for (const property of [
    { node: 'A', key: 'name', value: 'Alice' },
    { node: 'B', key: 'role', value: 'admin' },
  ]) {
    applyPatchOp(
      state,
      { type: 'PropSet', ...property },
      new EventId(lamport, writer, sha, opIndex++),
    );
    lamport += 1;
  }
  return state;
}

function service(): MaterializedViewService {
  return new MaterializedViewService({ indexStore: new MockIndexStorage() });
}

/** The diff that adds nodes A and B and the edge A -> B, and the state after it. */
function addedPair(): { readonly diff: PatchDiff; readonly state: ReturnType<typeof createEmptyState> } {
  const state = createEmptyState();
  applyPatchOp(state, { type: 'NodeAdd', node: 'A', dot: Dot.create('w1', 1) }, new EventId(1, 'w1', 'a'.repeat(40), 0));
  applyPatchOp(state, { type: 'NodeAdd', node: 'B', dot: Dot.create('w1', 2) }, new EventId(2, 'w1', 'a'.repeat(40), 1));
  applyPatchOp(
    state,
    { type: 'EdgeAdd', from: 'A', to: 'B', label: 'knows', dot: Dot.create('w1', 3) },
    new EventId(3, 'w1', 'a'.repeat(40), 2),
  );
  const diff = new PatchDiff({
    nodesAdded: ['A', 'B'],
    nodesRemoved: [],
    edgesAdded: [{ from: 'A', to: 'B', label: 'knows' }],
    edgesRemoved: [],
    propsChanged: [],
    nodesCleared: [],
  });
  return { diff, state };
}

describe('MaterializedViewService', () => {
  it('builds a logical index and the receipt shard of the full build from state', () => {
    const result = service().build(buildTestState());

    expect(Object.keys(result.tree).length).toBeGreaterThan(0);
    expect(result.logicalIndex.isAlive('A')).toBe(true);
    expect(result.logicalIndex.isAlive('B')).toBe(true);
    expect(result.logicalIndex.isAlive('Z')).toBe(false);
    expect(result.receipt).toBeInstanceOf(ReceiptShard);
    expect(result.receipt).toMatchObject({ nodeCount: 3, labelCount: 2 });
  });

  it('builds a lazy property reader for the materialized view', async () => {
    const { propertyReader } = service().build(buildTestState());

    await expect(propertyReader.getNodeProps('A')).resolves.toEqual({ name: 'Alice' });
    await expect(propertyReader.getNodeProps('B')).resolves.toEqual({ role: 'admin' });
    await expect(propertyReader.getNodeProps('C')).resolves.toBeNull();
    await expect(propertyReader.getNodeProps('Z')).resolves.toBeNull();
  });

  it('builds deterministic neighborhood queries', () => {
    const { logicalIndex } = service().build(buildTestState());

    expect(logicalIndex.getEdges('A', 'out').map((edge) => edge.label).sort())
      .toEqual(['manages', 'owns']);
  });

  it('builds an empty view of the empty graph', async () => {
    const result = service().build(createEmptyState());

    expect(result.logicalIndex.getLabelRegistry().size).toBe(0);
    expect(result.logicalIndex.isAlive('A')).toBe(false);
    await expect(result.propertyReader.getNodeProps('A')).resolves.toBeNull();
    expect(result.receipt).toMatchObject({ nodeCount: 0, labelCount: 0 });
  });

  it('fails closed when build has no index store to encode the tree', () => {
    expect(() => new MaterializedViewService().build(buildTestState()))
      .toThrow(expect.objectContaining({
        code: 'E_INVALID_DEPENDENCY',
        message: 'MaterializedViewService.build requires an indexStore',
      }));
  });

  it('fails closed when applyDiff has no index store to open the tree', () => {
    const { tree } = service().build(buildTestState());

    expect(() => new MaterializedViewService().applyDiff({ existingTree: tree, diff: createEmptyDiff(), state: buildTestState() }))
      .toThrow(expect.objectContaining({
        code: 'E_INVALID_DEPENDENCY',
        message: 'MaterializedViewService.applyDiff requires an indexStore',
      }));
  });

  it('applies a diff through typed shards that the index store encodes', () => {
    const views = service();
    const state = buildTestState();
    const { tree } = views.build(state);
    // The state after the diff: C is removed.
    applyPatchOp(
      state,
      { type: 'NodeRemove', node: 'C', observedDots: [...state.nodeAlive.getDots('C')] },
      new EventId(100, 'w1', 'b'.repeat(40), 0),
    );
    const diff = new PatchDiff({
      nodesAdded: [], nodesRemoved: ['C'], edgesAdded: [], edgesRemoved: [], propsChanged: [], nodesCleared: [],
    });

    const result = views.applyDiff({ existingTree: tree, diff, state });

    expect(result.logicalIndex.isAlive('C')).toBe(false);
    expect(result.tree['labels.cbor']).toBe(tree['labels.cbor']);
  });

  it('returns no receipt from an incremental update, whose tree keeps the receipt shard of the full build', () => {
    const views = service();
    const { tree } = views.build(buildTestState());

    const result = views.applyDiff({ existingTree: tree, diff: createEmptyDiff(), state: buildTestState() });

    expect(result.receipt).toBeNull();
    expect(result.tree['receipt.cbor']).toBe(tree['receipt.cbor']);
  });

  it('indexes what a diff adds over a tree that holds no shard', async () => {
    const { diff, state } = addedPair();

    const result = service().applyDiff({ existingTree: {}, diff, state });

    expect(result.logicalIndex.isAlive('A')).toBe(true);
    expect(result.logicalIndex.getEdges('A', 'out')).toEqual([{ neighborId: 'B', label: 'knows' }]);
    await expect(result.propertyReader.getNodeProps('A')).resolves.toBeNull();
  });

  // Oracle: the #192 adapter checks. An update reads every meta, edge, and label
  // shard of the updated tree through the index store, so a shard that the diff
  // does not touch is checked too.
  it('refuses an untouched meta shard without nextLocalId at an update', () => {
    const views = service();
    const { tree } = views.build(buildTestState());
    const path = `meta_${computeShardKey('A')}.cbor`;
    const damaged = { ...tree, [path]: defaultCodec.encode({ nodeToGlobal: [['A', 0]] }) };

    expect(() => views.applyDiff({ existingTree: damaged, diff: createEmptyDiff(), state: buildTestState() }))
      .toThrow(expect.objectContaining({
        code: 'E_INDEX_SHARD_MALFORMED',
        context: { path, reason: 'id is not a non-negative integer' },
      }));
  });

  it('refuses an existing tree with a meta shard outside the shard key layout', () => {
    const views = service();
    const { tree } = views.build(buildTestState());
    const damaged = { ...tree, 'meta_abc.cbor': defaultCodec.encode({ nodeToGlobal: [['Q', 4096]], nextLocalId: 1 }) };

    expect(() => views.applyDiff({ existingTree: damaged, diff: createEmptyDiff(), state: buildTestState() }))
      .toThrow(expect.objectContaining({
        code: 'E_INDEX_SHARD_MALFORMED',
        context: { path: 'meta_abc.cbor', reason: 'shard path does not name a two-digit hex shard key' },
      }));
  });

  it('verifies the index that an incremental update reads back through the index store', () => {
    const views = service();
    const { tree } = views.build(createEmptyState());
    const { diff, state } = addedPair();
    const { logicalIndex } = views.applyDiff({ existingTree: tree, diff, state });

    const verified = views.verifyIndex({ state, logicalIndex, random: new SequenceRandomPort(), options: { sampleRate: 1, seed: 7 } });

    // Two alive nodes, each checked in both directions.
    expect(verified).toMatchObject({ passed: 4, failed: 0, errors: [] });
  });

  it('does not expose physical persistence methods', () => {
    const views = service();

    expect('persistIndexTree' in views).toBe(false);
    expect('loadFromOids' in views).toBe(false);
  });

  it('keeps no shard encode or decode bridge in core', () => {
    expect('_encodeShardsToTree' in MaterializedViewService.prototype).toBe(false);
    expect('loadFromTree' in LogicalIndexReader.prototype).toBe(false);
    expect('setupTree' in PropertyIndexReader.prototype).toBe(false);
    expect(Object.keys(viewHelpers).sort()).toEqual(['PROPS_PREFIX', 'partitionShardHandles']);
  });
});
