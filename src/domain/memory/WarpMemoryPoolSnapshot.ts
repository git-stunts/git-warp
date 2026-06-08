import MemoryBudgetError from '../errors/MemoryBudgetError.ts';
import { requireMemoryBudgetUnit, type MemoryBudgetUnit } from './MemoryBudgetUnit.ts';

export type WarpMemoryPoolSnapshotFields = {
  readonly name: string;
  readonly limit: number;
  readonly unit: MemoryBudgetUnit;
  readonly leased: number;
  readonly peak: number;
  readonly rejected: number;
};

/** Immutable report of current memory-pool accounting. */
export default class WarpMemoryPoolSnapshot {
  readonly name: string;
  readonly limit: number;
  readonly unit: MemoryBudgetUnit;
  readonly leased: number;
  readonly peak: number;
  readonly rejected: number;

  constructor(fields: WarpMemoryPoolSnapshotFields) {
    const validFields = requireSnapshotFields(fields);
    this.name = requireNonEmptyString(validFields.name, 'name');
    this.limit = requirePositiveInteger(validFields.limit, 'limit');
    this.unit = requireMemoryBudgetUnit(validFields.unit);
    this.leased = requireNonNegativeInteger(validFields.leased, 'leased');
    this.peak = requireNonNegativeInteger(validFields.peak, 'peak');
    this.rejected = requireNonNegativeInteger(validFields.rejected, 'rejected');
    requireSnapshotInvariant(this.leased, this.peak);
    Object.freeze(this);
  }
}

function requireSnapshotFields(
  fields: WarpMemoryPoolSnapshotFields | null | undefined,
): WarpMemoryPoolSnapshotFields {
  if (fields !== null && typeof fields === 'object') {
    return fields;
  }
  return throwSnapshotError('fields');
}

function requireNonEmptyString(value: string, field: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return throwSnapshotError(field);
}

function requirePositiveInteger(value: number, field: string): number {
  if (Number.isInteger(value) && value > 0) {
    return value;
  }
  return throwSnapshotError(field);
}

function requireNonNegativeInteger(value: number, field: string): number {
  if (Number.isInteger(value) && value >= 0) {
    return value;
  }
  return throwSnapshotError(field);
}

function requireSnapshotInvariant(leased: number, peak: number): void {
  if (peak >= leased) {
    return;
  }
  throwSnapshotError('peak');
}

function throwSnapshotError(field: string): never {
  throw new MemoryBudgetError('WarpMemoryPoolSnapshot requires valid accounting fields', {
    code: 'E_MEMORY_BUDGET_INVALID',
    context: { field },
  });
}
