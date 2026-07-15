import type AssetHandle from '../domain/storage/AssetHandle.ts';

export type AssetWriteOptions = {
  readonly slug: string;
  readonly filename?: string;
  readonly mime?: string | null;
  readonly expectedSize?: number | null;
};

export type StagedAsset = Readonly<{
  handle: AssetHandle;
  size: number;
  observedAt: string;
  retention: Readonly<{
    reachability: 'unanchored';
    protection: 'not-established';
  }>;
}>;

/** Streaming storage boundary for immutable application assets. */
export default abstract class AssetStoragePort {
  abstract stage(
    _source: AsyncIterable<Uint8Array>,
    _options: AssetWriteOptions,
  ): Promise<StagedAsset>;

  abstract open(_handle: AssetHandle): AsyncIterable<Uint8Array>;
}
