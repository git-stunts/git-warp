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
  it('recovers a released v19.1 whole-patch entity as legacy-unrecorded', () => {
    const admissions = entityAdmissionsFromPatch(entry(legacyEntityPatch()));

    expect(admissions).toHaveLength(1);
    expect(admissions[0]).toMatchObject({
      subject: 'capture:legacy',
      origin: { kind: 'legacy-unrecorded', namespace: null },
      eventId: {
        patchSha: PATCH_SHA,
        opIndex: 0,
        writerId: 'writer-a',
      },
    });
    expect(admissions[0]?.intent.descriptor).toMatchObject({
      kind: 'entity.add',
      subject: 'capture:legacy',
      properties: { body: 'retained' },
    });
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
        origin: EntityAdmissionOrigin.allocated('capture'),
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
