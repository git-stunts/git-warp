import type AssetHandle from '../domain/storage/AssetHandle.ts';
import type BundleHandle from '../domain/storage/BundleHandle.ts';

export const PATCH_STORAGE_FORMAT = 'v19';
export const PATCH_STORAGE_SCHEMA_GIT_CAS_CBOR_PATCH = 'git-cas-asset-patch-v1';
export const CHECKPOINT_STORAGE_FORMAT = 'v19';
export const LEGACY_CHECKPOINT_STORAGE_FORMAT = 'v5';

export type CommitMessageKind = 'patch' | 'checkpoint' | 'anchor' | 'audit';

export interface GitCasAssetPatchStorage {
  strategy: 'git-cas-asset';
  version: typeof PATCH_STORAGE_FORMAT;
  schema: typeof PATCH_STORAGE_SCHEMA_GIT_CAS_CBOR_PATCH;
  encrypted: boolean;
}

export type PatchStorageRoute = GitCasAssetPatchStorage;

export type GitCasPatchStorageOptions = {
  readonly encrypted: boolean;
};

export function createGitCasPatchStorage(
  options: GitCasPatchStorageOptions,
): GitCasAssetPatchStorage {
  return Object.freeze({
    strategy: 'git-cas-asset',
    version: PATCH_STORAGE_FORMAT,
    schema: PATCH_STORAGE_SCHEMA_GIT_CAS_CBOR_PATCH,
    encrypted: options.encrypted,
  });
}

export function isGitCasPatchStorage(
  storage: PatchStorageRoute,
): storage is GitCasAssetPatchStorage {
  return storage.strategy === 'git-cas-asset';
}

type PatchCommitMessageBase = {
  kind: 'patch';
  graph: string;
  writer: string;
  lamport: number;
  schema: number;
};

export type PatchCommitMessage = PatchCommitMessageBase & {
  patchHandle: AssetHandle;
  storage: PatchStorageRoute;
};

export interface CheckpointCommitMessage {
  kind: 'checkpoint';
  graph: string;
  stateHash: string;
  schema: number;
  checkpointVersion: string | null;
  bundleHandle: BundleHandle | null;
}

export interface AnchorCommitMessage {
  kind: 'anchor';
  graph: string;
  schema: number;
}

export default abstract class CommitMessageCodecPort {
  abstract encodePatch(_message: PatchCommitMessage): string;

  abstract decodePatch(_message: string): PatchCommitMessage;

  abstract encodeCheckpoint(_message: CheckpointCommitMessage): string;

  abstract decodeCheckpoint(_message: string): CheckpointCommitMessage;

  abstract encodeAnchor(_message: AnchorCommitMessage): string;

  abstract decodeAnchor(_message: string): AnchorCommitMessage;

  abstract detectKind(_message: string): CommitMessageKind | null;
}
