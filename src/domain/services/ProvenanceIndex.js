import defaultCodec from '../utils/defaultCodec.js';

/**
 * ProvenanceIndex - Node-to-Patch SHA Index
 *
 * Implements HG/IO/2: Build nodeId-to-patchSha index from I/O declarations.
 * This enables quick answers to "which patches affected node X?" without
 * replaying all patches.
 *
 * The index maps:
 * - nodeId -> Set<patchSha> (patches that read or wrote this node)
 *
 * This supports the computational holography theorem from Paper III:
 * given a target node, we can compute its backward causal cone D(v)
 * by walking the index.
 *
 * @module domain/services/ProvenanceIndex
 */

/**
 * ProvenanceIndex - Maps node/edge IDs to contributing patch SHAs.
 *
 * This index is built incrementally during materialization by extracting
 * the `reads` and `writes` arrays from each patch's I/O declarations
 * (implemented by HG/IO/1).
 *
 * ## Usage
 *
 * ```javascript
 * const index = new ProvenanceIndex();
 *
 * // During materialization, add each patch's I/O declarations
 * index.addPatch(patchSha, patch.reads, patch.writes);
 *
 * // Query: which patches affected this node?
 * const shas = index.patchesFor('user:alice');
 * // Returns: ['abc123', 'def456', ...]
 * ```
 *
 * ## Persistence
 *
 * The index can be serialized for checkpoint storage:
 * ```javascript
 * const buffer = index.serialize();
 * // Store in checkpoint tree as provenanceIndex.cbor
 *
 * // Later, restore from checkpoint
 * const index = ProvenanceIndex.deserialize(buffer);
 * ```
 */
class ProvenanceIndex {
  /**
   * Internal index mapping nodeId/edgeKey to Set of patch SHAs.
   * @type {Map<string, Set<string>>}
   */
  #index;

  /**
   * Creates a new ProvenanceIndex.
   *
   * @param {Map<string, Set<string>>} [initialIndex] - Optional initial index data (defensively copied)
   */
  constructor(initialIndex) {
    if (initialIndex) {
      // Defensive copy to prevent external mutation
      this.#index = new Map();
      for (const [k, v] of initialIndex) {
        this.#index.set(k, new Set(v));
      }
    } else {
      this.#index = new Map();
    }
  }

  /**
   * Creates an empty ProvenanceIndex.
   *
   * @returns {ProvenanceIndex} A fresh, empty index
   */
  static empty() {
    return new ProvenanceIndex();
  }

  /**
   * Adds a patch's I/O declarations to the index.
   *
   * Both reads and writes are indexed because both indicate that
   * the patch "affected" the entity:
   * - Writes: the patch modified the entity
   * - Reads: the patch's result depends on the entity's state
   *
   * This enables computing the full backward causal cone for slicing.
   *
   * @param {string} patchSha - The Git SHA of the patch commit
   * @param {string[]|undefined} reads - Array of nodeIds/edgeKeys read by this patch
   * @param {string[]|undefined} writes - Array of nodeIds/edgeKeys written by this patch
   * @returns {ProvenanceIndex} This index for chaining
   */
  addPatch(patchSha, reads, writes) {
    // Index all reads
    if (reads && reads.length > 0) {
      for (const entityId of reads) {
        this.#addEntry(entityId, patchSha);
      }
    }

    // Index all writes
    if (writes && writes.length > 0) {
      for (const entityId of writes) {
        this.#addEntry(entityId, patchSha);
      }
    }

    return this;
  }

  /**
   * Adds a single entry to the index.
   *
   * @param {string} entityId - The node ID or edge key
   * @param {string} patchSha - The patch SHA
   */
  #addEntry(entityId, patchSha) {
    let shas = this.#index.get(entityId);
    if (!shas) {
      shas = new Set();
      this.#index.set(entityId, shas);
    }
    shas.add(patchSha);
  }

  /**
   * Returns all patch SHAs that affected a given node or edge.
   *
   * "Affected" means the patch either read from or wrote to the entity.
   * The returned array is sorted alphabetically for determinism.
   *
   * @param {string} entityId - The node ID or edge key to query
   * @returns {string[]} Array of patch SHAs, sorted alphabetically
   *
   * @example
   * const shas = index.patchesFor('user:alice');
   * // Returns: ['abc123', 'def456', 'ghi789']
   */
  patchesFor(entityId) {
    const shas = this.#index.get(entityId);
    if (!shas || shas.size === 0) {
      return [];
    }
    return [...shas].sort();
  }

  /**
   * Returns whether the index has any entries for a given entity.
   *
   * @param {string} entityId - The node ID or edge key to check
   * @returns {boolean} True if the entity has at least one contributing patch
   */
  has(entityId) {
    const shas = this.#index.get(entityId);
    return shas !== undefined && shas.size > 0;
  }

  /**
   * Returns the number of entities in the index.
   *
   * @returns {number} Count of indexed entities
   */
  get size() {
    return this.#index.size;
  }

  /**
   * Returns all entity IDs in the index.
   *
   * @returns {string[]} Array of entity IDs, sorted alphabetically
   */
  entities() {
    return [...this.#index.keys()].sort();
  }

  /**
   * Clears all entries from the index.
   *
   * @returns {ProvenanceIndex} This index for chaining
   */
  clear() {
    this.#index.clear();
    return this;
  }

  /**
   * Merges another index into this one.
   *
   * All entries from the other index are added to this index.
   * This is useful for combining indexes from different sources
   * (e.g., checkpoint index + incremental patches).
   *
   * @param {ProvenanceIndex} other - The index to merge in
   * @returns {ProvenanceIndex} This index for chaining
   */
  merge(other) {
    for (const [entityId, shas] of other.#index) {
      for (const sha of shas) {
        this.#addEntry(entityId, sha);
      }
    }
    return this;
  }

  /**
   * Creates a clone of this index.
   *
   * @returns {ProvenanceIndex} A new index with the same data
   */
  clone() {
    const clonedMap = new Map();
    for (const [entityId, shas] of this.#index) {
      clonedMap.set(entityId, new Set(shas));
    }
    return new ProvenanceIndex(clonedMap);
  }

  /**
   * Returns sorted entries for deterministic output.
   *
   * @returns {Array<[string, string[]]>} Sorted array of [entityId, sortedShas[]] pairs
   */
  #sortedEntries() {
    /** @type {Array<[string, string[]]>} */
    const entries = [];
    for (const [entityId, shas] of this.#index) {
      entries.push(/** @type {[string, string[]]} */ ([entityId, [...shas].sort()]));
    }
    entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return entries;
  }

  /**
   * Serializes the index to CBOR format for checkpoint storage.
   *
   * The serialized format is a sorted array of [entityId, sortedShas[]] pairs
   * for deterministic output.
   *
   * @param {Object} [options]
   * @param {import('../../ports/CodecPort.js').default} [options.codec] - Codec for serialization
   * @returns {Buffer|Uint8Array} CBOR-encoded index
   */
  serialize({ codec } = {}) {
    const c = codec || defaultCodec;
    return c.encode({ version: 1, entries: this.#sortedEntries() });
  }

  /**
   * Builds an index Map from an entries array.
   *
   * @param {Array<[string, string[]]>} entries - Array of [entityId, shas[]] pairs
   * @returns {Map<string, Set<string>>} The built index
   */
  static #buildIndex(entries) {
    const index = new Map();
    for (const [entityId, shas] of entries) {
      index.set(entityId, new Set(shas));
    }
    return index;
  }

  /**
   * Deserializes an index from CBOR format.
   *
   * @param {Buffer} buffer - CBOR-encoded index
   * @param {Object} [options]
   * @param {import('../../ports/CodecPort.js').default} [options.codec] - Codec for deserialization
   * @returns {ProvenanceIndex} The deserialized index
   * @throws {Error} If the buffer contains an unsupported version
   */
  static deserialize(buffer, { codec } = {}) {
    const c = codec || defaultCodec;
    /** @type {{ version?: number, entries?: Array<[string, string[]]> }} */
    const obj = /** @type {any} */ (c.decode(buffer)); // TODO(ts-cleanup): narrow port type

    if (obj.version !== 1) {
      throw new Error(`Unsupported ProvenanceIndex version: ${obj.version}`);
    }

    if (!obj.entries || !Array.isArray(obj.entries)) {
      throw new Error('Missing or invalid ProvenanceIndex entries');
    }

    return new ProvenanceIndex(ProvenanceIndex.#buildIndex(obj.entries));
  }

  /**
   * Returns a JSON-serializable representation of this index.
   *
   * @returns {Object} Object with version and entries array
   */
  toJSON() {
    return { version: 1, entries: this.#sortedEntries() };
  }

  /**
   * Creates a ProvenanceIndex from a JSON representation.
   *
   * @param {{ version?: number, entries?: Array<[string, string[]]> }} json - Object with version and entries array
   * @returns {ProvenanceIndex} The deserialized index
   * @throws {Error} If the JSON contains an unsupported version
   */
  static fromJSON(json) {
    if (json.version !== 1) {
      throw new Error(`Unsupported ProvenanceIndex version: ${json.version}`);
    }

    if (!json.entries || !Array.isArray(json.entries)) {
      throw new Error('Missing or invalid ProvenanceIndex entries');
    }

    return new ProvenanceIndex(ProvenanceIndex.#buildIndex(json.entries || []));
  }

  /**
   * Returns an iterator over [entityId, patchShas[]] pairs in deterministic order.
   * Uses #sortedEntries() to ensure consistent ordering across iterations.
   *
   * @returns {Iterator<[string, string[]]>} Iterator over index entries
   */
  *[Symbol.iterator]() {
    for (const entry of this.#sortedEntries()) {
      yield entry;
    }
  }
}

export default ProvenanceIndex;
export { ProvenanceIndex };
