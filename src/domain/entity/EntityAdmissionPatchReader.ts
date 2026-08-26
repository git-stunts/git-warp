import type PatchEntry from '../artifacts/PatchEntry.ts';
import WarpError from '../errors/WarpError.ts';
import type { default as Intent, IntentDescriptor } from '../api/Intent.ts';
import { intentFromPatch } from '../api/IntentRuntime.ts';
import { bindRetainedEntityIntent } from '../api/RetainedEntityIntentRuntime.ts';
import type EntityAdmissionBoundary from '../types/EntityAdmissionBoundary.ts';
import EntityAdmissionOrigin from '../types/EntityAdmissionOrigin.ts';
import type Patch from '../types/Patch.ts';
import type { PatchOp } from '../types/ops/unions.ts';
import { EventId } from '../utils/EventId.ts';
import { intentFromEntityAdmissionBoundary } from './EntityAdmissionBoundaryIntent.ts';
import RetainedEntityAdmission from './RetainedEntityAdmission.ts';

type SuppliedEntityDescriptor = Extract<
  IntentDescriptor,
  { readonly kind: 'entity.add'; readonly subject: string }
>;

/** Recovers every proven entity admission carried by one retained patch. */
export function entityAdmissionsFromPatch(
  entry: PatchEntry,
): readonly RetainedEntityAdmission[] {
  const boundaries = entry.patch.entityAdmissions;
  if (boundaries !== undefined) {
    return Object.freeze(boundaries.map((boundary) =>
      admissionFromBoundary(entry, boundary)));
  }
  const legacy = legacyEntityAdmission(entry);
  return legacy === null ? Object.freeze([]) : Object.freeze([legacy]);
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

function legacyEntityAdmission(entry: PatchEntry): RetainedEntityAdmission | null {
  if (!hasLegacyEntityFootprint(entry.patch)) {
    return null;
  }
  const intent = intentFromPatch(entry.patch);
  const descriptor = requireSuppliedEntityDescriptor(intent.descriptor);
  const leading = requireLegacyLeadingNode(entry.patch.ops[0]);
  return retainedAdmission({
    dot: leading.dot,
    entry,
    intent: bindRetainedEntityIntent(
      intent,
      EntityAdmissionOrigin.legacyUnrecorded(),
    ),
    operationIndex: 0,
    origin: EntityAdmissionOrigin.legacyUnrecorded(),
    subject: descriptor.subject,
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

function requireSuppliedEntityDescriptor(
  descriptor: IntentDescriptor,
): SuppliedEntityDescriptor {
  if (descriptor.kind !== 'entity.add') {
    throw retainedError('Legacy entity footprint did not recover an entity Intent');
  }
  if (!('subject' in descriptor)) {
    throw retainedError('Legacy entity footprint did not recover an entity Intent');
  }
  return descriptor;
}

function requireLegacyLeadingNode(
  operation: PatchOp | undefined,
): Extract<PatchOp, { readonly type: 'NodeAdd' }> {
  if (operation?.type !== 'NodeAdd') {
    throw retainedError('Legacy entity admission lost its NodeAdd');
  }
  return operation;
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

function retainedError(message: string): WarpError {
  return new WarpError(message, 'E_ENTITY_ADMISSION_RETAINED');
}
