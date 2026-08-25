import type { Dot } from '../crdt/Dot.ts';
import WarpError from '../errors/WarpError.ts';
import { allocateEntitySubject } from '../services/PatchBuilderEntity.ts';
import type { EntityCapturePayload } from '../types/EntityCapturePayload.ts';
import type Patch from '../types/Patch.ts';
import { isPropValue, propValuesEqual, type PropValue } from '../types/PropValue.ts';
import EdgeAdd from '../types/ops/EdgeAdd.ts';
import EdgeRemove from '../types/ops/EdgeRemove.ts';
import NodeAdd from '../types/ops/NodeAdd.ts';
import NodePropSet from '../types/ops/NodePropSet.ts';
import NodeRemove from '../types/ops/NodeRemove.ts';
import PropSet from '../types/ops/PropSet.ts';
import type { PatchOp } from '../types/ops/unions.ts';
import type Intent from './Intent.ts';
import type { IntentDescriptor } from './Intent.ts';
import type IntentSequence from './IntentSequence.ts';

export type PublishedEntityCoordinate = Readonly<{
  readonly dot: Dot;
  readonly intent: Intent;
  readonly opIndex: number;
  readonly subject: string;
}>;

class PublicationCursor {
  readonly #entities: PublishedEntityCoordinate[] = [];
  readonly #operations: readonly PatchOp[];
  #position = 0;

  constructor(operations: readonly PatchOp[]) {
    this.#operations = operations;
  }

  get entities(): readonly PublishedEntityCoordinate[] {
    return Object.freeze([...this.#entities]);
  }

  get position(): number {
    return this.#position;
  }

  current(): PatchOp | undefined {
    return this.#operations[this.#position];
  }

  take(intent: Intent): PatchOp {
    const operation = this.current();
    if (operation === undefined) {
      throw publicationError(intent, 'Published write ended before its requested Intents');
    }
    this.#position += 1;
    return operation;
  }

  recordEntity(coordinate: PublishedEntityCoordinate): void {
    this.#entities.push(Object.freeze(coordinate));
  }

  requireComplete(): void {
    if (this.#position !== this.#operations.length) {
      throw new WarpError(
        'Published write contains operations outside its requested Intents',
        'E_WRITE_INTENT_PUBLICATION',
      );
    }
  }
}

type NodeAddIntentDescriptor = Extract<IntentDescriptor, { readonly kind: 'node.add' }>;
type NodeRemoveIntentDescriptor = Extract<IntentDescriptor, { readonly kind: 'node.remove' }>;
type NodeIntentDescriptor = NodeAddIntentDescriptor | NodeRemoveIntentDescriptor;
type EdgeAddIntentDescriptor = Extract<IntentDescriptor, { readonly kind: 'edge.add' }>;
type EdgeRemoveIntentDescriptor = Extract<IntentDescriptor, { readonly kind: 'edge.remove' }>;
type EdgeIntentDescriptor = EdgeAddIntentDescriptor | EdgeRemoveIntentDescriptor;
type PropertyIntentDescriptor = Extract<IntentDescriptor, { readonly kind: 'property.set' }>;
type EntityIntentDescriptor = Extract<IntentDescriptor, { readonly kind: 'entity.add' }>;
type PayloadIntentDescriptor = PropertyIntentDescriptor | EntityIntentDescriptor;
type EntityPropertiesInspection = Readonly<{
  readonly cursor: PublicationCursor;
  readonly intent: Intent;
  readonly properties: EntityCapturePayload;
  readonly subject: string;
}>;

/** Validates that the published patch is the exact ordered write request. */
export function inspectPublishedIntentSequence(
  sequence: IntentSequence,
  patch: Patch,
): readonly PublishedEntityCoordinate[] {
  const cursor = new PublicationCursor(patch.ops);
  for (const intent of sequence.intents) {
    inspectIntent(cursor, intent);
  }
  cursor.requireComplete();
  return cursor.entities;
}

function inspectIntent(cursor: PublicationCursor, intent: Intent): void {
  const { descriptor } = intent;
  if (isNodeIntentDescriptor(descriptor)) {
    inspectNodeIntent(cursor, intent, descriptor);
    return;
  }
  if (isEdgeIntentDescriptor(descriptor)) {
    inspectEdgeIntent(cursor, intent, descriptor);
    return;
  }
  inspectPayloadIntent(cursor, intent, descriptor);
}

function inspectNodeIntent(
  cursor: PublicationCursor,
  intent: Intent,
  descriptor: NodeIntentDescriptor,
): void {
  if (descriptor.kind === 'node.add') {
    inspectNodeAdd(cursor, intent, descriptor);
    return;
  }
  inspectNodeRemove(cursor, intent, descriptor);
}

function inspectNodeAdd(
  cursor: PublicationCursor,
  intent: Intent,
  descriptor: NodeAddIntentDescriptor,
): void {
  const operation = cursor.take(intent);
  if (!(operation instanceof NodeAdd) || operation.node !== descriptor.subject) {
    throw publicationError(intent, 'Published node addition does not match its requested subject');
  }
}

function inspectNodeRemove(
  cursor: PublicationCursor,
  intent: Intent,
  descriptor: NodeRemoveIntentDescriptor,
): void {
  consumeCascadingEdgeRemovals(cursor, intent, descriptor.subject);
  const operation = cursor.take(intent);
  if (!(operation instanceof NodeRemove) || operation.node !== descriptor.subject) {
    throw publicationError(intent, 'Published node removal does not match its requested subject');
  }
}

function isNodeIntentDescriptor(
  descriptor: IntentDescriptor,
): descriptor is NodeIntentDescriptor {
  return descriptor.kind === 'node.add' || descriptor.kind === 'node.remove';
}

function consumeCascadingEdgeRemovals(
  cursor: PublicationCursor,
  intent: Intent,
  subject: string,
): void {
  while (cursor.current() instanceof EdgeRemove) {
    const operation = cursor.take(intent);
    if (!(operation instanceof EdgeRemove) || !touchesSubject(operation, subject)) {
      throw publicationError(intent, 'Published node removal contains an unrelated edge removal');
    }
  }
}

function touchesSubject(
  operation: EdgeRemove,
  subject: string,
): boolean {
  return operation.from === subject || operation.to === subject;
}

function inspectEdgeIntent(
  cursor: PublicationCursor,
  intent: Intent,
  descriptor: EdgeIntentDescriptor,
): void {
  if (descriptor.kind === 'edge.add') {
    inspectEdgeAdd(cursor, intent, descriptor);
    return;
  }
  inspectEdgeRemove(cursor, intent, descriptor);
}

function inspectEdgeAdd(
  cursor: PublicationCursor,
  intent: Intent,
  descriptor: EdgeAddIntentDescriptor,
): void {
  const operation = cursor.take(intent);
  if (!(operation instanceof EdgeAdd) || !edgeFieldsMatch(operation, descriptor)) {
    throw publicationError(intent, 'Published edge addition does not match its requested edge');
  }
}

function inspectEdgeRemove(
  cursor: PublicationCursor,
  intent: Intent,
  descriptor: EdgeRemoveIntentDescriptor,
): void {
  const operation = cursor.take(intent);
  if (!(operation instanceof EdgeRemove) || !edgeFieldsMatch(operation, descriptor)) {
    throw publicationError(intent, 'Published edge removal does not match its requested edge');
  }
}

function isEdgeIntentDescriptor(
  descriptor: IntentDescriptor,
): descriptor is EdgeIntentDescriptor {
  return descriptor.kind === 'edge.add' || descriptor.kind === 'edge.remove';
}

function edgeFieldsMatch(
  operation: EdgeAdd | EdgeRemove,
  descriptor: Readonly<{ from: string; label: string; to: string }>,
): boolean {
  return (
    operation.from === descriptor.from &&
    operation.to === descriptor.to &&
    operation.label === descriptor.label
  );
}

function inspectPayloadIntent(
  cursor: PublicationCursor,
  intent: Intent,
  descriptor: PayloadIntentDescriptor,
): void {
  if (descriptor.kind === 'property.set') {
    inspectPropertySet(cursor, intent, descriptor);
    return;
  }
  inspectEntityAdd(cursor, intent, descriptor);
}

function inspectPropertySet(
  cursor: PublicationCursor,
  intent: Intent,
  descriptor: PropertyIntentDescriptor,
): void {
  requirePropertyOperation(cursor.take(intent), intent, {
    key: descriptor.key,
    subject: descriptor.subject,
    value: descriptor.value,
  });
}

function inspectEntityAdd(
  cursor: PublicationCursor,
  intent: Intent,
  descriptor: EntityIntentDescriptor,
): void {
  const opIndex = cursor.position;
  const leading = cursor.take(intent);
  if (!(leading instanceof NodeAdd)) {
    throw publicationError(intent, 'Published entity does not begin with a causal NodeAdd');
  }
  const subject = requestedEntitySubject(descriptor, leading.dot);
  if (leading.node !== subject) {
    throw publicationError(intent, 'Published entity subject does not match its request');
  }
  inspectEntityProperties({ cursor, intent, subject, properties: descriptor.properties });
  cursor.recordEntity({ dot: leading.dot, intent, opIndex, subject });
}

function requestedEntitySubject(
  descriptor: EntityIntentDescriptor,
  dot: Dot,
): string {
  return 'subject' in descriptor
    ? descriptor.subject
    : allocateEntitySubject(descriptor.namespace, dot);
}

function inspectEntityProperties(fields: EntityPropertiesInspection): void {
  const { cursor, intent, subject, properties } = fields;
  for (const [key, value] of Object.entries(properties)) {
    requirePropertyOperation(cursor.take(intent), intent, { key, subject, value });
  }
}

function requirePropertyOperation(
  operation: PatchOp,
  intent: Intent,
  expected: Readonly<{ key: string; subject: string; value: PropValue }>,
): void {
  if (!isNodePropertyOperation(operation) || !isPropValue(operation.value)) {
    throw publicationError(intent, 'Published property write is not a node property operation');
  }
  if (!propertyOperationMatches(operation, operation.value, expected)) {
    throw publicationError(intent, 'Published property write does not match its request');
  }
}

function propertyOperationMatches(
  operation: NodePropSet | PropSet,
  value: PropValue,
  expected: Readonly<{ key: string; subject: string; value: PropValue }>,
): boolean {
  return (
    operation.node === expected.subject &&
    operation.key === expected.key &&
    propValuesEqual(value, expected.value)
  );
}

function isNodePropertyOperation(
  operation: PatchOp,
): operation is NodePropSet | PropSet {
  return operation instanceof NodePropSet || operation instanceof PropSet;
}

function publicationError(intent: Intent, message: string): WarpError {
  const code = intent.kind === 'entity.add'
    ? 'E_WRITE_ENTITY_OCCURRENCE'
    : 'E_WRITE_INTENT_PUBLICATION';
  return new WarpError(message, code);
}
