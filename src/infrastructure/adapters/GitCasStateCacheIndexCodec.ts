import CacheError from '../../domain/errors/CacheError.ts';
import { textDecode } from '../../domain/utils/bytes.ts';

import type {
  GitCasStateCacheEntry,
  GitCasStateCacheIndex,
} from './GitCasStateCacheIndex.ts';

interface CacheIndexCandidate {
  readonly schemaVersion?: unknown;
  readonly checkpointHeadId?: unknown;
  readonly snapshots?: unknown;
}

const INDEX_SCHEMA_VERSION = 1;

export function createEmptyGitCasStateCacheIndex(): GitCasStateCacheIndex {
  return { schemaVersion: INDEX_SCHEMA_VERSION, snapshots: {} };
}

export function parseGitCasStateCacheIndex(buf: Uint8Array): GitCasStateCacheIndex {
  try {
    return validateParsedIndex(JSON.parse(textDecode(buf)));
  } catch (error) {
    if (error instanceof CacheError) {
      throw error;
    }
    throw new CacheError(
      `GitCasWarpStateCacheAdapter: malformed state-cache index: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function validateParsedIndex(parsed: unknown): GitCasStateCacheIndex {
  const candidate = cacheIndexCandidate(parsed);
  validateIndexSchema(candidate.schemaVersion);
  const checkpointHeadId = validateCheckpointHeadId(candidate.checkpointHeadId);
  const index: GitCasStateCacheIndex = {
    schemaVersion: INDEX_SCHEMA_VERSION,
    snapshots: validateSnapshots(candidate.snapshots),
  };
  if (checkpointHeadId !== undefined) {
    index.checkpointHeadId = checkpointHeadId;
  }
  return index;
}

function cacheIndexCandidate(parsed: unknown): CacheIndexCandidate {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new CacheError('GitCasWarpStateCacheAdapter: state-cache index must be an object');
  }
  return parsed as CacheIndexCandidate;
}

function validateIndexSchema(schemaVersion: unknown): void {
  if (schemaVersion !== INDEX_SCHEMA_VERSION) {
    throw new CacheError(
      `GitCasWarpStateCacheAdapter: unsupported state-cache index schema ${String(schemaVersion)}`,
    );
  }
}

function validateCheckpointHeadId(checkpointHeadId: unknown): string | undefined {
  if (checkpointHeadId !== undefined && typeof checkpointHeadId !== 'string') {
    throw new CacheError('GitCasWarpStateCacheAdapter: checkpointHeadId must be a string');
  }
  return checkpointHeadId;
}

function validateSnapshots(value: unknown): Record<string, GitCasStateCacheEntry> {
  const snapshots = value ?? {};
  if (typeof snapshots !== 'object' || snapshots === null || Array.isArray(snapshots)) {
    throw new CacheError('GitCasWarpStateCacheAdapter: snapshots must be an object');
  }
  return Object.fromEntries(
    Object.entries(snapshots).map(([snapshotId, entry]) => [
      snapshotId,
      validateSnapshotEntry(snapshotId, entry),
    ]),
  );
}

function validateSnapshotEntry(snapshotKey: string, value: unknown): GitCasStateCacheEntry {
  const entry = requiredSnapshotObject(value, snapshotKey, 'entry');
  const {
    snapshotId: rawSnapshotId,
    retention: rawRetention,
    provenancePosture: rawProvenancePosture,
    coordinate,
    stateHash,
    payloadRef,
    createdAt,
  } = entry;
  const snapshotId = requiredSnapshotString(rawSnapshotId, snapshotKey, 'snapshotId');
  if (snapshotId !== snapshotKey) {
    throw snapshotEntryError(snapshotKey, 'snapshotId must match its map key');
  }
  return {
    snapshotId,
    coordinate: validateSnapshotCoordinate(coordinate, snapshotKey),
    retention: validateSnapshotRetention(rawRetention, snapshotKey),
    provenancePosture: validateSnapshotProvenance(rawProvenancePosture, snapshotKey),
    stateHash: requiredSnapshotString(stateHash, snapshotKey, 'stateHash'),
    payloadRef: requiredSnapshotString(payloadRef, snapshotKey, 'payloadRef'),
    createdAt: requiredSnapshotTimestamp(createdAt, snapshotKey, 'createdAt'),
    ...validateOptionalSnapshotFields(entry, snapshotKey),
  };
}

function requiredSnapshotObject(
  value: unknown,
  snapshotId: string,
  field: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw snapshotEntryError(snapshotId, `${field} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function validateSnapshotCoordinate(
  value: unknown,
  snapshotId: string,
): GitCasStateCacheEntry['coordinate'] {
  const coordinate = requiredSnapshotObject(value, snapshotId, 'coordinate');
  return {
    frontier: validateSnapshotFrontier(coordinate['frontier'], snapshotId),
    ceiling: validateSnapshotCeiling(coordinate['ceiling'], snapshotId),
  };
}

function validateSnapshotFrontier(
  value: unknown,
  snapshotId: string,
): Record<string, string> {
  const frontier = requiredSnapshotObject(value, snapshotId, 'coordinate.frontier');
  return Object.fromEntries(
    Object.entries(frontier).map(([writerId, tip]) =>
      validateSnapshotFrontierEntry(writerId, tip, snapshotId)
    ),
  );
}

function validateSnapshotFrontierEntry(
  writerId: string,
  tip: unknown,
  snapshotId: string,
): readonly [string, string] {
  if (writerId.trim().length === 0) {
    throw snapshotEntryError(snapshotId, 'coordinate.frontier writer ids must be non-empty');
  }
  return [
    writerId,
    requiredSnapshotString(tip, snapshotId, `coordinate.frontier.${writerId}`),
  ];
}

function validateSnapshotCeiling(value: unknown, snapshotId: string): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw snapshotEntryError(
      snapshotId,
      'coordinate.ceiling must be null or a non-negative safe integer',
    );
  }
  return value;
}

function validateSnapshotRetention(
  value: unknown,
  snapshotId: string,
): GitCasStateCacheEntry['retention'] {
  if (value !== 'evictable' && value !== 'pinned') {
    throw snapshotEntryError(snapshotId, 'retention must be evictable or pinned');
  }
  return value;
}

function validateSnapshotProvenance(
  value: unknown,
  snapshotId: string,
): GitCasStateCacheEntry['provenancePosture'] {
  if (value !== 'full' && value !== 'degraded') {
    throw snapshotEntryError(snapshotId, 'provenancePosture must be full or degraded');
  }
  return value;
}

function validateOptionalSnapshotFields(
  entry: Readonly<Record<string, unknown>>,
  snapshotId: string,
): Pick<GitCasStateCacheEntry, 'lastAccessedAt' | 'indexTreeOid'> {
  return {
    lastAccessedAt: optionalSnapshotTimestamp(
      entry['lastAccessedAt'],
      snapshotId,
      'lastAccessedAt',
    ),
    indexTreeOid: optionalSnapshotString(entry['indexTreeOid'], snapshotId, 'indexTreeOid'),
  };
}

function requiredSnapshotString(
  value: unknown,
  snapshotId: string,
  field: string,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw snapshotEntryError(snapshotId, `${field} must be a non-empty string`);
  }
  return value;
}

function optionalSnapshotString(
  value: unknown,
  snapshotId: string,
  field: string,
): string | undefined {
  return value === undefined
    ? undefined
    : requiredSnapshotString(value, snapshotId, field);
}

function requiredSnapshotTimestamp(
  value: unknown,
  snapshotId: string,
  field: string,
): string {
  const timestamp = requiredSnapshotString(value, snapshotId, field);
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw snapshotEntryError(snapshotId, `${field} must be a valid timestamp`);
  }
  return timestamp;
}

function optionalSnapshotTimestamp(
  value: unknown,
  snapshotId: string,
  field: string,
): string | undefined {
  return value === undefined
    ? undefined
    : requiredSnapshotTimestamp(value, snapshotId, field);
}

function snapshotEntryError(snapshotId: string, message: string): CacheError {
  return new CacheError(
    `GitCasWarpStateCacheAdapter: snapshot ${snapshotId} ${message}`,
  );
}
