import defaultCodec from '../utils/defaultCodec.js';

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
 * @param {Object} [options]
 * @param {import('../../ports/CodecPort.js').default} options.codec - Codec for serialization
 * @returns {Buffer}
 */
export function serializeFrontier(frontier, { codec } = {}) {
  const c = codec || defaultCodec;
  // Convert Map to sorted object for deterministic encoding
  const obj = {};
  const sortedKeys = Array.from(frontier.keys()).sort();
  for (const key of sortedKeys) {
    obj[key] = frontier.get(key);
  }
  return c.encode(obj);
}

/**
 * Deserializes frontier from CBOR bytes.
 * @param {Buffer} buffer
 * @param {Object} [options]
 * @param {import('../../ports/CodecPort.js').default} options.codec - Codec for deserialization
 * @returns {Frontier}
 */
export function deserializeFrontier(buffer, { codec } = {}) {
  const c = codec || defaultCodec;
  const obj = c.decode(buffer);
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
