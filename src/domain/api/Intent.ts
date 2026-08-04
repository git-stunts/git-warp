import WarpError from '../errors/WarpError.ts';
import {
  isEntityCapturePayloadRecord,
  type EntityCapturePayload,
} from '../types/EntityCapturePayload.ts';
import { copyPropValue, isPropValue, type PropValue } from '../types/PropValue.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';

export type IntentKind =
  | 'node.add'
  | 'node.remove'
  | 'edge.add'
  | 'edge.remove'
  | 'property.set'
  | 'entity.add';

export type NodeIntentFields = {
  readonly subject: string;
};

/**
 * One entity and its initial payload, stated as a single fact.
 *
 * The lowered patch declares an empty read set and exactly one subject write.
 * That is a guarantee about the encoded patch operands, not proof that caller
 * code made no prior graph read before choosing the subject or payload. A
 * caller may supply a semantic subject, or ask git-warp to allocate one from
 * the NodeAdd's writer-local dot with `addEntityAuto`.
 * See `docs/READINGS_AND_OPTICS.md` §4.
 *
 * A payload is mandatory, so this intent cannot itself produce the empty shell
 * that later property writes fill in. It does not withdraw `property.set`, so
 * whether an entity stays immutable after creation is a law the application
 * adopts rather than one this intent enforces. Payload *completeness* is
 * likewise an application schema concern: the substrate checks that properties
 * exist, not which ones an entity requires. Subject identity, occurrence
 * identity, causal relation, deterministic event order, and application time
 * remain separate concepts.
 */
type EntityPayloadFields = {
  readonly properties: EntityCapturePayload;
};

export type EntityIntentFields = EntityPayloadFields & {
  readonly subject: string;
};

export type AutoEntityIntentFields = EntityPayloadFields & {
  readonly namespace: string;
};

export type EdgeIntentFields = {
  readonly from: string;
  readonly to: string;
  readonly label: string;
};

export type PropertyIntentFields = {
  readonly subject: string;
  readonly key: string;
  readonly value: PropValue;
};

export type IntentDescriptor =
  | (NodeIntentFields & { readonly kind: 'node.add' })
  | (NodeIntentFields & { readonly kind: 'node.remove' })
  | (EdgeIntentFields & { readonly kind: 'edge.add' })
  | (EdgeIntentFields & { readonly kind: 'edge.remove' })
  | (PropertyIntentFields & { readonly kind: 'property.set' })
  | (EntityIntentFields & { readonly kind: 'entity.add' })
  | (AutoEntityIntentFields & { readonly kind: 'entity.add' });

const NODE_ADD: 'node.add' = 'node.add';
const NODE_REMOVE: 'node.remove' = 'node.remove';
const EDGE_ADD: 'edge.add' = 'edge.add';
const EDGE_REMOVE: 'edge.remove' = 'edge.remove';
const PROPERTY_SET: 'property.set' = 'property.set';
const ENTITY_ADD: 'entity.add' = 'entity.add';

export default class Intent {
  readonly #descriptor: IntentDescriptor;

  constructor(descriptor: IntentDescriptor | null | undefined) {
    this.#descriptor = normalizeDescriptor(descriptor);
    Object.freeze(this);
  }

  static addNode(fields: NodeIntentFields): Intent {
    return new Intent(nodeDescriptor(NODE_ADD, fields));
  }

  static removeNode(fields: NodeIntentFields): Intent {
    return new Intent(nodeDescriptor(NODE_REMOVE, fields));
  }

  static addEdge(fields: EdgeIntentFields): Intent {
    return new Intent(edgeDescriptor(EDGE_ADD, fields));
  }

  static removeEdge(fields: EdgeIntentFields): Intent {
    return new Intent(edgeDescriptor(EDGE_REMOVE, fields));
  }

  static setProperty(fields: PropertyIntentFields): Intent {
    return new Intent(propertyDescriptor(fields));
  }

  static addEntity(fields: EntityIntentFields): Intent {
    return new Intent(entityDescriptor(fields));
  }

  static addEntityAuto(fields: AutoEntityIntentFields): Intent {
    return new Intent(entityDescriptor(fields));
  }

  get kind(): IntentKind {
    return this.#descriptor.kind;
  }

  get descriptor(): IntentDescriptor {
    return normalizeKnownDescriptor(this.#descriptor);
  }
}

function normalizeDescriptor(descriptor: IntentDescriptor | null | undefined): IntentDescriptor {
  return normalizeKnownDescriptor(requireDescriptor(descriptor));
}

function requireDescriptor(descriptor: IntentDescriptor | null | undefined): IntentDescriptor {
  if (descriptor === null || descriptor === undefined) {
    throw new WarpError('Intent descriptor is required', 'E_INTENT_DESCRIPTOR');
  }
  return descriptor;
}

function normalizeKnownDescriptor(descriptor: IntentDescriptor): IntentDescriptor {
  if (isNodeDescriptor(descriptor)) {
    return nodeDescriptor(descriptor.kind, descriptor);
  }
  if (isEdgeDescriptor(descriptor)) {
    return edgeDescriptor(descriptor.kind, descriptor);
  }
  if (descriptor.kind === PROPERTY_SET) {
    return propertyDescriptor(descriptor);
  }
  if (descriptor.kind === ENTITY_ADD) {
    return entityDescriptor(descriptor);
  }
  throw new WarpError('Intent kind is unsupported', 'E_INTENT_KIND');
}

function isNodeDescriptor(
  descriptor: IntentDescriptor
): descriptor is NodeIntentFields & { readonly kind: 'node.add' | 'node.remove' } {
  return descriptor.kind === NODE_ADD || descriptor.kind === NODE_REMOVE;
}

function isEdgeDescriptor(
  descriptor: IntentDescriptor
): descriptor is EdgeIntentFields & { readonly kind: 'edge.add' | 'edge.remove' } {
  return descriptor.kind === EDGE_ADD || descriptor.kind === EDGE_REMOVE;
}

function nodeDescriptor(
  kind: 'node.add' | 'node.remove',
  fields: NodeIntentFields
): IntentDescriptor {
  const checkedFields = requireIntentFields(fields);
  requireNonEmptyString(checkedFields.subject, 'intent.subject');
  return Object.freeze({ kind, subject: checkedFields.subject });
}

function edgeDescriptor(
  kind: 'edge.add' | 'edge.remove',
  fields: EdgeIntentFields
): IntentDescriptor {
  const checkedFields = requireIntentFields(fields);
  requireNonEmptyString(checkedFields.from, 'intent.from');
  requireNonEmptyString(checkedFields.to, 'intent.to');
  requireNonEmptyString(checkedFields.label, 'intent.label');
  return Object.freeze({
    kind,
    from: checkedFields.from,
    to: checkedFields.to,
    label: checkedFields.label,
  });
}

function propertyDescriptor(fields: PropertyIntentFields): IntentDescriptor {
  const checkedFields = requireIntentFields(fields);
  requireNonEmptyString(checkedFields.subject, 'intent.subject');
  requireNonEmptyString(checkedFields.key, 'intent.key');
  return Object.freeze({
    kind: PROPERTY_SET,
    subject: checkedFields.subject,
    key: checkedFields.key,
    value: requireIntentValue(checkedFields.value),
  });
}

function entityDescriptor(fields: EntityIntentFields | AutoEntityIntentFields): IntentDescriptor {
  const checkedFields = requireIntentFields(fields);
  const propertiesInput = requireIntentFields(checkedFields.properties);
  if (!isEntityCapturePayloadRecord(propertiesInput)) {
    throw new WarpError(
      'Intent entity payload must be a property record',
      'E_INTENT_ENTITY_PAYLOAD'
    );
  }
  const entries = Object.entries(propertiesInput);
  if (entries.length === 0) {
    throw new WarpError('Intent entity requires at least one property', 'E_INTENT_ENTITY_EMPTY');
  }
  // Sorted so that payloads differing only in construction order describe the
  // same entity, and a null prototype so that a caller-controlled key such as
  // `__proto__` stays ordinary data.
  const properties = nullPrototypePropertyMap(
    entries.sort(compareEntityKeys).map(normalizeEntityProperty)
  );
  const identity = entityIdentity(checkedFields);
  return Object.freeze({ kind: ENTITY_ADD, ...identity, properties: Object.freeze(properties) });
}

function entityIdentity(
  fields: EntityIntentFields | AutoEntityIntentFields
): Readonly<{ subject: string }> | Readonly<{ namespace: string }> {
  const subject = 'subject' in fields ? fields.subject : undefined;
  const namespace = 'namespace' in fields ? fields.namespace : undefined;
  const hasSubject = subject !== undefined;
  const hasNamespace = namespace !== undefined;
  if (hasSubject === hasNamespace) {
    throw new WarpError(
      'Intent entity requires exactly one of subject or namespace',
      'E_INTENT_ENTITY_IDENTITY'
    );
  }
  if (hasSubject) {
    return Object.freeze({ subject: entityIdentityValue(subject, 'intent.subject') });
  }
  return Object.freeze({ namespace: entityIdentityValue(namespace, 'intent.namespace') });
}

function entityIdentityValue(value: string | undefined, name: string): string {
  if (value === undefined) {
    throw new WarpError(
      'Intent entity requires exactly one of subject or namespace',
      'E_INTENT_ENTITY_IDENTITY'
    );
  }
  requireNonEmptyString(value, name);
  return value;
}

function normalizeEntityProperty([key, value]: readonly [string, PropValue]): readonly [
  string,
  PropValue,
] {
  requireNonEmptyString(key, 'intent.properties key');
  return [key, requireIntentValue(value)];
}

/** A property map with no prototype, so hostile keys stay ordinary data. */
function nullPrototypePropertyMap(
  entries: Iterable<readonly [string, PropValue]>
): Record<string, PropValue> {
  const properties: Record<string, PropValue> = Object.fromEntries(entries);
  Object.setPrototypeOf(properties, null);
  return properties;
}

function compareEntityKeys(
  [left]: readonly [string, PropValue],
  [right]: readonly [string, PropValue]
): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function requireIntentFields<TFields>(fields: TFields | null | undefined): TFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('Intent fields are required', 'E_INTENT_FIELDS');
  }
  return fields;
}

function requireIntentValue(value: PropValue): PropValue {
  if (isPropValue(value)) {
    return copyPropValue(value);
  }
  throw new WarpError('Intent value must be property-compatible data', 'E_INTENT_VALUE');
}
