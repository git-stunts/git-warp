/**
 * Tests for Writer SPEC (WARP schema:2 only).
 *
 * @see src/domain/warp/Writer.js
 * @see src/domain/warp/PatchSession.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Writer } from '../../../../src/domain/warp/Writer.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { encodeEdgeKey } from '../../../../src/domain/services/JoinReducer.ts';
import type WarpState from '../../../../src/domain/services/state/WarpState.ts';
import { requirePatchOp } from '../PatchOperationAssertions.ts';
import {
  createPatchBuilderMockPersistence as createMockPersistence,
  createPatchBuilderMockState,
  createPatchJournal,
  type PatchBuilderMockPersistence,
} from '../services/PatchBuilderTestHarness.ts';

describe('PatchSession operations', () => {
  let persistence: PatchBuilderMockPersistence;
  let versionVector: VersionVector;
  let getCurrentState: () => WarpState | null;
  let patchJournal: ReturnType<typeof createPatchJournal>;

  beforeEach(() => {
    persistence = createMockPersistence();
    versionVector = VersionVector.empty();
    getCurrentState = () => null;
    persistence.readRef.mockResolvedValue(null);
    patchJournal = createPatchJournal(persistence);
  });

  it('addNode creates node-add op', async () => {
    const writer = new Writer({
      persistence,
      patchJournal,
      graphName: 'events',
      writerId: 'alice',
      versionVector,
      getCurrentState,
    });

    const patch = await writer.beginPatch();
    patch.addNode('user:alice');

    const built = patch.build();
    const op = requirePatchOp(built, 0);
    expect(built.ops).toHaveLength(1);
    expect(op).toMatchObject({ type: 'NodeAdd', node: 'user:alice' });
  });

  it('removeNode creates node-remove op', async () => {
    const state = createPatchBuilderMockState();
    state.nodeAlive.add('user:alice', Dot.create('alice', 1));

    const writer = new Writer({
      persistence,
      patchJournal,
      graphName: 'events',
      writerId: 'alice',
      versionVector,
      getCurrentState: () => state,
    });

    const patch = await writer.beginPatch();
    patch.removeNode('user:alice');

    const built = patch.build();
    const op = requirePatchOp(built, 0);
    expect(built.ops).toHaveLength(1);
    expect(op).toMatchObject({ type: 'NodeRemove', node: 'user:alice' });
  });

  it('addEdge creates edge-add op', async () => {
    const writer = new Writer({
      persistence,
      patchJournal,
      graphName: 'events',
      writerId: 'alice',
      versionVector,
      getCurrentState,
    });

    const patch = await writer.beginPatch();
    patch.addEdge('n1', 'n2', 'links');

    const built = patch.build();
    const op = requirePatchOp(built, 0);
    expect(built.ops).toHaveLength(1);
    expect(op).toMatchObject({
      type: 'EdgeAdd',
      from: 'n1',
      to: 'n2',
      label: 'links',
    });
  });

  it('removeEdge creates edge-remove op', async () => {
    const state = createPatchBuilderMockState();
    const ek = encodeEdgeKey('n1', 'n2', 'links');
    state.edgeAlive.add(ek, Dot.create('alice', 1));

    const writer = new Writer({
      persistence,
      patchJournal,
      graphName: 'events',
      writerId: 'alice',
      versionVector,
      getCurrentState: () => state,
    });

    const patch = await writer.beginPatch();
    patch.removeEdge('n1', 'n2', 'links');

    const built = patch.build();
    const op = requirePatchOp(built, 0);
    expect(built.ops).toHaveLength(1);
    expect(op).toMatchObject({ type: 'EdgeRemove' });
  });

  it('setProperty creates prop-set op', async () => {
    const writer = new Writer({
      persistence,
      patchJournal,
      graphName: 'events',
      writerId: 'alice',
      versionVector,
      getCurrentState,
    });

    const patch = await writer.beginPatch();
    patch.setProperty('user:alice', 'name', 'Alice');

    const built = patch.build();
    const op = requirePatchOp(built, 0);
    expect(built.ops).toHaveLength(1);
    expect(op).toMatchObject({
      type: 'PropSet',
      node: 'user:alice',
      key: 'name',
      value: 'Alice',
    });
  });

  it('supports various property value types', async () => {
    const writer = new Writer({
      persistence,
      patchJournal,
      graphName: 'events',
      writerId: 'alice',
      versionVector,
      getCurrentState,
    });

    const patch = await writer.beginPatch();
    patch.setProperty('n', 'str', 'hello');
    patch.setProperty('n', 'num', 42);
    patch.setProperty('n', 'bool', true);
    patch.setProperty('n', 'arr', [1, 2, 3]);
    patch.setProperty('n', 'obj', { x: 1 });

    const built = patch.build();
    expect(built.ops).toHaveLength(5);
    expect(requirePatchOp(built, 0)).toMatchObject({ value: 'hello' });
    expect(requirePatchOp(built, 1)).toMatchObject({ value: 42 });
    expect(requirePatchOp(built, 2)).toMatchObject({ value: true });
    expect(requirePatchOp(built, 3)).toMatchObject({ value: [1, 2, 3] });
    expect(requirePatchOp(built, 4)).toMatchObject({ value: { x: 1 } });
  });
});
