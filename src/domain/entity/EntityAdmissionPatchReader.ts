import type PatchEntry from '../artifacts/PatchEntry.ts';
import WarpError from '../errors/WarpError.ts';
import Intent, { type IntentDescriptor } from '../api/Intent.ts';
import { intentFromPatch } from '../api/IntentRuntime.ts';
import type { EntityCapturePayload } from '../types/EntityCapturePayload.ts';
import type EntityAdmissionBoundary from '../types/EntityAdmissionBoundary.ts';
import EntityAdmissionOrigin from '../types/EntityAdmissionOrigin.ts';
import type Patch from '../types/Patch.ts';
import { isPropValue, type PropValue } from '../types/PropValue.ts';
import type { PatchOp } from '../types/ops/unions.ts';
import { EventId } from '../utils/EventId.ts';
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
  const leading = entry.patch.ops[boundary.operationIndex];
  if (leading?.type !== 'NodeAdd') {
    throw retainedError('Validated entity boundary lost its NodeAdd');
  }
  const end = boundary.operationIndex + boundary.operationCount;
  return retainedAdmission({
    entry,
    operationIndex: boundary.operationIndex,
    origin: boundary.origin,
    properties: propertiesFrom(
      leading.node,
      entry.patch.ops.slice(boundary.operationIndex + 1, end),
    ),
    subject: leading.node,
    dot: leading.dot,
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
    entry,
    operationIndex: 0,
    origin: EntityAdmissionOrigin.legacyUnrecorded(),
    properties: descriptor.properties,
    subject: descriptor.subject,
    dot: leading.dot,
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

function propertiesFrom(
  subject: string,
  operations: readonly PatchOp[],
): EntityCapturePayload {
  const properties = new Map<string, PropValue>();
  for (const operation of operations) {
    const property = requirePropertyForSubject(operation, subject);
    if (!isEntityPropertyValue(property.value)) {
      throw retainedError('Entity admission payload contains an invalid property value');
    }
    properties.set(property.key, property.value);
  }
  const { descriptor } = Intent.addEntity({
    subject,
    properties: Object.fromEntries(properties),
  });
  if (descriptor.kind !== 'entity.add') {
    throw retainedError('Entity admission payload did not construct an entity Intent');
  }
  return descriptor.properties;
}

function requirePropertyForSubject(
  operation: PatchOp,
  subject: string,
): Extract<PatchOp, { readonly type: 'NodePropSet' | 'PropSet' }> {
  if (operation.type !== 'NodePropSet' && operation.type !== 'PropSet') {
    throw retainedError('Entity admission boundary contains an invalid payload operation');
  }
  if (operation.node !== subject) {
    throw retainedError('Entity admission boundary contains an invalid payload operation');
  }
  return operation;
}

function isEntityPropertyValue(value: unknown): value is PropValue {
  return isPropValue(value);
}

function retainedAdmission(options: {
  readonly entry: PatchEntry;
  readonly operationIndex: number;
  readonly origin: EntityAdmissionOrigin;
  readonly properties: EntityCapturePayload;
  readonly subject: string;
  readonly dot: Extract<PatchOp, { readonly type: 'NodeAdd' }>['dot'];
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
    origin: options.origin,
    properties: options.properties,
    subject: options.subject,
  });
}

function retainedError(message: string): WarpError {
  return new WarpError(message, 'E_ENTITY_ADMISSION_RETAINED');
}
