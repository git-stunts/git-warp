/**
 * IndexStalenessChecker - Detects stale bitmap indexes by comparing
 * frontier metadata stored at build time against current writer refs.
 */

import defaultCodec from '../../utils/defaultCodec.ts';
import IndexError from '../../errors/IndexError.ts';
import type BlobPort from '../../../ports/BlobPort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type IndexStoragePort from '../../../ports/IndexStoragePort.ts';
import type IndexStorePort from '../../../ports/IndexStorePort.ts';

function isNonNullObject(value: unknown): value is Record<string, unknown> { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return value !== null && value !== undefined && typeof value === 'object';
}

function isFrontierEnvelope(envelope: unknown): envelope is { frontier: Record<string, string> } {
  if (!isNonNullObject(envelope)) {
    return false;
  }
  return 'frontier' in envelope && isNonNullObject(envelope['frontier']);
}

function validateEnvelope(envelope: unknown, label: string): asserts envelope is { frontier: Record<string, string> } { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (!isFrontierEnvelope(envelope)) {
    throw new IndexError(`invalid frontier envelope for ${label}`, { code: 'E_INDEX_INVALID_FRONTIER' });
  }
}

type CborDeps = {
  storage: BlobPort;
  codec: CodecPort;
  indexStore?: IndexStorePort;
};

/**
 * Loads the frontier from an index tree's shard OIDs.
 *
 * @returns Frontier map, or null if not present (legacy index)
 */
export async function loadIndexFrontier(
  shardOids: Record<string, string>,
  storage: IndexStoragePort & BlobPort,
  options?: { codec?: CodecPort; indexStore?: IndexStorePort },
): Promise<Map<string, string> | null> {
  const { codec, indexStore } = options ?? {};
  const deps = buildCborDeps(storage, codec, indexStore);
  return await loadCborFrontier(shardOids, deps)
    ?? await loadJsonFrontier(shardOids, storage)
    ?? null;
}

function buildCborDeps(
  storage: BlobPort,
  codec?: CodecPort,
  indexStore?: IndexStorePort,
): CborDeps {
  const deps: CborDeps = { storage, codec: codec ?? defaultCodec };
  if (indexStore) {
    deps.indexStore = indexStore;
  }
  return deps;
}

async function loadCborFrontier(
  shardOids: Record<string, string>,
  { storage, codec, indexStore }: CborDeps,
): Promise<Map<string, string> | null> {
  const oid = shardOids['frontier.cbor'];
  if (typeof oid !== 'string' || oid.length === 0) {
    return null;
  }
  let envelope: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (indexStore) {
    envelope = await indexStore.decodeShard(oid);
  } else {
    const buffer = await storage.readBlob(oid);
    envelope = codec.decode(buffer);
  }
  validateEnvelope(envelope, 'frontier.cbor');
  return new Map(Object.entries(envelope.frontier));
}

async function loadJsonFrontier(
  shardOids: Record<string, string>,
  storage: BlobPort,
): Promise<Map<string, string> | null> {
  const oid = shardOids['frontier.json'];
  if (typeof oid !== 'string' || oid.length === 0) {
    return null;
  }
  const buffer = await storage.readBlob(oid);
  const text = new TextDecoder().decode(buffer);
  const parsed: unknown = JSON.parse(text); // nosemgrep: ts-no-json-parse-in-core -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  validateEnvelope(parsed, 'frontier.json');
  return new Map(Object.entries(parsed.frontier));
}

export interface StalenessResult {
  stale: boolean;
  reason: string;
  advancedWriters: string[];
  newWriters: string[];
  removedWriters: string[];
}

function buildReason(opts: {
  stale: boolean;
  advancedWriters: string[];
  newWriters: string[];
  removedWriters: string[];
}): string {
  const { stale, advancedWriters, newWriters, removedWriters } = opts;
  if (!stale) {
    return 'index is current';
  }
  const parts: string[] = [];
  if (advancedWriters.length > 0) {
    parts.push(`${advancedWriters.length} writer(s) advanced`);
  }
  if (newWriters.length > 0) {
    parts.push(`${newWriters.length} new writer(s)`);
  }
  if (removedWriters.length > 0) {
    parts.push(`${removedWriters.length} writer(s) removed`);
  }
  return parts.join(', ');
}

/**
 * Compares index frontier against current frontier to detect staleness.
 */
export function checkStaleness(
  indexFrontier: Map<string, string>,
  currentFrontier: Map<string, string>,
): StalenessResult {
  const advancedWriters = findAdvancedWriters(indexFrontier, currentFrontier);
  const newWriters = findNewWriters(indexFrontier, currentFrontier);
  const removedWriters = findRemovedWriters(indexFrontier, currentFrontier);

  const stale = advancedWriters.length > 0 || newWriters.length > 0 || removedWriters.length > 0;
  const reason = buildReason({ stale, advancedWriters, newWriters, removedWriters });

  return { stale, reason, advancedWriters, newWriters, removedWriters };
}

function findAdvancedWriters(
  indexFrontier: Map<string, string>,
  currentFrontier: Map<string, string>,
): string[] {
  const result: string[] = [];
  for (const [writerId, tipSha] of currentFrontier) {
    const indexTip = indexFrontier.get(writerId);
    if (indexTip !== undefined && indexTip !== tipSha) {
      result.push(writerId);
    }
  }
  return result;
}

function findNewWriters(
  indexFrontier: Map<string, string>,
  currentFrontier: Map<string, string>,
): string[] {
  const result: string[] = [];
  for (const writerId of currentFrontier.keys()) {
    if (!indexFrontier.has(writerId)) {
      result.push(writerId);
    }
  }
  return result;
}

function findRemovedWriters(
  indexFrontier: Map<string, string>,
  currentFrontier: Map<string, string>,
): string[] {
  const result: string[] = [];
  for (const writerId of indexFrontier.keys()) {
    if (!currentFrontier.has(writerId)) {
      result.push(writerId);
    }
  }
  return result;
}
