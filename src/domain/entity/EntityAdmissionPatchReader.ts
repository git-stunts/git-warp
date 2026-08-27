import type PatchEntry from '../artifacts/PatchEntry.ts';
import WarpError from '../errors/WarpError.ts';
import type Intent from '../api/Intent.ts';
import type EntityAdmissionBoundary from '../types/EntityAdmissionBoundary.ts';
import type EntityAdmissionOrigin from '../types/EntityAdmissionOrigin.ts';
import type Patch from '../types/Patch.ts';
import type { PatchOp } from '../types/ops/unions.ts';
import { EventId } from '../utils/EventId.ts';
import { intentFromEntityAdmissionBoundary } from './EntityAdmissionBoundaryIntent.ts';
import RetainedEntityAdmission from './RetainedEntityAdmission.ts';

/** Recovers every proven entity admission carried by one retained patch. */
export function entityAdmissionsFromPatch(
  entry: PatchEntry,
): readonly RetainedEntityAdmission[] {
  const boundaries = entry.patch.entityAdmissions;
  if (boundaries !== undefined) {
    return Object.freeze(boundaries.map((boundary) =>
      admissionFromBoundary(entry, boundary)));
  }
  if (hasLegacyEntityFootprint(entry.patch)) {
    throw legacyAmbiguityError();
  }
  return Object.freeze([]);
}

function admissionFromBoundary(
  entry: PatchEntry,
  boundary: EntityAdmissionBoundary,
): RetainedEntityAdmission {
  const retained = intentFromEntityAdmissionBoundary(entry.patch, boundary);
  return retainedAdmission({
    dot: retained.dot,
    entry,
    intent: retained.intent,
    operationIndex: boundary.operationIndex,
    origin: boundary.origin,
    subject: retained.subject,
  });
}

function hasLegacyEntityFootprint(patch: Patch): boolean {
  const leading = patch.ops[0];
  if (!isNodeAdd(leading)) {
    return false;
  }
  if (patch.ops.length <= 1) {
    return false;
  }
  if (hasPatchReads(patch)) {
    return false;
  }
  return isExclusiveSubjectWrite(patch.writes, leading.node);
}

function isNodeAdd(
  operation: PatchOp | undefined,
): operation is Extract<PatchOp, { readonly type: 'NodeAdd' }> {
  return operation !== undefined && operation.type === 'NodeAdd';
}

function hasPatchReads(patch: Patch): boolean {
  return patch.reads !== undefined && patch.reads.length > 0;
}

function isExclusiveSubjectWrite(
  writes: readonly string[] | undefined,
  subject: string,
): boolean {
  if (writes === undefined) {
    return false;
  }
  return writes.length === 1 && writes[0] === subject;
}

function retainedAdmission(options: {
  readonly dot: Extract<PatchOp, { readonly type: 'NodeAdd' }>['dot'];
  readonly entry: PatchEntry;
  readonly intent: Intent;
  readonly operationIndex: number;
  readonly origin: EntityAdmissionOrigin;
  readonly subject: string;
}): RetainedEntityAdmission {
  const { entry } = options;
  return new RetainedEntityAdmission({
    context: entry.patch.context,
    dot: options.dot,
    eventId: new EventId(
      entry.patch.lamport,
      entry.patch.writer,
      entry.sha,
      options.operationIndex,
    ),
    intent: options.intent,
    origin: options.origin,
    subject: options.subject,
  });
}

function legacyAmbiguityError(): WarpError {
  return new WarpError(
    'Unmarked whole-patch entity footprint cannot prove an entity admission',
    'E_ENTITY_ADMISSION_INVENTORY_LEGACY_AMBIGUOUS',
  );
}
