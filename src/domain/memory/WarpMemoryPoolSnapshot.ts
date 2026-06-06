import type { MemoryBudgetUnit } from './MemoryBudgetUnit.ts';

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
    this.name = fields.name;
    this.limit = fields.limit;
    this.unit = fields.unit;
    this.leased = fields.leased;
    this.peak = fields.peak;
    this.rejected = fields.rejected;
    Object.freeze(this);
  }
}
