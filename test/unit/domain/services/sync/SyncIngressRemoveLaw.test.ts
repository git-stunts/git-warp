/**
 * Sync ingress and the remove law (#193, #1120 same-patch check).
 *
 * Sync responses carry raw wire records and do not pass through the
 * persisted-patch decode boundary. `applySyncResponse` must still refuse
 * the malformed remove shapes, refuse the whole response, and leave the
 * caller's state unchanged.
 */

import { describe, expect, it } from 'vitest';
import { applySyncResponse } from '../../../../../src/domain/services/sync/SyncProtocol.ts';
import { cloneState, createEmptyState, reducePatches } from '../../../../../src/domain/services/JoinReducer.ts';
import { createFrontier } from '../../../../../src/domain/services/Frontier.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import CrossOwnerRemoveError from '../../../../../src/domain/errors/CrossOwnerRemoveError.ts';
import PatchError from '../../../../../src/domain/errors/PatchError.ts';
import SchemaUnsupportedError from '../../../../../src/domain/errors/SchemaUnsupportedError.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import type { SyncResponse } from '../../../../../src/domain/capabilities/SyncCapability.ts';
import type { DecodedPatch } from '../../../../../src/domain/services/sync/syncPatchLoader.ts';
import { ACCEPTED_DUPLICATE_DOTS, CONFLICTING_REMOVE_OWNERS } from '../../../../helpers/SamePatchRemoveOwnershipCases.ts';

const SHA = 'a'.repeat(40);

/** A raw wire patch, as a peer's sync response carries it (records, not op classes). */
function wirePatch(ops: readonly object[]): DecodedPatch {
  // @ts-expect-error deliberate wire fixture: sync ingress receives raw op records, not op classes
  return { schema: 2, writer: 'peer', lamport: 1, context: {}, ops };
}

function response(patch: DecodedPatch): SyncResponse {
  return { type: 'sync-response', frontier: { peer: SHA }, patches: [{ writerId: 'peer', sha: SHA, patch }] };
}

function seededState() {
  return reducePatches([{
    patch: new Patch({ writer: 'local', lamport: 1, context: {}, ops: [new NodeAdd('kept', new Dot('local', 1))] }),
    sha: 'b'.repeat(40),
  }]);
}

function captureError(run: () => void): Error {
  try {
    run();
  } catch (err) {
    if (err instanceof Error) { return err; }
    throw err;
  }
  throw new PatchError('expected an error, but the call returned normally');
}

describe('sync ingress refuses malformed removes', () => {
  it('refuses a remove that lists a dot the same patch adds to a different element', () => {
    const state = seededState();
    const err = captureError(() => applySyncResponse(response(wirePatch([
      { type: 'NodeAdd', node: 'a', dot: { writerId: 'peer', counter: 1 } },
      { type: 'NodeRemove', node: 'b', observedDots: ['peer:1'] },
    ])), state, createFrontier()));
    expect(err).toBeInstanceOf(CrossOwnerRemoveError);
    expect(err).toBeInstanceOf(PatchError);
    expect(err).toMatchObject({ code: 'E_PATCH_CROSS_OWNER_REMOVE' });
    expect([...state.nodeAlive.elements()]).toEqual(['kept']);
  });

  it('refuses an ownerless remove and leaves the caller state unchanged', () => {
    const state = seededState();
    const err = captureError(() => applySyncResponse(response(wirePatch([
      { type: 'NodeRemove', observedDots: ['local:1'] },
    ])), state, createFrontier()));
    expect(err).toBeInstanceOf(PatchError);
    expect(err).toMatchObject({ code: 'E_PATCH_MALFORMED' });
    expect(state.nodeAlive.contains('kept')).toBe(true);
  });

  it('applies an owned empty-dot remove as a no-op', () => {
    const result = applySyncResponse(response(wirePatch([
      { type: 'NodeRemove', node: 'kept', observedDots: [] },
    ])), seededState(), createFrontier());
    expect(result.applied).toBe(1);
    expect(result.state.nodeAlive.contains('kept')).toBe(true);
  });

  it('accepts a remove of a dot that the same patch adds to the same element', () => {
    const result = applySyncResponse(response(wirePatch([
      { type: 'NodeAdd', node: 'a', dot: { writerId: 'peer', counter: 1 } },
      { type: 'NodeRemove', node: 'a', observedDots: ['peer:1'] },
    ])), createEmptyState(), createFrontier());
    expect(result.state.nodeAlive.contains('a')).toBe(false);
  });

  it('still refuses an unknown op type with SchemaUnsupportedError', () => {
    expect(() => applySyncResponse(response(wirePatch([
      { type: 'FutureOp', node: 'a' },
    ])), createEmptyState(), createFrontier())).toThrow(SchemaUnsupportedError);
  });

  // Small: refusal is response-wide, including when an earlier patch is valid.
  it.each(CONFLICTING_REMOVE_OWNERS)('sync refuses $name without changing caller state', ({ ops }) => {
    const state = seededState();
    const before = cloneState(state);
    const frontier = new Map([['local', 'b'.repeat(40)]]);
    const incoming: SyncResponse = {
      ...response(wirePatch(ops)),
      patches: [
        { writerId: 'peer', sha: 'c'.repeat(40), patch: wirePatch([
          { type: 'NodeAdd', node: 'transient', dot: { writerId: 'peer', counter: 1 } },
          { type: 'NodeRemove', node: 'kept', observedDots: ['local:1'] },
        ]) },
        { writerId: 'peer', sha: SHA, patch: wirePatch(ops) },
      ],
    };
    const error = captureError(() => applySyncResponse(incoming, state, frontier));
    expect(error).toBeInstanceOf(CrossOwnerRemoveError);
    expect(error).toMatchObject({ code: 'E_PATCH_CROSS_OWNER_REMOVE' });
    expect(state).toEqual(before);
    expect([...frontier]).toEqual([['local', 'b'.repeat(40)]]);
  });

  it.each(ACCEPTED_DUPLICATE_DOTS)('sync preserves acceptance: $name', ({ ops, liveNodes, liveEdges }) => {
    const result = applySyncResponse(response(wirePatch(ops)), createEmptyState(), createFrontier());
    expect(result.applied).toBe(1);
    expect([...result.state.nodeAlive.elements()].sort()).toEqual(liveNodes);
    expect([...result.state.edgeAlive.elements()].sort()).toEqual(liveEdges);
    expect([...result.frontier]).toEqual([['peer', SHA]]);
  });
});
