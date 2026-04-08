import defaultCodec from '../utils/defaultCodec.ts';

/**
 * Frontier: Map of writerId -> lastSeenPatchSha
 * @typedef {Map<string, string>} Frontier
 */

/**
 * Creates an empty frontier.
 * @returns {Frontier}
 */
export function createFrontier() {
  return new Map();
}

/**
 * Updates the frontier with a new patch.
 * Mutates the frontier in place.
 *
 * @param {Frontier} frontier - The frontier to update
 * @param {string} writerId - Writer ID
 * @param {string} patchSha - Latest patch SHA for this writer
 * @returns {void}
 */
export function updateFrontier(frontier, writerId, patchSha) {
  frontier.set(writerId, patchSha);
}

/**
 * Gets the last-seen patch SHA for a writer.
 * @param {Frontier} frontier
 * @param {string} writerId
 * @returns {string | undefined}
 */
export function getFrontierEntry(frontier, writerId) {
  return frontier.get(writerId);
}

/**
 * Lists all writers in the frontier.
 * @param {Frontier} frontier
 * @returns {string[]} Sorted list of writer IDs
 */
export function getWriters(frontier) {
  return Array.from(frontier.keys()).sort();
}

/**
 * Serializes frontier to canonical CBOR bytes.
 * Keys are sorted for determinism.
 * @param {Frontier} frontier
 * @param {{ codec?: import('../../ports/CodecPort.ts').default }} [options]
 * @returns {Uint8Array}
 */
export function serializeFrontier(frontier, { codec } = /** @type {{codec?: import('../../ports/CodecPort.ts').default}} */ ({})) {
  const c = codec || defaultCodec;
  // Convert Map to sorted object for deterministic encoding
  /** @type {Record<string, string|undefined>} */
  const obj = {};
  const sortedKeys = Array.from(frontier.keys()).sort();
  for (const key of sortedKeys) {
    obj[key] = frontier.get(key);
  }
  return c.encode(obj);
}

/**
 * Deserializes frontier from CBOR bytes.
 * @param {Uint8Array} buffer
 * @param {{ codec?: import('../../ports/CodecPort.ts').default }} [options]
 * @returns {Frontier}
 */
export function deserializeFrontier(buffer, { codec } = /** @type {{codec?: import('../../ports/CodecPort.ts').default}} */ ({})) {
  const c = codec || defaultCodec;
  const obj = /** @type {Record<string, string>} */ (c.decode(buffer));
  /** @type {Frontier} */
  const frontier = new Map();
  for (const [writerId, patchSha] of Object.entries(obj)) {
    frontier.set(writerId, patchSha);
  }
  return frontier;
}

/**
 * Clones a frontier.
 * @param {Frontier} frontier
 * @returns {Frontier}
 */
export function cloneFrontier(frontier) {
  return new Map(frontier);
}

/**
 * Produces a stable, deterministic fingerprint of a frontier.
 *
 * Sorts entries by writer ID and JSON-stringifies the sorted pairs.
 * Two frontiers produce the same fingerprint iff they have identical
 * writer→SHA mappings. Used for snapshot isolation checks (B63)
 * and diagnostic logging.
 *
 * @param {Frontier} frontier
 * @returns {string} Deterministic JSON string of sorted entries
 */
export function frontierFingerprint(frontier) {
  const sorted = [...frontier.entries()].sort(
    ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
  );
  return JSON.stringify(sorted);
}

/**
 * Merges two frontiers, taking the "later" entry for each writer.
 * Note: This is a simple merge that takes entries from both.
 * For proper "later" detection, you'd need to compare patch ancestry.
 * @param {Frontier} a
 * @param {Frontier} b
 * @returns {Frontier}
 */
export function mergeFrontiers(a, b) {
  const merged = new Map(a);
  for (const [writerId, patchSha] of b) {
    // Simple: b overwrites a (caller determines order)
    merged.set(writerId, patchSha);
  }
  return merged;
}
