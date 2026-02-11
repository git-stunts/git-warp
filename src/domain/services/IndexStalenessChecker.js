/**
 * IndexStalenessChecker - Detects stale bitmap indexes by comparing
 * frontier metadata stored at build time against current writer refs.
 */

import defaultCodec from '../utils/defaultCodec.js';

/**
 * @param {*} envelope
 * @param {string} label
 * @private
 */
function validateEnvelope(envelope, label) {
  if (!envelope || typeof envelope !== 'object' || !envelope.frontier || typeof envelope.frontier !== 'object') {
    throw new Error(`invalid frontier envelope for ${label}`);
  }
}

/**
 * Loads the frontier from an index tree's shard OIDs.
 *
 * @param {Record<string, string>} shardOids - Map of path → blob OID from readTreeOids
 * @param {import('../../ports/IndexStoragePort.js').default & import('../../ports/BlobPort.js').default} storage - Storage adapter
 * @param {Object} [options]
 * @param {import('../../ports/CodecPort.js').default} [options.codec] - Codec for deserialization
 * @returns {Promise<Map<string, string>|null>} Frontier map, or null if not present (legacy index)
 */
export async function loadIndexFrontier(shardOids, storage, { codec } = /** @type {*} */ ({})) { // TODO(ts-cleanup): needs options type
  const c = codec || defaultCodec;
  const cborOid = shardOids['frontier.cbor'];
  if (cborOid) {
    const buffer = await storage.readBlob(cborOid);
    const envelope = /** @type {{ frontier: Record<string, string> }} */ (c.decode(buffer));
    validateEnvelope(envelope, 'frontier.cbor');
    return new Map(Object.entries(envelope.frontier));
  }

  const jsonOid = shardOids['frontier.json'];
  if (jsonOid) {
    const buffer = await storage.readBlob(jsonOid);
    const envelope = /** @type {{ frontier: Record<string, string> }} */ (JSON.parse(buffer.toString('utf-8')));
    validateEnvelope(envelope, 'frontier.json');
    return new Map(Object.entries(envelope.frontier));
  }

  return null;
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
  const advancedWriters = [];
  const newWriters = [];
  const removedWriters = [];

  for (const [writerId, tipSha] of currentFrontier) {
    const indexTip = indexFrontier.get(writerId);
    if (indexTip === undefined) {
      newWriters.push(writerId);
    } else if (indexTip !== tipSha) {
      advancedWriters.push(writerId);
    }
  }

  for (const writerId of indexFrontier.keys()) {
    if (!currentFrontier.has(writerId)) {
      removedWriters.push(writerId);
    }
  }

  const stale = advancedWriters.length > 0 || newWriters.length > 0 || removedWriters.length > 0;
  const reason = buildReason({ stale, advancedWriters, newWriters, removedWriters });

  return { stale, reason, advancedWriters, newWriters, removedWriters };
}
