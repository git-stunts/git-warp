import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { applyPatchOp, createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
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

describe('MaterializedViewService', () => {
  it('builds a logical index and receipt from state', () => {
    const result = new MaterializedViewService({ codec: defaultCodec }).build(buildTestState());

    expect(Object.keys(result.tree).length).toBeGreaterThan(0);
    expect(result.logicalIndex.isAlive('A')).toBe(true);
    expect(result.logicalIndex.isAlive('B')).toBe(true);
    expect(result.logicalIndex.isAlive('Z')).toBe(false);
    expect(result.receipt['nodeCount']).toBe(3);
  });

  it('builds a lazy property reader for the materialized view', async () => {
    const { propertyReader } = new MaterializedViewService({ codec: defaultCodec })
      .build(buildTestState());

    await expect(propertyReader.getNodeProps('A')).resolves.toEqual({ name: 'Alice' });
    await expect(propertyReader.getNodeProps('B')).resolves.toEqual({ role: 'admin' });
    await expect(propertyReader.getNodeProps('C')).resolves.toBeNull();
    await expect(propertyReader.getNodeProps('Z')).resolves.toBeNull();
  });

  it('builds deterministic neighborhood queries', () => {
    const { logicalIndex } = new MaterializedViewService({ codec: defaultCodec })
      .build(buildTestState());

    expect(logicalIndex.getEdges('A', 'out').map((edge) => edge.label).sort())
      .toEqual(['manages', 'owns']);
  });

  it('fails closed when applyDiff has no index store to open the tree', () => {
    const service = new MaterializedViewService({ codec: defaultCodec });
    const { tree } = service.build(buildTestState());

    expect(() => service.applyDiff({ existingTree: tree, diff: createEmptyDiff(), state: buildTestState() }))
      .toThrow(expect.objectContaining({ code: 'E_INVALID_DEPENDENCY' }));
  });

  it('applies a diff through typed shards that the index store encodes', () => {
    const service = new MaterializedViewService({ codec: defaultCodec, indexStore: new MockIndexStorage() });
    const { tree } = service.build(buildTestState());
    const diff = new PatchDiff({
      nodesAdded: [], nodesRemoved: ['C'], edgesAdded: [], edgesRemoved: [], propsChanged: [], nodesCleared: [],
    });

    const result = service.applyDiff({ existingTree: tree, diff, state: buildTestState() });

    expect(result.logicalIndex.isAlive('C')).toBe(false);
    expect(result.tree['labels.cbor']).toBe(tree['labels.cbor']);
  });

  it('does not expose physical persistence methods', () => {
    const service = new MaterializedViewService({ codec: defaultCodec });

    expect('persistIndexTree' in service).toBe(false);
    expect('loadFromOids' in service).toBe(false);
  });
});
