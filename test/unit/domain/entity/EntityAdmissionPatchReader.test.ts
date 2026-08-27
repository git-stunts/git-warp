import { describe, expect, it } from 'vitest';

import PatchEntry from '../../../../src/domain/artifacts/PatchEntry.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { entityAdmissionsFromPatch } from '../../../../src/domain/entity/EntityAdmissionPatchReader.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import EntityAdmissionBoundary from '../../../../src/domain/types/EntityAdmissionBoundary.ts';
import EntityAdmissionOrigin from '../../../../src/domain/types/EntityAdmissionOrigin.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../src/domain/types/ops/NodePropSet.ts';

const PATCH_SHA = 'a'.repeat(40);

describe('EntityAdmissionPatchReader', () => {
  it('fails closed for an ambiguous unmarked whole-patch footprint', () => {
    expect(() => entityAdmissionsFromPatch(entry(legacyEntityPatch())))
      .toThrowError(expect.objectContaining({
        code: 'E_ENTITY_ADMISSION_INVENTORY_LEGACY_AMBIGUOUS',
      }));
  });

  it('treats a present empty v19.2 marker as proof of no entity admission', () => {
    const manual = legacyEntityPatch({ entityAdmissions: [] });

    expect(entityAdmissionsFromPatch(entry(manual))).toEqual([]);
    expect(manual.entityAdmissions).toEqual([]);
  });

  it('does not guess from non-entity legacy operation shapes', () => {
    const nodeOnly = new Patch({
      schema: 2,
      writer: 'writer-a',
      lamport: 1,
      context: {},
      ops: [new NodeAdd('capture:node-only', Dot.create('writer-a', 1))],
      reads: [],
      writes: ['capture:node-only'],
    });

    expect(entityAdmissionsFromPatch(entry(nodeOnly))).toEqual([]);
  });

  it('does not classify an unhydrated NodeAdd tag as a retained admission', () => {
    const rawTagged = new Patch({
      schema: 2,
      writer: 'writer-a',
      lamport: 1,
      context: {},
      ops: [
        // @ts-expect-error Exercise the JavaScript hydration boundary.
        { type: 'NodeAdd', node: 'capture:raw', dot: Dot.create('writer-a', 1) },
        new NodePropSet('capture:raw', 'body', 'not hydrated'),
      ],
      reads: [],
      writes: ['capture:raw'],
    });

    expect(entityAdmissionsFromPatch(entry(rawTagged))).toEqual([]);
  });

  it('rejects allocated origin metadata for an unrelated subject', () => {
    const forged = new Patch({
      schema: 2,
      writer: 'writer-a',
      lamport: 1,
      context: {},
      ops: [
        new NodeAdd('capture:forged', Dot.create('writer-a', 1)),
        new NodePropSet('capture:forged', 'body', 'retained'),
      ],
      writes: ['capture:forged'],
      entityAdmissions: [new EntityAdmissionBoundary({
        operationIndex: 0,
        operationCount: 2,
        origin: EntityAdmissionOrigin.allocated(
          'capture',
          Dot.create('writer-a', 1),
        ),
      })],
    });

    expect(() => entityAdmissionsFromPatch(entry(forged)))
      .toThrowError(expect.objectContaining({ code: 'E_DRAFT_INTENT_HYDRATION' }));
  });
});

function legacyEntityPatch(options: {
  readonly entityAdmissions?: [];
} = {}): Patch {
  return new Patch({
    schema: 2,
    writer: 'writer-a',
    lamport: 1,
    context: {},
    ops: [
      new NodeAdd('capture:legacy', Dot.create('writer-a', 1)),
      new NodePropSet('capture:legacy', 'body', 'retained'),
    ],
    reads: [],
    writes: ['capture:legacy'],
    ...options,
  });
}

function entry(patch: Patch): PatchEntry {
  return new PatchEntry({ patch, sha: PATCH_SHA });
}
