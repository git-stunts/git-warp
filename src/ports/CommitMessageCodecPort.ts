export const PATCH_STORAGE_FORMAT = 'v17';
export const PATCH_STORAGE_SCHEMA_GIT_CAS_CBOR_PATCH = 'git-cas-cbor-patch-v1';
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

export interface GitCasPatchStorage {
  strategy: 'git-cas';
  version: typeof PATCH_STORAGE_FORMAT;
  schema: typeof PATCH_STORAGE_SCHEMA_GIT_CAS_CBOR_PATCH;
  encrypted: boolean;
}

export type PatchStorageRoute =
  | LegacyGitBlobPatchStorage
  | LegacyExternalPatchStorage
  | GitCasPatchStorage;

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

export function createGitCasPatchStorage(encrypted: boolean): GitCasPatchStorage {
  return Object.freeze({
    strategy: 'git-cas',
    version: PATCH_STORAGE_FORMAT,
    schema: PATCH_STORAGE_SCHEMA_GIT_CAS_CBOR_PATCH,
    encrypted,
  });
}

export function isGitCasPatchStorage(storage: PatchStorageRoute): storage is GitCasPatchStorage {
  return storage.strategy === 'git-cas';
}

export interface PatchCommitMessage {
  kind: 'patch';
  graph: string;
  writer: string;
  lamport: number;
  patchOid: string;
  schema: number;
  storage: PatchStorageRoute;
}

export interface CheckpointCommitMessage {
  kind: 'checkpoint';
  graph: string;
  stateHash: string;
  frontierOid: string;
  indexOid: string;
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
