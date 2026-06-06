import MemoryBudgetError from '../errors/MemoryBudgetError.ts';

export type MemoryCapabilityPostureValue = 'safe' | 'transitional' | 'diagnostic' | 'legacy';

export const MEMORY_CAPABILITY_SAFE: MemoryCapabilityPostureValue = 'safe';
export const MEMORY_CAPABILITY_TRANSITIONAL: MemoryCapabilityPostureValue = 'transitional';
export const MEMORY_CAPABILITY_DIAGNOSTIC: MemoryCapabilityPostureValue = 'diagnostic';
export const MEMORY_CAPABILITY_LEGACY: MemoryCapabilityPostureValue = 'legacy';

const MEMORY_CAPABILITY_POSTURES: readonly MemoryCapabilityPostureValue[] = Object.freeze([
  MEMORY_CAPABILITY_SAFE,
  MEMORY_CAPABILITY_TRANSITIONAL,
  MEMORY_CAPABILITY_DIAGNOSTIC,
  MEMORY_CAPABILITY_LEGACY,
]);

/** Runtime-backed bounded-memory capability posture token. */
export default class MemoryCapabilityPosture {
  readonly value: MemoryCapabilityPostureValue;

  constructor(value: string) {
    this.value = requireMemoryCapabilityPosture(value);
    Object.freeze(this);
  }

  isSafe(): boolean {
    return this.value === MEMORY_CAPABILITY_SAFE;
  }

  isTransitional(): boolean {
    return this.value === MEMORY_CAPABILITY_TRANSITIONAL;
  }

  isDiagnostic(): boolean {
    return this.value === MEMORY_CAPABILITY_DIAGNOSTIC;
  }

  isLegacy(): boolean {
    return this.value === MEMORY_CAPABILITY_LEGACY;
  }

  toString(): string {
    return this.value;
  }
}

function requireMemoryCapabilityPosture(value: string): MemoryCapabilityPostureValue {
  const posture = MEMORY_CAPABILITY_POSTURES.find((candidate) => candidate === value);
  if (posture !== undefined) {
    return posture;
  }
  throw new MemoryBudgetError('Memory capability posture is not supported', {
    code: 'E_MEMORY_CAPABILITY_INVALID',
    context: { field: 'posture', value },
  });
}
