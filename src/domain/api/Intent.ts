import WarpError from '../errors/WarpError.ts';
import { isPropValue, type PropValue } from '../types/PropValue.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';

export type IntentKind =
  | 'node.add'
  | 'node.remove'
  | 'edge.add'
  | 'edge.remove'
  | 'property.set'
  | 'edgeProperty.set';

export type NodeIntentFields = {
  readonly subject: string;
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

export type EdgePropertyIntentFields = EdgeIntentFields & {
  readonly key: string;
  readonly value: PropValue;
};

export type IntentDescriptor =
  | (NodeIntentFields & { readonly kind: 'node.add' })
  | (NodeIntentFields & { readonly kind: 'node.remove' })
  | (EdgeIntentFields & { readonly kind: 'edge.add' })
  | (EdgeIntentFields & { readonly kind: 'edge.remove' })
  | (PropertyIntentFields & { readonly kind: 'property.set' })
  | (EdgePropertyIntentFields & { readonly kind: 'edgeProperty.set' });

const NODE_ADD: 'node.add' = 'node.add';
const NODE_REMOVE: 'node.remove' = 'node.remove';
const EDGE_ADD: 'edge.add' = 'edge.add';
const EDGE_REMOVE: 'edge.remove' = 'edge.remove';
const PROPERTY_SET: 'property.set' = 'property.set';
const EDGE_PROPERTY_SET: 'edgeProperty.set' = 'edgeProperty.set';

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

  static setEdgeProperty(fields: EdgePropertyIntentFields): Intent {
    return new Intent(edgePropertyDescriptor(fields));
  }

  get kind(): IntentKind {
    return this.#descriptor.kind;
  }

  get descriptor(): IntentDescriptor {
    return this.#descriptor;
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
  if (descriptor.kind === EDGE_PROPERTY_SET) {
    return edgePropertyDescriptor(descriptor);
  }
  throw new WarpError('Intent kind is unsupported', 'E_INTENT_KIND');
}

function isNodeDescriptor(
  descriptor: IntentDescriptor,
): descriptor is NodeIntentFields & { readonly kind: 'node.add' | 'node.remove' } {
  return descriptor.kind === NODE_ADD || descriptor.kind === NODE_REMOVE;
}

function isEdgeDescriptor(
  descriptor: IntentDescriptor,
): descriptor is EdgeIntentFields & { readonly kind: 'edge.add' | 'edge.remove' } {
  return descriptor.kind === EDGE_ADD || descriptor.kind === EDGE_REMOVE;
}

function nodeDescriptor(kind: 'node.add' | 'node.remove', fields: NodeIntentFields): IntentDescriptor {
  const checkedFields = requireIntentFields(fields);
  requireNonEmptyString(checkedFields.subject, 'intent.subject');
  return Object.freeze({ kind, subject: checkedFields.subject });
}

function edgeDescriptor(kind: 'edge.add' | 'edge.remove', fields: EdgeIntentFields): IntentDescriptor {
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

function edgePropertyDescriptor(fields: EdgePropertyIntentFields): IntentDescriptor {
  const checkedFields = requireIntentFields(fields);
  requireNonEmptyString(checkedFields.from, 'intent.from');
  requireNonEmptyString(checkedFields.to, 'intent.to');
  requireNonEmptyString(checkedFields.label, 'intent.label');
  requireNonEmptyString(checkedFields.key, 'intent.key');
  return Object.freeze({
    kind: EDGE_PROPERTY_SET,
    from: checkedFields.from,
    to: checkedFields.to,
    label: checkedFields.label,
    key: checkedFields.key,
    value: requireIntentValue(checkedFields.value),
  });
}

function requireIntentFields<TFields>(fields: TFields | null | undefined): TFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('Intent fields are required', 'E_INTENT_FIELDS');
  }
  return fields;
}

function requireIntentValue(value: PropValue): PropValue {
  if (isPropValue(value)) {
    return value;
  }
  throw new WarpError('Intent value must be property-compatible data', 'E_INTENT_VALUE');
}
