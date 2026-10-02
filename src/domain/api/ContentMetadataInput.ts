/** Optional MIME hint and declared plaintext byte count, validated during staging. */
export type ContentMetadataInput = {
  readonly mime?: string | null;
  readonly size?: number | null;
};
