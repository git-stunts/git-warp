import type { PatchBuilder } from '../services/PatchBuilder.ts';
import type Patch from '../types/Patch.ts';
import { isPropValue, type PropValue } from '../types/PropValue.ts';
import Intent, { type IntentDescriptor, type IntentKind } from './Intent.ts';
import WarpError from '../errors/WarpError.ts';
import type { PatchOp } from '../types/ops/unions.ts';
import type EntityAdmissionOrigin from '../types/EntityAdmissionOrigin.ts';
import { findRetainedEntityIntentOrigin } from './RetainedEntityIntentRuntime.ts';
import { intentFromEntityAdmissionBoundary } from '../entity/EntityAdmissionBoundaryIntent.ts';

type IntentLowerer = (descriptor: IntentDescriptor, patch: PatchBuilder) => void;

const lowerers: ReadonlyMap<IntentKind, IntentLowerer> = new Map([
  ['node.add', lowerNodeAdd],
  ['node.remove', lowerNodeRemove],
  ['edge.add', lowerEdgeAdd],
  ['edge.remove', lowerEdgeRemove],
  ['property.set', lowerPropertySet],
  ['entity.add', lowerEntityAdd],
]);

export function applyIntentToPatch(intent: Intent, patch: PatchBuilder): void {
  const { descriptor } = intent;
  const retainedOrigin = findRetainedEntityIntentOrigin(intent);
  if (retainedOrigin !== null) {
    lowerRetainedEntity(descriptor, retainedOrigin, patch);
    return;
  }
  const lowerer = lowerers.get(intent.kind);
  if (lowerer === undefined) {
    throw new WarpError('Intent kind is unsupported', 'E_INTENT_KIND');
  }
  lowerer(descriptor, patch);
}

function lowerRetainedEntity(
  descriptor: IntentDescriptor,
  origin: EntityAdmissionOrigin,
  patch: PatchBuilder,
): void {
  assertDescriptorKind(descriptor, 'entity.add');
  if (!('subject' in descriptor)) {
    throw hydrationError('retained entity Intent requires its original subject');
  }
  patch.addRetainedEntity(descriptor.subject, descriptor.properties, origin);
}

export function intentFromPatch(patch: Patch): Intent {
  const terminal = requireTerminalOperation(patch);
  if (isCascadingNodeRemoval(patch.ops, terminal)) {
    return Intent.removeNode({ subject: terminal.node });
  }
  const entity = entityIntent(patch);
  if (entity !== null) {
    return entity;
  }
  if (patch.ops.length !== 1) {
    throw hydrationError('persisted Runtime intent patch has multiple operations');
  }
  return intentFromOperation(terminal);
}

function requireTerminalOperation(patch: Patch): PatchOp {
  const terminal = patch.ops.at(-1);
  if (terminal === undefined) {
    throw hydrationError('persisted Runtime intent patch has no operations');
  }
  return terminal;
}

function isCascadingNodeRemoval(
  operations: readonly PatchOp[],
  terminal: PatchOp
): terminal is Extract<PatchOp, { readonly type: 'NodeRemove' }> {
  return (
    terminal.type === 'NodeRemove' &&
    operations
      .slice(0, -1)
      .every(
        (operation) =>
          operation.type === 'EdgeRemove' &&
          (operation.from === terminal.node || operation.to === terminal.node)
      )
  );
}

/**
 * Recovers an entity capture: one NodeAdd carrying its own payload.
 *
 * Operation shape alone is not sufficient evidence. The patch must also
 * declare the entity-capture footprint — an empty read set and a write set that
 * is exactly the created subject — because a legacy `PropSet` sequence can
 * present the same operations while recording a self-read. This recognition is
 * syntactic classification only; it does not prove that application code made
 * no prior graph read before constructing the patch payload. A patch whose
 * recorded footprint does not match is not recognised here and falls through
 * to the one-operation rule.
 */
function entityIntent(patch: Patch): Intent | null {
  if (patch.entityAdmissions !== undefined) {
    return markedWholePatchEntityIntent(patch);
  }
  const [leading, ...payload] = patch.ops;
  if (leading === undefined || leading.type !== 'NodeAdd') {
    return null;
  }
  return entityIntentFor(patch, leading.node, payload);
}

function markedWholePatchEntityIntent(patch: Patch): Intent | null {
  const boundary = patch.entityAdmissions?.[0];
  if (boundary === undefined || patch.entityAdmissions?.length !== 1) {
    return null;
  }
  if (boundary.operationIndex !== 0 || boundary.operationCount !== patch.ops.length) {
    return null;
  }
  return intentFromEntityAdmissionBoundary(patch, boundary).intent;
}

function entityIntentFor(
  patch: Patch,
  subject: string,
  payload: readonly PatchOp[]
): Intent | null {
  if (payload.length === 0 || !declaresEntityFootprint(patch, subject)) {
    return null;
  }
  const properties = entityPayload(subject, payload);
  return properties === null ? null : Intent.addEntity({ subject, properties });
}

/** Whether the patch records reads {} and writes exactly {subject}. */
function declaresEntityFootprint(patch: Patch, subject: string): boolean {
  const writes = patch.writes ?? [];
  return (patch.reads ?? []).length === 0 && writes.length === 1 && writes[0] === subject;
}

function entityPayload(
  subject: string,
  payload: readonly PatchOp[]
): Record<string, PropValue> | null {
  const properties = new Map<string, PropValue>();
  for (const operation of payload) {
    if (!isNodePropertyOperation(operation) || operation.node !== subject) {
      return null;
    }
    admitEntityProperty(properties, operation);
  }
  return nullPrototypePropertyMap(properties);
}

function admitEntityProperty(
  properties: Map<string, PropValue>,
  operation: Extract<PatchOp, { readonly type: 'NodePropSet' | 'PropSet' }>
): void {
  if (properties.has(operation.key)) {
    throw hydrationError(
      'persisted Runtime entity Intent sets the same property key more than once'
    );
  }
  if (!isPropValue(operation.value)) {
    throw hydrationError('persisted Runtime entity Intent has an invalid value');
  }
  properties.set(operation.key, operation.value);
}

function nullPrototypePropertyMap(
  entries: Iterable<readonly [string, PropValue]>
): Record<string, PropValue> {
  const properties: Record<string, PropValue> = Object.fromEntries(entries);
  Object.setPrototypeOf(properties, null);
  return properties;
}

function isNodePropertyOperation(
  operation: PatchOp
): operation is Extract<PatchOp, { readonly type: 'NodePropSet' | 'PropSet' }> {
  return operation.type === 'NodePropSet' || operation.type === 'PropSet';
}

export function intentFromOperation(operation: PatchOp): Intent {
  const node = nodeIntent(operation);
  if (node !== null) {
    return node;
  }
  const edge = edgeIntent(operation);
  if (edge !== null) {
    return edge;
  }
  const property = propertyIntent(operation);
  if (property !== null) {
    return property;
  }
  throw hydrationError(
    `persisted Runtime intent patch uses unsupported operation ${operation.type}`
  );
}

function nodeIntent(operation: PatchOp): Intent | null {
  if (operation.type === 'NodeAdd') {
    return Intent.addNode({ subject: operation.node });
  }
  return operation.type === 'NodeRemove' ? Intent.removeNode({ subject: operation.node }) : null;
}

function edgeIntent(operation: PatchOp): Intent | null {
  if (operation.type !== 'EdgeAdd' && operation.type !== 'EdgeRemove') {
    return null;
  }
  const fields = {
    from: operation.from,
    to: operation.to,
    label: operation.label,
  };
  return operation.type === 'EdgeAdd' ? Intent.addEdge(fields) : Intent.removeEdge(fields);
}

function propertyIntent(operation: PatchOp): Intent | null {
  if (operation.type !== 'NodePropSet' && operation.type !== 'PropSet') {
    return null;
  }
  if (!isPropValue(operation.value)) {
    throw hydrationError('persisted Runtime property Intent has an invalid value');
  }
  return Intent.setProperty({
    subject: operation.node,
    key: operation.key,
    value: operation.value,
  });
}

function hydrationError(message: string): WarpError {
  return new WarpError(message, 'E_DRAFT_INTENT_HYDRATION');
}

function lowerNodeAdd(descriptor: IntentDescriptor, patch: PatchBuilder): void {
  assertDescriptorKind(descriptor, 'node.add');
  patch.addNode(descriptor.subject);
}

function lowerNodeRemove(descriptor: IntentDescriptor, patch: PatchBuilder): void {
  assertDescriptorKind(descriptor, 'node.remove');
  patch.removeNode(descriptor.subject);
}

function lowerEdgeAdd(descriptor: IntentDescriptor, patch: PatchBuilder): void {
  assertDescriptorKind(descriptor, 'edge.add');
  patch.addEdge(descriptor.from, descriptor.to, descriptor.label);
}

function lowerEdgeRemove(descriptor: IntentDescriptor, patch: PatchBuilder): void {
  assertDescriptorKind(descriptor, 'edge.remove');
  patch.removeEdge(descriptor.from, descriptor.to, descriptor.label);
}

function lowerPropertySet(descriptor: IntentDescriptor, patch: PatchBuilder): void {
  assertDescriptorKind(descriptor, 'property.set');
  patch.setProperty(descriptor.subject, descriptor.key, descriptor.value);
}

function lowerEntityAdd(descriptor: IntentDescriptor, patch: PatchBuilder): void {
  assertDescriptorKind(descriptor, 'entity.add');
  if ('subject' in descriptor) {
    patch.addEntity(descriptor.subject, descriptor.properties);
    return;
  }
  patch.addEntityAuto(descriptor.namespace, descriptor.properties);
}

function assertDescriptorKind<K extends IntentKind>(
  descriptor: IntentDescriptor,
  kind: K
): asserts descriptor is Extract<IntentDescriptor, { readonly kind: K }> {
  if (descriptor.kind !== kind) {
    throw new WarpError('Intent lowerer received a mismatched descriptor', 'E_INTENT_KIND');
  }
}
