import EdgeRecord from './EdgeRecord.ts';
import LegacyEdgePropertyKey from './LegacyEdgePropertyKey.ts';
import LegacyPropertyValue from './LegacyPropertyValue.ts';
import WarpError from '../errors/WarpError.ts';

export type VisibleEdgePropertyRecordFields = {
  readonly owner: EdgeRecord;
  readonly key: LegacyEdgePropertyKey;
  readonly value: LegacyPropertyValue;
};

/** Runtime-backed visible legacy property record owned by an edge. */
export default class VisibleEdgePropertyRecord {
  readonly owner: EdgeRecord;
  readonly key: LegacyEdgePropertyKey;
  readonly value: LegacyPropertyValue;

  constructor(fields: VisibleEdgePropertyRecordFields) {
    const checkedFields = requireFields(fields);
    this.owner = requireOwner(checkedFields.owner);
    this.key = requireKey(checkedFields.key);
    this.value = requireValue(checkedFields.value);
    Object.freeze(this);
  }
}

/** Validates the edge property record constructor envelope. */
function requireFields(
  fields: VisibleEdgePropertyRecordFields | null | undefined,
): VisibleEdgePropertyRecordFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('VisibleEdgePropertyRecord fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a runtime-backed edge owner. */
function requireOwner(owner: EdgeRecord): EdgeRecord {
  if (!(owner instanceof EdgeRecord)) {
    throw new WarpError('VisibleEdgePropertyRecord owner must be an EdgeRecord', 'E_VALIDATION');
  }
  return owner;
}

/** Requires a runtime-backed edge property key. */
function requireKey(key: LegacyEdgePropertyKey): LegacyEdgePropertyKey {
  if (!(key instanceof LegacyEdgePropertyKey)) {
    throw new WarpError(
      'VisibleEdgePropertyRecord key must be a LegacyEdgePropertyKey',
      'E_VALIDATION',
    );
  }
  return key;
}

/** Requires a runtime-backed property value. */
function requireValue(value: LegacyPropertyValue): LegacyPropertyValue {
  if (!(value instanceof LegacyPropertyValue)) {
    throw new WarpError(
      'VisibleEdgePropertyRecord value must be a LegacyPropertyValue',
      'E_VALIDATION',
    );
  }
  return value;
}
