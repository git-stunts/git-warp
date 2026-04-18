import { TrailerCodec, TrailerCodecService, type TrailerCodecFacade } from '@git-stunts/trailer-codec';
import { z } from 'zod';
import CommitMessageCodecPort, {
  type AnchorCommitMessage,
  type CheckpointCommitMessage,
  CHECKPOINT_VERSION_V5,
  createGitCasPatchStorage,
  type CommitMessageKind,
  LEGACY_EXTERNAL_PATCH_STORAGE,
  LEGACY_GIT_BLOB_PATCH_STORAGE,
  type PatchCommitMessage,
  PATCH_STORAGE_SCHEMA_GIT_CAS_CBOR_PATCH_V1,
  PATCH_STORAGE_VERSION_V17,
  type PatchStorageRoute,
} from '../../ports/CommitMessageCodecPort.ts';
import MessageCodecError from '../../domain/errors/MessageCodecError.ts';
import { validateGraphName, validateWriterId } from '../../domain/utils/RefLayout.ts';

export type {
  AnchorCommitMessage,
  CheckpointCommitMessage,
  PatchCommitMessage,
} from '../../ports/CommitMessageCodecPort.ts';

const OID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export const TRAILER_KEYS = Object.freeze({
  kind: 'eg-kind',
  graph: 'eg-graph',
  writer: 'eg-writer',
  lamport: 'eg-lamport',
  patchOid: 'eg-patch-oid',
  stateHash: 'eg-state-hash',
  frontierOid: 'eg-frontier-oid',
  indexOid: 'eg-index-oid',
  schema: 'eg-schema',
  checkpointVersion: 'eg-checkpoint',
  storageVersion: 'eg-storage-version',
  storageSchema: 'eg-storage-schema',
  encrypted: 'eg-encrypted',
});

const graphNameSchema = z.string().superRefine((value, ctx) => {
  try {
    validateGraphName(value);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

const writerIdSchema = z.string().superRefine((value, ctx) => {
  try {
    validateWriterId(value);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

const oidSchema = z.string().regex(OID_PATTERN, {
  message: 'must be a 40 or 64 character hex string',
});

const sha256Schema = z.string().regex(SHA256_PATTERN, {
  message: 'must be a 64 character hex string',
});

const positiveIntegerSchema = z.number().superRefine((value, ctx) => {
  if (!Number.isInteger(value) || value <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'must be a positive integer',
    });
  }
});

const decodedMessageSchema = z.object({
  trailers: z.record(z.string(), z.string()),
});

const legacyGitBlobStorageSchema = z.object({
  strategy: z.literal('legacy-git-blob'),
  version: z.null(),
  schema: z.null(),
  encrypted: z.literal(false),
});

const legacyExternalStorageSchema = z.object({
  strategy: z.literal('legacy-external-storage'),
  version: z.null(),
  schema: z.null(),
  encrypted: z.literal(true),
});

const gitCasStorageSchema = z.object({
  strategy: z.literal('git-cas'),
  version: z.literal(PATCH_STORAGE_VERSION_V17),
  schema: z.literal(PATCH_STORAGE_SCHEMA_GIT_CAS_CBOR_PATCH_V1),
  encrypted: z.boolean(),
});

const patchStorageSchema = z.union([
  legacyGitBlobStorageSchema,
  legacyExternalStorageSchema,
  gitCasStorageSchema,
]);

const patchCommitMessageSchema = z.object({
  kind: z.literal('patch'),
  graph: graphNameSchema,
  writer: writerIdSchema,
  lamport: positiveIntegerSchema,
  patchOid: oidSchema,
  schema: positiveIntegerSchema,
  storage: patchStorageSchema,
});

const checkpointCommitMessageSchema = z.object({
  kind: z.literal('checkpoint'),
  graph: graphNameSchema,
  stateHash: sha256Schema,
  frontierOid: oidSchema,
  indexOid: oidSchema,
  schema: positiveIntegerSchema,
  checkpointVersion: z.string().nullable(),
});

const anchorCommitMessageSchema = z.object({
  kind: z.literal('anchor'),
  graph: graphNameSchema,
  schema: positiveIntegerSchema,
});

const rawPatchStorageSchema = z.object({
  version: z.string().nullable(),
  schema: z.string().nullable(),
  encrypted: z.boolean(),
}).superRefine((value, ctx) => {
  const versionPresent = value.version !== null;
  const schemaPresent = value.schema !== null;
  if (versionPresent !== schemaPresent) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${TRAILER_KEYS.storageVersion} and ${TRAILER_KEYS.storageSchema} must be present together`,
    });
  }
});

export type EncodePatchCompatParams = {
  graph: string;
  writer: string;
  lamport: number;
  patchOid: string;
  schema?: number;
  storage?: PatchStorageRoute;
  encrypted?: boolean;
};

export type DecodePatchCompatMessage = PatchCommitMessage & { encrypted: boolean };

export type EncodeCheckpointCompatParams = {
  graph: string;
  stateHash: string;
  frontierOid: string;
  indexOid: string;
  schema?: number;
  checkpointVersion?: string | null;
};

export type EncodeAnchorCompatParams = {
  graph: string;
  schema?: number;
};

function messageCodecError(message: string): MessageCodecError {
  return new MessageCodecError(message, { code: 'E_MESSAGE_CODEC' });
}

function requireTrailer(trailers: Record<string, string>, key: string): string {
  const value = trailers[key];
  if (value === undefined || value === '') {
    throw messageCodecError(`missing required trailer ${key}`);
  }
  return value;
}

function parsePositiveIntegerTrailer(trailers: Record<string, string>, key: string): number {
  const raw = requireTrailer(trailers, key);
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw messageCodecError(`${key} must be a positive integer`);
  }
  return Number(raw);
}

function parseOidTrailer(trailers: Record<string, string>, key: string, fieldName: string): string {
  const raw = requireTrailer(trailers, key);
  const parsed = oidSchema.safeParse(raw);
  if (!parsed.success) {
    throw messageCodecError(`Invalid ${fieldName}: ${parsed.error.issues[0]?.message ?? 'invalid OID'}`);
  }
  return parsed.data;
}

function parseSha256Trailer(trailers: Record<string, string>, key: string, fieldName: string): string {
  const raw = requireTrailer(trailers, key);
  const parsed = sha256Schema.safeParse(raw);
  if (!parsed.success) {
    throw messageCodecError(`Invalid ${fieldName}: ${parsed.error.issues[0]?.message ?? 'invalid SHA-256 value'}`);
  }
  return parsed.data;
}

function parsePatchStorageRoute(trailers: Record<string, string>): PatchStorageRoute {
  const parsed = rawPatchStorageSchema.safeParse({
    version: trailers[TRAILER_KEYS.storageVersion] ?? null,
    schema: trailers[TRAILER_KEYS.storageSchema] ?? null,
    encrypted: trailers[TRAILER_KEYS.encrypted] === 'true',
  });
  if (!parsed.success) {
    throw messageCodecError(parsed.error.issues[0]?.message ?? 'invalid patch storage trailers');
  }
  if (parsed.data.version === null) {
    return parsed.data.encrypted ? LEGACY_EXTERNAL_PATCH_STORAGE : LEGACY_GIT_BLOB_PATCH_STORAGE;
  }
  const storage = gitCasStorageSchema.safeParse({
    strategy: 'git-cas',
    version: parsed.data.version,
    schema: parsed.data.schema,
    encrypted: parsed.data.encrypted,
  });
  if (!storage.success) {
    throw messageCodecError(storage.error.issues[0]?.message ?? 'invalid git-cas patch storage trailers');
  }
  return createGitCasPatchStorage(storage.data.encrypted);
}

export class TrailerCommitMessageCodecAdapter extends CommitMessageCodecPort {
  private readonly _codec: TrailerCodecFacade;

  constructor() {
    super();
    this._codec = new TrailerCodec({ service: new TrailerCodecService() });
  }

  override encodePatch(message: PatchCommitMessage): string {
    const parsed = patchCommitMessageSchema.safeParse(message);
    if (!parsed.success) {
      throw messageCodecError(parsed.error.issues[0]?.message ?? 'invalid patch commit message');
    }
    const trailers: Record<string, string> = {
      [TRAILER_KEYS.kind]: 'patch',
      [TRAILER_KEYS.graph]: parsed.data.graph,
      [TRAILER_KEYS.writer]: parsed.data.writer,
      [TRAILER_KEYS.lamport]: String(parsed.data.lamport),
      [TRAILER_KEYS.patchOid]: parsed.data.patchOid,
      [TRAILER_KEYS.schema]: String(parsed.data.schema),
    };
    if (parsed.data.storage.strategy === 'git-cas') {
      trailers[TRAILER_KEYS.storageVersion] = parsed.data.storage.version;
      trailers[TRAILER_KEYS.storageSchema] = parsed.data.storage.schema;
    }
    if (parsed.data.storage.encrypted) {
      trailers[TRAILER_KEYS.encrypted] = 'true';
    }
    return this._codec.encode({
      title: 'warp:patch',
      trailers,
    });
  }

  override decodePatch(message: string): PatchCommitMessage {
    const trailers = decodedMessageSchema.parse(this._codec.decode(message)).trailers;
    if (trailers[TRAILER_KEYS.kind] !== 'patch') {
      throw messageCodecError(`${TRAILER_KEYS.kind} must be 'patch'`);
    }
    const parsed = patchCommitMessageSchema.safeParse({
      kind: 'patch',
      graph: requireTrailer(trailers, TRAILER_KEYS.graph),
      writer: requireTrailer(trailers, TRAILER_KEYS.writer),
      lamport: parsePositiveIntegerTrailer(trailers, TRAILER_KEYS.lamport),
      patchOid: parseOidTrailer(trailers, TRAILER_KEYS.patchOid, 'patchOid'),
      schema: parsePositiveIntegerTrailer(trailers, TRAILER_KEYS.schema),
      storage: parsePatchStorageRoute(trailers),
    });
    if (!parsed.success) {
      throw messageCodecError(parsed.error.issues[0]?.message ?? 'invalid patch commit message');
    }
    return parsed.data;
  }

  override encodeCheckpoint(message: CheckpointCommitMessage): string {
    const parsed = checkpointCommitMessageSchema.safeParse({
      ...message,
      checkpointVersion: message.checkpointVersion ?? CHECKPOINT_VERSION_V5,
    });
    if (!parsed.success) {
      throw messageCodecError(parsed.error.issues[0]?.message ?? 'invalid checkpoint commit message');
    }
    return this._codec.encode({
      title: 'warp:checkpoint',
      trailers: {
        [TRAILER_KEYS.kind]: 'checkpoint',
        [TRAILER_KEYS.graph]: parsed.data.graph,
        [TRAILER_KEYS.stateHash]: parsed.data.stateHash,
        [TRAILER_KEYS.frontierOid]: parsed.data.frontierOid,
        [TRAILER_KEYS.indexOid]: parsed.data.indexOid,
        [TRAILER_KEYS.schema]: String(parsed.data.schema),
        [TRAILER_KEYS.checkpointVersion]: parsed.data.checkpointVersion ?? CHECKPOINT_VERSION_V5,
      },
    });
  }

  override decodeCheckpoint(message: string): CheckpointCommitMessage {
    const trailers = decodedMessageSchema.parse(this._codec.decode(message)).trailers;
    if (trailers[TRAILER_KEYS.kind] !== 'checkpoint') {
      throw messageCodecError(`${TRAILER_KEYS.kind} must be 'checkpoint'`);
    }
    const parsed = checkpointCommitMessageSchema.safeParse({
      kind: 'checkpoint',
      graph: requireTrailer(trailers, TRAILER_KEYS.graph),
      stateHash: parseSha256Trailer(trailers, TRAILER_KEYS.stateHash, 'stateHash'),
      frontierOid: parseOidTrailer(trailers, TRAILER_KEYS.frontierOid, 'frontierOid'),
      indexOid: parseOidTrailer(trailers, TRAILER_KEYS.indexOid, 'indexOid'),
      schema: parsePositiveIntegerTrailer(trailers, TRAILER_KEYS.schema),
      checkpointVersion: trailers[TRAILER_KEYS.checkpointVersion] ?? null,
    });
    if (!parsed.success) {
      throw messageCodecError(parsed.error.issues[0]?.message ?? 'invalid checkpoint commit message');
    }
    return parsed.data;
  }

  override encodeAnchor(message: AnchorCommitMessage): string {
    const parsed = anchorCommitMessageSchema.safeParse(message);
    if (!parsed.success) {
      throw messageCodecError(parsed.error.issues[0]?.message ?? 'invalid anchor commit message');
    }
    return this._codec.encode({
      title: 'warp:anchor',
      trailers: {
        [TRAILER_KEYS.kind]: 'anchor',
        [TRAILER_KEYS.graph]: parsed.data.graph,
        [TRAILER_KEYS.schema]: String(parsed.data.schema),
      },
    });
  }

  override decodeAnchor(message: string): AnchorCommitMessage {
    const trailers = decodedMessageSchema.parse(this._codec.decode(message)).trailers;
    if (trailers[TRAILER_KEYS.kind] !== 'anchor') {
      throw messageCodecError(`${TRAILER_KEYS.kind} must be 'anchor'`);
    }
    const parsed = anchorCommitMessageSchema.safeParse({
      kind: 'anchor',
      graph: requireTrailer(trailers, TRAILER_KEYS.graph),
      schema: parsePositiveIntegerTrailer(trailers, TRAILER_KEYS.schema),
    });
    if (!parsed.success) {
      throw messageCodecError(parsed.error.issues[0]?.message ?? 'invalid anchor commit message');
    }
    return parsed.data;
  }

  override detectKind(message: string): CommitMessageKind | null {
    try {
      const trailers = decodedMessageSchema.parse(this._codec.decode(message)).trailers;
      const kind = trailers[TRAILER_KEYS.kind];
      if (kind === 'patch' || kind === 'checkpoint' || kind === 'anchor' || kind === 'audit') {
        return kind;
      }
      return null;
    } catch {
      return null;
    }
  }
}

export const DEFAULT_COMMIT_MESSAGE_CODEC = new TrailerCommitMessageCodecAdapter();

function resolveCompatPatchStorage(params: EncodePatchCompatParams): PatchStorageRoute {
  if (params.storage !== undefined) {
    return params.storage;
  }
  if (params.encrypted === true) {
    return LEGACY_EXTERNAL_PATCH_STORAGE;
  }
  return LEGACY_GIT_BLOB_PATCH_STORAGE;
}

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
    checkpointVersion: params.checkpointVersion ?? CHECKPOINT_VERSION_V5,
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
