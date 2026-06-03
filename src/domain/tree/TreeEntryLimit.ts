import WarpError from '../errors/WarpError.ts';

export default class TreeEntryLimit {
  readonly value: number;

  constructor(value: number) {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
      throw new WarpError(
        'Tree entry limit must be a positive integer',
        'E_TREE_ENTRY_LIMIT',
      );
    }
    this.value = value;
    Object.freeze(this);
  }
}
