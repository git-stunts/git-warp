import MemoryBudgetError from '../errors/MemoryBudgetError.ts';
import MemoryCapabilityPosture, { type MemoryCapabilityPostureValue } from './MemoryCapabilityPosture.ts';

export type MemoryCapabilityFields = {
  readonly name: string;
  readonly posture: MemoryCapabilityPosture | MemoryCapabilityPostureValue;
  readonly evidence: string;
  readonly note: string;
};

/** One named bounded-memory capability and its current runtime truth posture. */
export default class MemoryCapability {
  readonly name: string;
  readonly posture: MemoryCapabilityPosture;
  readonly evidence: string;
  readonly note: string;

  constructor(fields: MemoryCapabilityFields) {
    const validFields = requireMemoryCapabilityFields(fields);
    this.name = requireNonEmptyString(validFields.name, 'name');
    this.posture = normalizePosture(validFields.posture);
    this.evidence = requireNonEmptyString(validFields.evidence, 'evidence');
    this.note = requireNonEmptyString(validFields.note, 'note');
    Object.freeze(this);
  }
}

function requireMemoryCapabilityFields(
  fields: MemoryCapabilityFields | null | undefined,
): MemoryCapabilityFields {
  if (fields !== null && typeof fields === 'object') {
    return fields;
  }
  throw new MemoryBudgetError('MemoryCapability requires object fields', {
    code: 'E_MEMORY_CAPABILITY_INVALID',
    context: { field: 'fields' },
  });
}

function normalizePosture(
  value: MemoryCapabilityPosture | MemoryCapabilityPostureValue,
): MemoryCapabilityPosture {
  if (value instanceof MemoryCapabilityPosture) {
    return value;
  }
  return new MemoryCapabilityPosture(value);
}

function requireNonEmptyString(value: string, field: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  throw new MemoryBudgetError('Memory capability requires non-empty fields', {
    code: 'E_MEMORY_CAPABILITY_INVALID',
    context: { field },
  });
}
