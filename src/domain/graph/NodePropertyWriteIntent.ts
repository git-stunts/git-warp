import LegacyNodePropertyKey from './LegacyNodePropertyKey.ts';
import LegacyPropertyValue from './LegacyPropertyValue.ts';
import NodeRecord from './NodeRecord.ts';
import WarpError from '../errors/WarpError.ts';
import type { PropValue } from '../types/PropValue.ts';

export type NodePropertyWriteIntentFields = {
  readonly owner: NodeRecord;
  readonly key: LegacyNodePropertyKey;
  readonly value: LegacyPropertyValue;
};

/** Runtime-backed intent for writing one legacy-compatible node property. */
export default class NodePropertyWriteIntent {
  readonly owner: NodeRecord;
  readonly key: LegacyNodePropertyKey;
  readonly value: LegacyPropertyValue;

  constructor(fields: NodePropertyWriteIntentFields) {
    const checkedFields = requireFields(fields);
    this.owner = requireOwner(checkedFields.owner);
    this.key = requireKey(checkedFields.key);
    this.value = requireValue(checkedFields.value);
    Object.freeze(this);
  }

  /** Builds a write intent from the current public node-property API fields. */
  static fromLegacyProperty(nodeId: string, key: string, value: PropValue): NodePropertyWriteIntent {
    return new NodePropertyWriteIntent({
      owner: NodeRecord.fromLegacyNodeId(nodeId),
      key: new LegacyNodePropertyKey(key),
      value: new LegacyPropertyValue(value),
    });
  }

  /** Returns the current legacy node id target. */
  nodeId(): string {
    return this.owner.id.toString();
  }

  /** Returns the current legacy property key target. */
  propertyKey(): string {
    return this.key.toString();
  }

  /** Returns a defensive copy of the property value. */
  propertyValue(): PropValue {
    return this.value.toPropValue();
  }
}

/** Validates the write-intent constructor envelope. */
function requireFields(
  fields: NodePropertyWriteIntentFields | null | undefined,
): NodePropertyWriteIntentFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('NodePropertyWriteIntent fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a runtime-backed node owner. */
function requireOwner(owner: NodeRecord): NodeRecord {
  if (!(owner instanceof NodeRecord)) {
    throw new WarpError('NodePropertyWriteIntent owner must be a NodeRecord', 'E_VALIDATION');
  }
  return owner;
}

/** Requires a runtime-backed node property key. */
function requireKey(key: LegacyNodePropertyKey): LegacyNodePropertyKey {
  if (!(key instanceof LegacyNodePropertyKey)) {
    throw new WarpError(
      'NodePropertyWriteIntent key must be a LegacyNodePropertyKey',
      'E_VALIDATION',
    );
  }
  return key;
}

/** Requires a runtime-backed property value. */
function requireValue(value: LegacyPropertyValue): LegacyPropertyValue {
  if (!(value instanceof LegacyPropertyValue)) {
    throw new WarpError(
      'NodePropertyWriteIntent value must be a LegacyPropertyValue',
      'E_VALIDATION',
    );
  }
  return value;
}
