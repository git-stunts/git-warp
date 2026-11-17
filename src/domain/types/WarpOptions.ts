/**
 * Shared options types for warp methods.
 * @module domain/types/WarpOptions
 */

export type MaterializeOptions = {
  receipts?: boolean;
  ceiling?: number | null;
};

export type PatchCommitEvent = {
  patch?: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  sha: string;
};
