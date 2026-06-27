import CommitMessageCodecPort, {
  type AnchorCommitMessage,
  CHECKPOINT_STORAGE_FORMAT,
  type CheckpointCommitMessage,
  type CommitMessageKind,
  createGitCasPatchStorage,
  LEGACY_EXTERNAL_PATCH_STORAGE,
  LEGACY_GIT_BLOB_PATCH_STORAGE,
  type PatchCommitMessage,
  PATCH_STORAGE_FORMAT,
  PATCH_STORAGE_SCHEMA_GIT_CAS_CBOR_PATCH,
  type PatchStorageRoute,
} from '../../../ports/CommitMessageCodecPort.ts';
import MessageCodecError from '../../errors/MessageCodecError.ts';
import { validateGraphName, validateWriterId } from '../../utils/RefLayout.ts';
import {
  decodeTrailerTextMessage,
  encodeTrailerTextMessage,
  MESSAGE_TITLES,
  TRAILER_KEYS,
  type TrailerKey,
  validateOid,
  validatePositiveInteger,
  validateSha256,
} from './MessageCodecInternal.ts';

export type {
  AnchorCommitMessage,
  CheckpointCommitMessage,
  PatchCommitMessage,
} from '../../../ports/CommitMessageCodecPort.ts';

export type EncodePatchCompatParams = {
  readonly graph: string;
  readonly writer: string;
  readonly lamport: number;
  readonly patchOid: string;
  readonly schema?: number;
  readonly storage?: PatchStorageRoute;
  readonly encrypted?: boolean;
};

export type DecodePatchCompatMessage = PatchCommitMessage & { readonly encrypted: boolean };

export type EncodeCheckpointCompatParams = {
  readonly graph: string;
  readonly stateHash: string;
  readonly frontierOid: string;
  readonly indexOid: string;
  readonly schema?: number;
  readonly checkpointVersion?: string | null;
};

export type EncodeAnchorCompatParams = {
  readonly graph: string;
  readonly schema?: number;
};

const COMMIT_MESSAGE_KINDS: readonly CommitMessageKind[] = ['patch', 'checkpoint', 'anchor', 'audit'];

function messageCodecError(message: string): MessageCodecError {
  return new MessageCodecError(message, { code: 'E_MESSAGE_CODEC' });
}

type PatchStorageVersionPair = {
  readonly version: string;
  readonly schema: string;
};

function requireTrailer(trailers: Readonly<Record<string, string>>, key: string): string {
  const value = trailers[key];
  if (value === undefined || value === '') {
    throw messageCodecError(`missing required trailer ${key}`);
  }
  return value;
}

function parsePositiveIntegerTrailer(trailers: Readonly<Record<string, string>>, key: string): number {
  const raw = requireTrailer(trailers, key);
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw messageCodecError(`${key} must be a positive integer`);
  }
  return Number(raw);
}

function parseOidTrailer(
  trailers: Readonly<Record<string, string>>,
  key: string,
  fieldName: string,
): string {
  const raw = requireTrailer(trailers, key);
  validateOid(raw, fieldName);
  return raw;
}

function parseSha256Trailer(
  trailers: Readonly<Record<string, string>>,
  key: string,
  fieldName: string,
): string {
  const raw = requireTrailer(trailers, key);
  validateSha256(raw, fieldName);
  return raw;
}

function readOptionalTrailer(
  trailers: Readonly<Record<string, string>>,
  key: TrailerKey,
): string | null {
  return trailers[TRAILER_KEYS[key]] ?? null;
}

function readPatchStorageVersionPair(
  trailers: Readonly<Record<string, string>>,
): PatchStorageVersionPair | null {
  const version = readOptionalTrailer(trailers, 'storageVersion');
  const schema = readOptionalTrailer(trailers, 'storageSchema');
  if (version === null && schema === null) {
    return null;
  }
  if (version === null || schema === null) {
    throw messageCodecError(`${TRAILER_KEYS.storageVersion} and ${TRAILER_KEYS.storageSchema} must be present together`);
  }
  return { version, schema };
}

function readPatchEncryption(trailers: Readonly<Record<string, string>>): boolean {
  return readOptionalTrailer(trailers, 'encrypted') === 'true';
}

function parseGitCasPatchStorage(
  pair: PatchStorageVersionPair,
  encrypted: boolean,
): PatchStorageRoute {
  if (pair.version !== PATCH_STORAGE_FORMAT || pair.schema !== PATCH_STORAGE_SCHEMA_GIT_CAS_CBOR_PATCH) {
    throw messageCodecError('invalid git-cas patch storage trailers');
  }
  return createGitCasPatchStorage(encrypted);
}

function parsePatchStorageRoute(trailers: Readonly<Record<string, string>>): PatchStorageRoute {
  const pair = readPatchStorageVersionPair(trailers);
  const encrypted = readPatchEncryption(trailers);
  if (pair === null) {
    return encrypted ? LEGACY_EXTERNAL_PATCH_STORAGE : LEGACY_GIT_BLOB_PATCH_STORAGE;
  }
  return parseGitCasPatchStorage(pair, encrypted);
}

function requireKind(trailers: Readonly<Record<string, string>>, expected: CommitMessageKind): void {
  if (trailers[TRAILER_KEYS.kind] !== expected) {
    throw messageCodecError(`${TRAILER_KEYS.kind} must be '${expected}'`);
  }
}

function requireTrailers(message: string): Readonly<Record<string, string>> {
  return decodeTrailerTextMessage(message).trailers;
}

function resolveCompatPatchStorage(params: EncodePatchCompatParams): PatchStorageRoute {
  if (params.storage !== undefined) {
    return params.storage;
  }
  if (params.encrypted === true) {
    return LEGACY_EXTERNAL_PATCH_STORAGE;
  }
  return LEGACY_GIT_BLOB_PATCH_STORAGE;
}

function readCommitMessageKind(message: string): CommitMessageKind | null {
  const kind = decodeTrailerTextMessage(message).trailers[TRAILER_KEYS.kind];
  for (const allowedKind of COMMIT_MESSAGE_KINDS) {
    if (kind === allowedKind) {
      return allowedKind;
    }
  }
  return null;
}

/**
 * Text commit-message codec used by domain services through CommitMessageCodecPort.
 */
export class TextCommitMessageCodec extends CommitMessageCodecPort {
  override encodePatch(message: PatchCommitMessage): string {
    validateGraphName(message.graph);
    validateWriterId(message.writer);
    validatePositiveInteger(message.lamport, 'lamport');
    validateOid(message.patchOid, 'patchOid');
    validatePositiveInteger(message.schema, 'schema');

    const trailers: Record<string, string> = {
      [TRAILER_KEYS.kind]: 'patch',
      [TRAILER_KEYS.graph]: message.graph,
      [TRAILER_KEYS.writer]: message.writer,
      [TRAILER_KEYS.lamport]: String(message.lamport),
      [TRAILER_KEYS.patchOid]: message.patchOid,
      [TRAILER_KEYS.schema]: String(message.schema),
    };
    if (message.storage.strategy === 'git-cas') {
      trailers[TRAILER_KEYS.storageVersion] = message.storage.version;
      trailers[TRAILER_KEYS.storageSchema] = message.storage.schema;
    }
    if (message.storage.encrypted) {
      trailers[TRAILER_KEYS.encrypted] = 'true';
    }
    return encodeTrailerTextMessage({
      title: MESSAGE_TITLES.patch,
      trailers,
    });
  }

  override decodePatch(message: string): PatchCommitMessage {
    const trailers = requireTrailers(message);
    requireKind(trailers, 'patch');
    const graph = requireTrailer(trailers, TRAILER_KEYS.graph);
    const writer = requireTrailer(trailers, TRAILER_KEYS.writer);
    validateGraphName(graph);
    validateWriterId(writer);
    return {
      kind: 'patch',
      graph,
      writer,
      lamport: parsePositiveIntegerTrailer(trailers, TRAILER_KEYS.lamport),
      patchOid: parseOidTrailer(trailers, TRAILER_KEYS.patchOid, 'patchOid'),
      schema: parsePositiveIntegerTrailer(trailers, TRAILER_KEYS.schema),
      storage: parsePatchStorageRoute(trailers),
    };
  }

  override encodeCheckpoint(message: CheckpointCommitMessage): string {
    validateGraphName(message.graph);
    validateSha256(message.stateHash, 'stateHash');
    validateOid(message.frontierOid, 'frontierOid');
    validateOid(message.indexOid, 'indexOid');
    validatePositiveInteger(message.schema, 'schema');

    return encodeTrailerTextMessage({
      title: MESSAGE_TITLES.checkpoint,
      trailers: {
        [TRAILER_KEYS.kind]: 'checkpoint',
        [TRAILER_KEYS.graph]: message.graph,
        [TRAILER_KEYS.stateHash]: message.stateHash,
        [TRAILER_KEYS.frontierOid]: message.frontierOid,
        [TRAILER_KEYS.indexOid]: message.indexOid,
        [TRAILER_KEYS.schema]: String(message.schema),
        [TRAILER_KEYS.checkpointVersion]: message.checkpointVersion ?? CHECKPOINT_STORAGE_FORMAT,
      },
    });
  }

  override decodeCheckpoint(message: string): CheckpointCommitMessage {
    const trailers = requireTrailers(message);
    requireKind(trailers, 'checkpoint');
    const graph = requireTrailer(trailers, TRAILER_KEYS.graph);
    validateGraphName(graph);
    return {
      kind: 'checkpoint',
      graph,
      stateHash: parseSha256Trailer(trailers, TRAILER_KEYS.stateHash, 'stateHash'),
      frontierOid: parseOidTrailer(trailers, TRAILER_KEYS.frontierOid, 'frontierOid'),
      indexOid: parseOidTrailer(trailers, TRAILER_KEYS.indexOid, 'indexOid'),
      schema: parsePositiveIntegerTrailer(trailers, TRAILER_KEYS.schema),
      checkpointVersion: trailers[TRAILER_KEYS.checkpointVersion] ?? null,
    };
  }

  override encodeAnchor(message: AnchorCommitMessage): string {
    validateGraphName(message.graph);
    validatePositiveInteger(message.schema, 'schema');
    return encodeTrailerTextMessage({
      title: MESSAGE_TITLES.anchor,
      trailers: {
        [TRAILER_KEYS.kind]: 'anchor',
        [TRAILER_KEYS.graph]: message.graph,
        [TRAILER_KEYS.schema]: String(message.schema),
      },
    });
  }

  override decodeAnchor(message: string): AnchorCommitMessage {
    const trailers = requireTrailers(message);
    requireKind(trailers, 'anchor');
    const graph = requireTrailer(trailers, TRAILER_KEYS.graph);
    validateGraphName(graph);
    return {
      kind: 'anchor',
      graph,
      schema: parsePositiveIntegerTrailer(trailers, TRAILER_KEYS.schema),
    };
  }

  override detectKind(message: string): CommitMessageKind | null {
    try {
      return readCommitMessageKind(message);
    } catch {
      return null;
    }
  }
}

export const DEFAULT_COMMIT_MESSAGE_CODEC = new TextCommitMessageCodec();
Object.freeze(DEFAULT_COMMIT_MESSAGE_CODEC);

export function encodePatchMessage(params: EncodePatchCompatParams): string {
  return DEFAULT_COMMIT_MESSAGE_CODEC.encodePatch({
    kind: 'patch',
    graph: params.graph,
    writer: params.writer,
    lamport: params.lamport,
    patchOid: params.patchOid,
    schema: params.schema ?? 2,
    storage: resolveCompatPatchStorage(params),
  });
}

export function decodePatchMessage(message: string): DecodePatchCompatMessage {
  const decoded = DEFAULT_COMMIT_MESSAGE_CODEC.decodePatch(message);
  return {
    ...decoded,
    encrypted: decoded.storage.encrypted,
  };
}

export function encodeCheckpointMessage(params: EncodeCheckpointCompatParams): string {
  return DEFAULT_COMMIT_MESSAGE_CODEC.encodeCheckpoint({
    kind: 'checkpoint',
    graph: params.graph,
    stateHash: params.stateHash,
    frontierOid: params.frontierOid,
    indexOid: params.indexOid,
    schema: params.schema ?? 2,
    checkpointVersion: params.checkpointVersion ?? CHECKPOINT_STORAGE_FORMAT,
  });
}

export function decodeCheckpointMessage(message: string): CheckpointCommitMessage {
  return DEFAULT_COMMIT_MESSAGE_CODEC.decodeCheckpoint(message);
}

export function encodeAnchorMessage(params: EncodeAnchorCompatParams): string {
  return DEFAULT_COMMIT_MESSAGE_CODEC.encodeAnchor({
    kind: 'anchor',
    graph: params.graph,
    schema: params.schema ?? 2,
  });
}

export function decodeAnchorMessage(message: string): AnchorCommitMessage {
  return DEFAULT_COMMIT_MESSAGE_CODEC.decodeAnchor(message);
}

export function detectMessageKind(message: string): CommitMessageKind | null {
  return DEFAULT_COMMIT_MESSAGE_CODEC.detectKind(message);
}
