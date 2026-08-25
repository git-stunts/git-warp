import { Dot } from '../crdt/Dot.ts';
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
import type { IntentDescriptor, IntentKind } from './Intent.ts';
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

type IntentInspector = (cursor: PublicationCursor, intent: Intent) => void;
type EntityIntentDescriptor = Extract<IntentDescriptor, { readonly kind: 'entity.add' }>;
type EntityPropertiesInspection = Readonly<{
  readonly cursor: PublicationCursor;
  readonly intent: Intent;
  readonly properties: EntityCapturePayload;
  readonly subject: string;
}>;

const inspectors: ReadonlyMap<IntentKind, IntentInspector> = new Map([
  ['node.add', inspectNodeAdd],
  ['node.remove', inspectNodeRemove],
  ['edge.add', inspectEdgeAdd],
  ['edge.remove', inspectEdgeRemove],
  ['property.set', inspectPropertySet],
  ['entity.add', inspectEntityAdd],
]);

/** Validates that the published patch is the exact ordered write request. */
export function inspectPublishedIntentSequence(
  sequence: IntentSequence,
  patch: Patch,
): readonly PublishedEntityCoordinate[] {
  const cursor = new PublicationCursor(patch.ops);
  for (const intent of sequence.intents) {
    const inspector = inspectors.get(intent.kind);
    if (inspector === undefined) {
      throw publicationError(intent, 'Published write contains an unsupported Intent');
    }
    inspector(cursor, intent);
  }
  cursor.requireComplete();
  return cursor.entities;
}

function inspectNodeAdd(cursor: PublicationCursor, intent: Intent): void {
  const { descriptor } = intent;
  if (descriptor.kind !== 'node.add') {
    throw publicationError(intent, 'Published node addition received a mismatched Intent');
  }
  const operation = cursor.take(intent);
  if (!(operation instanceof NodeAdd) || operation.node !== descriptor.subject) {
    throw publicationError(intent, 'Published node addition does not match its requested subject');
  }
}

function inspectNodeRemove(cursor: PublicationCursor, intent: Intent): void {
  const { descriptor } = intent;
  if (descriptor.kind !== 'node.remove') {
    throw publicationError(intent, 'Published node removal received a mismatched Intent');
  }
  consumeCascadingEdgeRemovals(cursor, intent, descriptor.subject);
  const operation = cursor.take(intent);
  if (!(operation instanceof NodeRemove) || operation.node !== descriptor.subject) {
    throw publicationError(intent, 'Published node removal does not match its requested subject');
  }
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

function inspectEdgeAdd(cursor: PublicationCursor, intent: Intent): void {
  const { descriptor } = intent;
  if (descriptor.kind !== 'edge.add') {
    throw publicationError(intent, 'Published edge addition received a mismatched Intent');
  }
  const operation = cursor.take(intent);
  if (!(operation instanceof EdgeAdd) || !edgeFieldsMatch(operation, descriptor)) {
    throw publicationError(intent, 'Published edge addition does not match its requested edge');
  }
}

function inspectEdgeRemove(cursor: PublicationCursor, intent: Intent): void {
  const { descriptor } = intent;
  if (descriptor.kind !== 'edge.remove') {
    throw publicationError(intent, 'Published edge removal received a mismatched Intent');
  }
  const operation = cursor.take(intent);
  if (!(operation instanceof EdgeRemove) || !edgeFieldsMatch(operation, descriptor)) {
    throw publicationError(intent, 'Published edge removal does not match its requested edge');
  }
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

function inspectPropertySet(cursor: PublicationCursor, intent: Intent): void {
  const { descriptor } = intent;
  if (descriptor.kind !== 'property.set') {
    throw publicationError(intent, 'Published property write received a mismatched Intent');
  }
  requirePropertyOperation(cursor.take(intent), intent, {
    key: descriptor.key,
    subject: descriptor.subject,
    value: descriptor.value,
  });
}

function inspectEntityAdd(cursor: PublicationCursor, intent: Intent): void {
  const { descriptor } = intent;
  if (descriptor.kind !== 'entity.add') {
    throw publicationError(intent, 'Published entity addition received a mismatched Intent');
  }
  const opIndex = cursor.position;
  const leading = cursor.take(intent);
  if (!(leading instanceof NodeAdd) || !(leading.dot instanceof Dot)) {
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
  if (!propertyOperationMatches(operation, expected)) {
    throw publicationError(intent, 'Published property write does not match its request');
  }
}

function propertyOperationMatches(
  operation: NodePropSet | PropSet,
  expected: Readonly<{ key: string; subject: string; value: PropValue }>,
): boolean {
  return (
    operation.node === expected.subject &&
    operation.key === expected.key &&
    isPropValue(operation.value) &&
    propValuesEqual(operation.value, expected.value)
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
