import Intent from '../api/Intent.ts';
import { bindRetainedEntityIntent } from '../api/RetainedEntityIntentRuntime.ts';
import WarpError from '../errors/WarpError.ts';
import type EntityAdmissionBoundary from '../types/EntityAdmissionBoundary.ts';
import type Patch from '../types/Patch.ts';
import { isPropValue, type PropValue } from '../types/PropValue.ts';
import type { PatchOp } from '../types/ops/unions.ts';
import { allocateEntitySubject } from '../services/PatchBuilderEntity.ts';

export type RetainedEntityBoundaryIntent = Readonly<{
  dot: Extract<PatchOp, { readonly type: 'NodeAdd' }>['dot'];
  intent: Intent;
  subject: string;
}>;

/** Reconstructs the exact entity Intent proven by one validated boundary. */
export function intentFromEntityAdmissionBoundary(
  patch: Patch,
  boundary: EntityAdmissionBoundary,
): RetainedEntityBoundaryIntent {
  const leading = requireLeadingNode(patch.ops[boundary.operationIndex]);
  requireAllocationOrigin(boundary, leading);
  const end = boundary.operationIndex + boundary.operationCount;
  const properties = propertiesFrom(
    leading.node,
    patch.ops.slice(boundary.operationIndex + 1, end),
  );
  const intent = bindRetainedEntityIntent(Intent.addEntity({
    subject: leading.node,
    properties,
  }), boundary.origin);
  return Object.freeze({ dot: leading.dot, intent, subject: leading.node });
}

function requireAllocationOrigin(
  boundary: EntityAdmissionBoundary,
  leading: Extract<PatchOp, { readonly type: 'NodeAdd' }>,
): void {
  if (boundary.origin.kind !== 'allocated') {
    return;
  }
  const { namespace } = boundary.origin;
  if (
    namespace === null
    || allocateEntitySubject(namespace, leading.dot) !== leading.node
  ) {
    throw retainedBoundaryError(
      'Allocated entity admission subject does not match its namespace and dot',
    );
  }
}

function propertiesFrom(
  subject: string,
  operations: readonly PatchOp[],
): Readonly<Record<string, PropValue>> {
  const properties = new Map<string, PropValue>();
  for (const operation of operations) {
    const property = requirePropertyForSubject(operation, subject);
    if (!isEntityPropertyValue(property.value)) {
      throw retainedBoundaryError('Entity admission payload has an invalid property value');
    }
    properties.set(property.key, property.value);
  }
  return Object.fromEntries(properties);
}

function requireLeadingNode(
  operation: PatchOp | undefined,
): Extract<PatchOp, { readonly type: 'NodeAdd' }> {
  if (operation?.type !== 'NodeAdd') {
    throw retainedBoundaryError('Entity admission boundary lost its NodeAdd');
  }
  return operation;
}

function requirePropertyForSubject(
  operation: PatchOp,
  subject: string,
): Extract<PatchOp, { readonly type: 'NodePropSet' | 'PropSet' }> {
  if (operation.type !== 'NodePropSet' && operation.type !== 'PropSet') {
    throw retainedBoundaryError('Entity admission boundary has a non-property payload');
  }
  if (operation.node !== subject) {
    throw retainedBoundaryError('Entity admission boundary crossed its created subject');
  }
  return operation;
}

function isEntityPropertyValue(value: unknown): value is PropValue {
  return isPropValue(value);
}

function retainedBoundaryError(message: string): WarpError {
  return new WarpError(message, 'E_DRAFT_INTENT_HYDRATION');
}
