import type AssetHandle from '../domain/storage/AssetHandle.ts';

export const PATCH_STORAGE_FORMAT = 'v19';
export const PATCH_STORAGE_SCHEMA_GIT_CAS_CBOR_PATCH = 'git-cas-asset-patch-v1';
export const LEGACY_GIT_CAS_PATCH_STORAGE_FORMAT = 'v17';
export const LEGACY_GIT_CAS_PATCH_STORAGE_SCHEMA = 'git-cas-cbor-patch-v1';
export const CHECKPOINT_STORAGE_FORMAT = 'v5';

export type CommitMessageKind = 'patch' | 'checkpoint' | 'anchor' | 'audit';

export interface LegacyGitBlobPatchStorage {
  strategy: 'legacy-git-blob';
  version: null;
  schema: null;
  encrypted: false;
}

export interface LegacyExternalPatchStorage {
  strategy: 'legacy-external-storage';
  version: null;
  schema: null;
  encrypted: true;
}

export interface GitCasAssetPatchStorage {
  strategy: 'git-cas-asset';
  version: typeof PATCH_STORAGE_FORMAT;
  schema: typeof PATCH_STORAGE_SCHEMA_GIT_CAS_CBOR_PATCH;
  encrypted: boolean;
}

export interface LegacyGitCasPatchStorage {
  strategy: 'legacy-git-cas';
  version: typeof LEGACY_GIT_CAS_PATCH_STORAGE_FORMAT;
  schema: typeof LEGACY_GIT_CAS_PATCH_STORAGE_SCHEMA;
  encrypted: boolean;
}

export type PatchStorageRoute =
  | LegacyGitBlobPatchStorage
  | LegacyExternalPatchStorage
  | LegacyGitCasPatchStorage
  | GitCasAssetPatchStorage;

export const LEGACY_GIT_BLOB_PATCH_STORAGE: LegacyGitBlobPatchStorage = Object.freeze({
  strategy: 'legacy-git-blob',
  version: null,
  schema: null,
  encrypted: false,
});

export const LEGACY_EXTERNAL_PATCH_STORAGE: LegacyExternalPatchStorage = Object.freeze({
  strategy: 'legacy-external-storage',
  version: null,
  schema: null,
  encrypted: true,
});

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

export function createLegacyGitCasPatchStorage(
  options: GitCasPatchStorageOptions,
): LegacyGitCasPatchStorage {
  return Object.freeze({
    strategy: 'legacy-git-cas',
    version: LEGACY_GIT_CAS_PATCH_STORAGE_FORMAT,
    schema: LEGACY_GIT_CAS_PATCH_STORAGE_SCHEMA,
    encrypted: options.encrypted,
  });
}

export function isGitCasPatchStorage(
  storage: PatchStorageRoute,
): storage is GitCasAssetPatchStorage {
  return storage.strategy === 'git-cas-asset';
}

export function isLegacyGitCasPatchStorage(
  storage: PatchStorageRoute,
): storage is LegacyGitCasPatchStorage {
  return storage.strategy === 'legacy-git-cas';
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
