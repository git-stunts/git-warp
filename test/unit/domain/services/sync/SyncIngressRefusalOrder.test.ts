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
import SchemaUnsupportedError from '../../../../../src/domain/errors/SchemaUnsupportedError.ts';
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

const OTHER_SHA = 'c'.repeat(40);
const LOCAL_FRONTIER: ReadonlyArray<[string, string]> = [['local', 'b'.repeat(40)]];

/**
 * A response whose first patch, from writer `other`, is valid. `applySyncResponse`
 * applies it and advances `other` before it reaches `patch`, so a refusal of `patch`
 * leaves the caller's state and frontier unchanged only if it works on copies.
 */
function responseAfterValidPatch(patch: DecodedPatch): SyncResponse {
  const valid = wirePatch([{ type: 'NodeAdd', node: 'transient', dot: { writerId: 'other', counter: 1 } }], 'other');
  return {
    type: 'sync-response',
    frontier: { other: OTHER_SHA, peer: SHA },
    patches: [{ writerId: 'other', sha: OTHER_SHA, patch: valid }, { writerId: 'peer', sha: SHA, patch }],
  };
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

describe('sync ingress checks op types before it hydrates ops', () => {
  it.each([
    { name: 'before a NodeAdd without a dot', ops: [{ type: 'FutureOp', node: 'a' }, { type: 'NodeAdd', node: 'a' }] },
    { name: 'after a NodeAdd without a dot', ops: [{ type: 'NodeAdd', node: 'a' }, { type: 'FutureOp', node: 'a' }] },
    { name: 'before an ownerless remove', ops: [{ type: 'FutureOp', node: 'a' }, { type: 'NodeRemove', observedDots: [] }] },
  ])('refuses an unrecognised op type $name with SchemaUnsupportedError', ({ ops }) => {
    const state = seededState();
    const before = cloneState(state);
    const err = captureError(() => applySyncResponse(response(wirePatch(ops)), state, createFrontier()));
    expect(err).toBeInstanceOf(SchemaUnsupportedError);
    expect(state).toEqual(before);
  });

  // Canonical-only op types never appear on the wire; the guard refuses them whatever their fields hold.
  it.each([
    { name: 'a well-formed NodePropSet', op: { type: 'NodePropSet', node: 'a', key: 'k', value: 1 } },
    { name: 'a NodePropSet with an empty key', op: { type: 'NodePropSet', node: 'a', key: '', value: 1 } },
    { name: 'a NodePropSet with a NUL in its key', op: { type: 'NodePropSet', node: 'a', key: 'k\0', value: 1 } },
    { name: 'a NodePropSet with an empty node', op: { type: 'NodePropSet', node: '', key: 'k', value: 1 } },
    { name: 'an EdgePropSet with an empty key', op: { type: 'EdgePropSet', from: 'a', to: 'b', label: 'l', key: '', value: 1 } },
  ])('refuses $name with SchemaUnsupportedError and leaves state and frontier unchanged', ({ op }) => {
    const state = seededState();
    const before = cloneState(state);
    const frontier = new Map(LOCAL_FRONTIER);
    const err = captureError(() => applySyncResponse(responseAfterValidPatch(wirePatch([op])), state, frontier));
    expect(err).toBeInstanceOf(SchemaUnsupportedError);
    expect(state).toEqual(before);
    expect([...frontier]).toEqual(LOCAL_FRONTIER);
  });

  // A remove that lists a dot the same patch adds to a different element. #1116 refused
  // such a patch with CrossOwnerRemoveError even when it also carried a type the guard refuses.
  const crossOwner = [
    { type: 'NodeAdd', node: 'a', dot: { writerId: 'peer', counter: 1 } },
    { type: 'NodeRemove', node: 'b', observedDots: ['peer:1'] },
  ];
  it.each([
    { name: 'an unrecognised op after it', ops: [...crossOwner, { type: 'FutureOp', node: 'a' }] },
    { name: 'an unrecognised op before it', ops: [{ type: 'FutureOp', node: 'a' }, ...crossOwner] },
    { name: 'a canonical-only op after it', ops: [...crossOwner, { type: 'NodePropSet', node: 'a', key: 'k', value: 1 }] },
  ])('refuses a cross-owner remove with $name with SchemaUnsupportedError, state and frontier unchanged', ({ ops }) => {
    const state = seededState();
    const before = cloneState(state);
    const frontier = new Map(LOCAL_FRONTIER);
    const err = captureError(() => applySyncResponse(responseAfterValidPatch(wirePatch(ops)), state, frontier));
    expect(err).toBeInstanceOf(SchemaUnsupportedError);
    expect(state).toEqual(before);
    expect([...frontier]).toEqual(LOCAL_FRONTIER);
  });

  it('checks the patch writer before op types, as it did before #1116', () => {
    const err = captureError(() => applySyncResponse(
      response(wirePatch([{ type: 'FutureOp', node: 'a' }], '')),
      seededState(),
      createFrontier(),
    ));
    expect(err).toBeInstanceOf(PatchError);
    expect(err).toMatchObject({ code: 'E_PATCH_WRITER' });
  });
});
