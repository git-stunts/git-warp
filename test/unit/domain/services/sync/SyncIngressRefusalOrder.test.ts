/**
 * Sync ingress refuses a malformed patch with the typed error of the first
 * check that the patch fails (#1116 safety review, F3).
 *
 * Oracle: the `Patch` constructor contract (`E_PATCH_OPS` when `ops` is not
 * an array, `src/domain/types/Patch.ts`), and the error classes that
 * `applySyncResponse` gave for the same responses at the #1116 merge base
 * `dd75d0d5f`, before sync ingress hydrated ops.
 */

import { describe, expect, it } from 'vitest';
import { applySyncResponse } from '../../../../../src/domain/services/sync/SyncProtocol.ts';
import { cloneState, reducePatches } from '../../../../../src/domain/services/JoinReducer.ts';
import { createFrontier } from '../../../../../src/domain/services/Frontier.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import PatchError from '../../../../../src/domain/errors/PatchError.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import type { SyncResponse } from '../../../../../src/domain/capabilities/SyncCapability.ts';
import type { DecodedPatch } from '../../../../../src/domain/services/sync/syncPatchLoader.ts';

const SHA = 'a'.repeat(40);

type WireOps = readonly object[] | object | string | number | null | undefined;

/** A raw wire patch, as a peer's sync response carries it. */
function wirePatch(ops: WireOps, writer = 'peer'): DecodedPatch {
  // @ts-expect-error deliberate wire fixture: a peer can send any value as `ops`
  return { schema: 2, writer, lamport: 1, context: {}, ops };
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

describe('sync ingress refuses ops that are not an array', () => {
  it.each([
    { name: 'absent ops', ops: undefined },
    { name: 'null ops', ops: null },
    { name: 'an object', ops: { type: 'NodeAdd', node: 'a' } },
    { name: 'a string', ops: 'NodeAdd' },
    { name: 'a number', ops: 7 },
  ])('refuses $name with PatchError E_PATCH_OPS and leaves the caller state unchanged', ({ ops }) => {
    const state = seededState();
    const before = cloneState(state);
    const err = captureError(() => applySyncResponse(response(wirePatch(ops)), state, createFrontier()));
    expect(err).toBeInstanceOf(PatchError);
    expect(err).toMatchObject({ code: 'E_PATCH_OPS' });
    expect(state).toEqual(before);
  });
});
