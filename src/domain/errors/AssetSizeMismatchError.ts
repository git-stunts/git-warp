import WarpError from './WarpError.ts';

/** The staged byte count did not match the caller's declared asset size. */
export default class AssetSizeMismatchError extends WarpError {
  readonly expectedSize: number;
  readonly actualSize: number;

  constructor(expectedSize: number, actualSize: number) {
    super(
      `Expected ${expectedSize} asset bytes but staged ${actualSize}`,
      'E_ASSET_SIZE_MISMATCH',
      { context: { expectedSize, actualSize } },
    );
    this.expectedSize = expectedSize;
    this.actualSize = actualSize;
  }
}
