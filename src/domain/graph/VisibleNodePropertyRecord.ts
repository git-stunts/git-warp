import LegacyNodePropertyKey from './LegacyNodePropertyKey.ts';
import LegacyPropertyValue from './LegacyPropertyValue.ts';
import NodeRecord from './NodeRecord.ts';
import WarpError from '../errors/WarpError.ts';

export type VisibleNodePropertyRecordFields = {
  readonly owner: NodeRecord;
  readonly key: LegacyNodePropertyKey;
  readonly value: LegacyPropertyValue;
};

/** Runtime-backed visible legacy property record owned by a node. */
export default class VisibleNodePropertyRecord {
  readonly owner: NodeRecord;
  readonly key: LegacyNodePropertyKey;
  readonly value: LegacyPropertyValue;

  constructor(fields: VisibleNodePropertyRecordFields) {
    const checkedFields = requireFields(fields);
    this.owner = requireOwner(checkedFields.owner);
    this.key = requireKey(checkedFields.key);
    this.value = requireValue(checkedFields.value);
    Object.freeze(this);
  }
}

/** Validates the node property record constructor envelope. */
function requireFields(
  fields: VisibleNodePropertyRecordFields | null | undefined,
): VisibleNodePropertyRecordFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('VisibleNodePropertyRecord fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a runtime-backed node owner. */
function requireOwner(owner: NodeRecord): NodeRecord {
  if (!(owner instanceof NodeRecord)) {
    throw new WarpError('VisibleNodePropertyRecord owner must be a NodeRecord', 'E_VALIDATION');
  }
  return owner;
}

/** Requires a runtime-backed node property key. */
function requireKey(key: LegacyNodePropertyKey): LegacyNodePropertyKey {
  if (!(key instanceof LegacyNodePropertyKey)) {
    throw new WarpError(
      'VisibleNodePropertyRecord key must be a LegacyNodePropertyKey',
      'E_VALIDATION',
    );
  }
  return key;
}

/** Requires a runtime-backed property value. */
function requireValue(value: LegacyPropertyValue): LegacyPropertyValue {
  if (!(value instanceof LegacyPropertyValue)) {
    throw new WarpError(
      'VisibleNodePropertyRecord value must be a LegacyPropertyValue',
      'E_VALIDATION',
    );
  }
  return value;
}
