import EdgeRecord, { type LegacyEdgeFields } from './EdgeRecord.ts';
import LegacyEdgePropertyKey from './LegacyEdgePropertyKey.ts';
import LegacyPropertyValue from './LegacyPropertyValue.ts';
import WarpError from '../errors/WarpError.ts';
import type { PropValue } from '../types/PropValue.ts';

export type EdgePropertyWriteTarget = LegacyEdgeFields;

export type EdgePropertyWriteIntentFields = {
  readonly owner: EdgeRecord;
  readonly key: LegacyEdgePropertyKey;
  readonly value: LegacyPropertyValue;
};

export type LegacyEdgePropertyWriteFields = EdgePropertyWriteTarget & {
  readonly key: string;
  readonly value: PropValue;
};

/** Runtime-backed intent for writing one legacy-compatible edge property. */
export default class EdgePropertyWriteIntent {
  readonly owner: EdgeRecord;
  readonly key: LegacyEdgePropertyKey;
  readonly value: LegacyPropertyValue;

  constructor(fields: EdgePropertyWriteIntentFields) {
    const checkedFields = requireFields(fields);
    this.owner = requireOwner(checkedFields.owner);
    this.key = requireKey(checkedFields.key);
    this.value = requireValue(checkedFields.value);
    Object.freeze(this);
  }

  /** Builds a write intent from the current public edge-property API fields. */
  static fromLegacyProperty(fields: LegacyEdgePropertyWriteFields): EdgePropertyWriteIntent {
    return new EdgePropertyWriteIntent({
      owner: EdgeRecord.fromLegacyEdge(fields),
      key: new LegacyEdgePropertyKey(fields.key),
      value: new LegacyPropertyValue(fields.value),
    });
  }

  /** Returns the current legacy edge target. */
  edgeTarget(): EdgePropertyWriteTarget {
    return {
      from: this.owner.from.toString(),
      to: this.owner.to.toString(),
      label: this.owner.typeId.toString(),
    };
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
  fields: EdgePropertyWriteIntentFields | null | undefined,
): EdgePropertyWriteIntentFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('EdgePropertyWriteIntent fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a runtime-backed edge owner. */
function requireOwner(owner: EdgeRecord): EdgeRecord {
  if (!(owner instanceof EdgeRecord)) {
    throw new WarpError('EdgePropertyWriteIntent owner must be an EdgeRecord', 'E_VALIDATION');
  }
  return owner;
}

/** Requires a runtime-backed edge property key. */
function requireKey(key: LegacyEdgePropertyKey): LegacyEdgePropertyKey {
  if (!(key instanceof LegacyEdgePropertyKey)) {
    throw new WarpError(
      'EdgePropertyWriteIntent key must be a LegacyEdgePropertyKey',
      'E_VALIDATION',
    );
  }
  return key;
}

/** Requires a runtime-backed property value. */
function requireValue(value: LegacyPropertyValue): LegacyPropertyValue {
  if (!(value instanceof LegacyPropertyValue)) {
    throw new WarpError(
      'EdgePropertyWriteIntent value must be a LegacyPropertyValue',
      'E_VALIDATION',
    );
  }
  return value;
}
