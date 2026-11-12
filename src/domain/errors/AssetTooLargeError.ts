import WarpError from './WarpError.ts';

/** A stored asset would have more chunks than git-warp admits for one asset. */
export default class AssetTooLargeError extends WarpError {
  readonly chunkCount: number;
  readonly maxChunkCount: number;

  constructor(chunkCount: number, maxChunkCount: number) {
    super(
      `Asset has ${chunkCount} chunks; git-warp limits one stored asset to ${maxChunkCount} chunks`,
      'E_ASSET_TOO_LARGE',
      { context: { chunkCount, maxChunkCount } },
    );
    this.chunkCount = chunkCount;
    this.maxChunkCount = maxChunkCount;
  }
}
