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
    this.name = requireNonEmptyString(fields.name, 'name');
    this.posture = normalizePosture(fields.posture);
    this.evidence = requireNonEmptyString(fields.evidence, 'evidence');
    this.note = requireNonEmptyString(fields.note, 'note');
    Object.freeze(this);
  }
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
