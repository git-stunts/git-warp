import PatchError from '../errors/PatchError.ts';
import { isPropValue } from './PropValue.ts';
import EntityAdmissionBoundary from './EntityAdmissionBoundary.ts';
import type { PatchOp } from './ops/unions.ts';

/** Validates and snapshots retained entity boundaries against their operations. */
export function freezeEntityAdmissionBoundaries(
  boundaries: readonly EntityAdmissionBoundary[] | undefined,
  operations: readonly PatchOp[],
): readonly EntityAdmissionBoundary[] | undefined {
  if (boundaries === undefined) {
    return undefined;
  }
  const snapshot = requireBoundaryArray(boundaries);
  if (snapshot.length === 0) {
    return Object.freeze(snapshot);
  }
  validateBoundarySequence(snapshot, operations);
  return Object.freeze(snapshot);
}

function requireBoundaryArray(
  value: readonly EntityAdmissionBoundary[],
): EntityAdmissionBoundary[] {
  const typedValue: readonly EntityAdmissionBoundary[] = value;
  if (!Array.isArray(value)) {
    throw boundaryError('Patch entity admissions must be an array');
  }
  return typedValue.map(requireBoundary);
}

function requireBoundary(value: EntityAdmissionBoundary): EntityAdmissionBoundary {
  if (!(value instanceof EntityAdmissionBoundary)) {
    throw boundaryError('Patch entity admission must be a validated boundary');
  }
  return value;
}

function validateBoundarySequence(
  boundaries: readonly EntityAdmissionBoundary[],
  operations: readonly PatchOp[],
): void {
  let previousEnd = 0;
  for (const [index, boundary] of boundaries.entries()) {
    requireNonOverlappingBoundary(boundary, index, previousEnd);
    previousEnd = validateBoundaryOperations(boundary, operations);
  }
}

function requireNonOverlappingBoundary(
  boundary: EntityAdmissionBoundary,
  index: number,
  previousEnd: number,
): void {
  if (index > 0 && boundary.operationIndex < previousEnd) {
    throw boundaryError('Patch entity admission boundaries cannot overlap or reorder');
  }
}

function validateBoundaryOperations(
  boundary: EntityAdmissionBoundary,
  operations: readonly PatchOp[],
): number {
  const end = boundary.operationIndex + boundary.operationCount;
  if (end > operations.length) {
    throw boundaryError('Entity admission boundary extends beyond its patch');
  }
  const leading = requireLeadingNode(operations[boundary.operationIndex]);
  const keys = new Set<string>();
  for (let index = boundary.operationIndex + 1; index < end; index += 1) {
    const operation = requireAdmissionProperty(operations[index], leading.node);
    requireUniquePropertyKey(keys, operation.key);
    keys.add(operation.key);
  }
  return end;
}

function requireLeadingNode(
  operation: PatchOp | undefined,
): Extract<PatchOp, { readonly type: 'NodeAdd' }> {
  if (operation?.type !== 'NodeAdd') {
    throw boundaryError('Entity admission boundary must begin with NodeAdd');
  }
  return operation;
}

function requireAdmissionProperty(
  operation: PatchOp | undefined,
  subject: string,
): Extract<PatchOp, { readonly type: 'NodePropSet' | 'PropSet' }> {
  const property = requirePropertyOperation(operation);
  if (property.node !== subject) {
    throw boundaryError('Entity admission payload must write only its created subject');
  }
  if (!isPropValue(property.value)) {
    throw boundaryError('Entity admission payload contains an invalid property value');
  }
  return property;
}

function requirePropertyOperation(
  operation: PatchOp | undefined,
): Extract<PatchOp, { readonly type: 'NodePropSet' | 'PropSet' }> {
  if (operation === undefined) {
    throw boundaryError('Entity admission payload must write only its created subject');
  }
  if (operation.type !== 'NodePropSet' && operation.type !== 'PropSet') {
    throw boundaryError('Entity admission payload must write only its created subject');
  }
  return operation;
}

function requireUniquePropertyKey(keys: ReadonlySet<string>, key: string): void {
  if (keys.has(key)) {
    throw boundaryError('Entity admission payload cannot repeat a property key');
  }
}

function boundaryError(message: string): PatchError {
  return new PatchError(message, { code: 'E_PATCH_ENTITY_ADMISSION_BOUNDARY' });
}
