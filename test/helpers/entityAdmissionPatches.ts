import PatchEntry from '../../src/domain/artifacts/PatchEntry.ts';
import { Dot } from '../../src/domain/crdt/Dot.ts';
import { allocateEntitySubject } from '../../src/domain/services/PatchBuilderEntity.ts';
import EntityAdmissionBoundary from '../../src/domain/types/EntityAdmissionBoundary.ts';
import EntityAdmissionOrigin from '../../src/domain/types/EntityAdmissionOrigin.ts';
import NodeAdd from '../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../src/domain/types/ops/NodePropSet.ts';
import type { PatchOp } from '../../src/domain/types/ops/unions.ts';
import Patch from '../../src/domain/types/Patch.ts';

/** One entity a test patch admits: a supplied subject, or a subject allocated in `namespace`. */
export type AdmittedEntity = { readonly subject: string } | { readonly namespace: string };

type AdmissionPatchFields = {
  readonly writer: string;
  readonly lamport: number;
  readonly sha: string;
  readonly entities: readonly AdmittedEntity[];
  /** Counter of the first dot the patch mints; later entities take the next counters. */
  readonly firstCounter: number;
  readonly context?: Readonly<Record<string, number>>;
};

/** A patch whose `entity.add` admissions carry persisted boundaries, as PatchBuilder writes them. */
export function admissionPatch(fields: AdmissionPatchFields): PatchEntry {
  const ops: PatchOp[] = [];
  const boundaries: EntityAdmissionBoundary[] = [];
  fields.entities.forEach((entity, index) => {
    const dot = new Dot(fields.writer, fields.firstCounter + index);
    const { subject, origin } = 'subject' in entity
      ? { subject: entity.subject, origin: EntityAdmissionOrigin.suppliedSubject() }
      : { subject: allocateEntitySubject(entity.namespace, dot), origin: EntityAdmissionOrigin.allocated(entity.namespace, dot) };
    boundaries.push(new EntityAdmissionBoundary({ operationIndex: ops.length, operationCount: 2, origin }));
    ops.push(new NodeAdd(subject, dot), new NodePropSet(subject, 'body', `${subject}@${fields.sha.slice(0, 6)}`));
  });
  const patch = new Patch({
    writer: fields.writer, lamport: fields.lamport, context: fields.context ?? {}, ops, entityAdmissions: boundaries,
  });
  return new PatchEntry({ patch, sha: fields.sha });
}

/** An unmarked v19.1-shaped entity patch, whose admission the inventory cannot prove. */
export function unmarkedEntityPatch(fields: { readonly writer: string; readonly lamport: number; readonly sha: string; readonly counter: number }): PatchEntry {
  const subject = `legacy:${fields.sha.slice(0, 6)}`;
  const patch = new Patch({
    writer: fields.writer,
    lamport: fields.lamport,
    context: {},
    ops: [new NodeAdd(subject, new Dot(fields.writer, fields.counter)), new NodePropSet(subject, 'body', 'legacy')],
    reads: [],
    writes: [subject],
  });
  return new PatchEntry({ patch, sha: fields.sha });
}
