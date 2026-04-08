/**
 * IndexStalenessChecker - Detects stale bitmap indexes by comparing
 * frontier metadata stored at build time against current writer refs.
 */

import defaultCodec from '../../utils/defaultCodec.ts';
import IndexError from '../../errors/IndexError.ts';

/**
 * Checks whether a value is a non-null object.
 *
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isNonNullObject(value) {
  return value !== null && value !== undefined && typeof value === 'object';
}

/**
 * Checks whether an object has the shape of a frontier envelope.
 *
 * @param {unknown} envelope
 * @returns {boolean}
 */
function isFrontierEnvelope(envelope) {
  if (!isNonNullObject(envelope)) {
    return false;
  }
  return 'frontier' in envelope && isNonNullObject(envelope['frontier']);
}

/**
 * Validates that a decoded frontier envelope has the expected shape.
 *
 * @param {unknown} envelope
 * @param {string} label
 * @throws {IndexError} If the envelope is not a valid frontier envelope
 * @private
 */
function validateEnvelope(envelope, label) {
  if (!isFrontierEnvelope(envelope)) {
    throw new IndexError(`invalid frontier envelope for ${label}`, { code: 'E_INDEX_INVALID_FRONTIER' });
  }
}

/**
 * Loads the frontier from an index tree's shard OIDs.
 *
 * @param {Record<string, string>} shardOids - Map of path → blob OID from readTreeOids
 * @param {import('../../../ports/IndexStoragePort.ts').default & import('../../../ports/BlobPort.ts').default} storage - Storage adapter
 * @param {{ codec?: import('../../../ports/CodecPort.ts').default, indexStore?: import('../../../ports/IndexStorePort.ts').default }} [options]
 * @returns {Promise<Map<string, string>|null>} Frontier map, or null if not present (legacy index)
 */
export async function loadIndexFrontier(shardOids, storage, { codec, indexStore } = {}) {
  const deps = buildCborDeps(storage, codec, indexStore);
  return await loadCborFrontier(shardOids, deps)
    ?? await loadJsonFrontier(shardOids, storage)
    ?? null;
}

/**
 * Builds the dependency bag for loadCborFrontier.
 *
 * @param {import('../../../ports/BlobPort.ts').default} storage
 * @param {import('../../../ports/CodecPort.ts').default} [codec]
 * @param {import('../../../ports/IndexStorePort.ts').default} [indexStore]
 * @returns {{ storage: import('../../../ports/BlobPort.ts').default, codec: import('../../../ports/CodecPort.ts').default, indexStore?: import('../../../ports/IndexStorePort.ts').default }}
 */
function buildCborDeps(storage, codec, indexStore) {
  /** @type {{ storage: import('../../../ports/BlobPort.ts').default, codec: import('../../../ports/CodecPort.ts').default, indexStore?: import('../../../ports/IndexStorePort.ts').default }} */
  const deps = { storage, codec: codec ?? defaultCodec };
  if (indexStore) {
    deps.indexStore = indexStore;
  }
  return deps;
}

/**
 * Attempts to load frontier from a CBOR blob.
 *
 * When an IndexStorePort is available, delegates read+decode to the
 * adapter (codec-free from the domain's perspective). Otherwise falls
 * back to raw storage + codec.
 *
 * @param {Record<string, string>} shardOids
 * @param {{ storage: import('../../../ports/BlobPort.ts').default, codec: import('../../../ports/CodecPort.ts').default, indexStore?: import('../../../ports/IndexStorePort.ts').default }} deps
 * @returns {Promise<Map<string, string>|null>}
 */
async function loadCborFrontier(shardOids, { storage, codec, indexStore }) {
  const oid = shardOids['frontier.cbor'];
  if (typeof oid !== 'string' || oid.length === 0) {
    return null;
  }
  /** @type {unknown} */
  let envelope;
  if (indexStore) {
    envelope = await indexStore.decodeShard(oid);
  } else {
    const buffer = await storage.readBlob(oid);
    envelope = codec.decode(buffer);
  }
  validateEnvelope(envelope, 'frontier.cbor');
  return new Map(Object.entries(/** @type {{ frontier: Record<string, string> }} */ (envelope).frontier));
}

/**
 * Attempts to load frontier from a JSON blob.
 *
 * @param {Record<string, string>} shardOids
 * @param {import('../../../ports/BlobPort.ts').default} storage
 * @returns {Promise<Map<string, string>|null>}
 */
async function loadJsonFrontier(shardOids, storage) {
  const oid = shardOids['frontier.json'];
  if (typeof oid !== 'string' || oid.length === 0) {
    return null;
  }
  const buffer = await storage.readBlob(oid);
  const text = new TextDecoder().decode(buffer);
  const parsed = /** @type {unknown} */ (JSON.parse(text));
  const envelope = /** @type {{ frontier: Record<string, string> }} */ (parsed);
  validateEnvelope(envelope, 'frontier.json');
  return new Map(Object.entries(envelope.frontier));
}

/**
 * @typedef {Object} StalenessResult
 * @property {boolean} stale - Whether the index is stale
 * @property {string} reason - Human-readable summary
 * @property {string[]} advancedWriters - Writers whose tips changed
 * @property {string[]} newWriters - Writers not in index frontier
 * @property {string[]} removedWriters - Writers in index but not current
 */

/**
 * Builds a human-readable staleness reason from the diff categories.
 *
 * @param {{ stale: boolean, advancedWriters: string[], newWriters: string[], removedWriters: string[] }} opts
 * @private
 */
function buildReason({ stale, advancedWriters, newWriters, removedWriters }) {
  if (!stale) {
    return 'index is current';
  }
  const parts = [];
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
 *
 * @param {Map<string, string>} indexFrontier - Frontier stored in the index
 * @param {Map<string, string>} currentFrontier - Current frontier from refs
 * @returns {StalenessResult}
 */
export function checkStaleness(indexFrontier, currentFrontier) {
  const advancedWriters = findAdvancedWriters(indexFrontier, currentFrontier);
  const newWriters = findNewWriters(indexFrontier, currentFrontier);
  const removedWriters = findRemovedWriters(indexFrontier, currentFrontier);

  const stale = advancedWriters.length > 0 || newWriters.length > 0 || removedWriters.length > 0;
  const reason = buildReason({ stale, advancedWriters, newWriters, removedWriters });

  return { stale, reason, advancedWriters, newWriters, removedWriters };
}

/**
 * Finds writers whose tips changed between the index and current frontier.
 *
 * @param {Map<string, string>} indexFrontier
 * @param {Map<string, string>} currentFrontier
 * @returns {string[]}
 */
function findAdvancedWriters(indexFrontier, currentFrontier) {
  /** @type {string[]} */
  const result = [];
  for (const [writerId, tipSha] of currentFrontier) {
    const indexTip = indexFrontier.get(writerId);
    if (indexTip !== undefined && indexTip !== tipSha) {
      result.push(writerId);
    }
  }
  return result;
}

/**
 * Finds writers present in current frontier but absent from the index.
 *
 * @param {Map<string, string>} indexFrontier
 * @param {Map<string, string>} currentFrontier
 * @returns {string[]}
 */
function findNewWriters(indexFrontier, currentFrontier) {
  /** @type {string[]} */
  const result = [];
  for (const writerId of currentFrontier.keys()) {
    if (!indexFrontier.has(writerId)) {
      result.push(writerId);
    }
  }
  return result;
}

/**
 * Finds writers present in the index but absent from the current frontier.
 *
 * @param {Map<string, string>} indexFrontier
 * @param {Map<string, string>} currentFrontier
 * @returns {string[]}
 */
function findRemovedWriters(indexFrontier, currentFrontier) {
  /** @type {string[]} */
  const result = [];
  for (const writerId of indexFrontier.keys()) {
    if (!currentFrontier.has(writerId)) {
      result.push(writerId);
    }
  }
  return result;
}
