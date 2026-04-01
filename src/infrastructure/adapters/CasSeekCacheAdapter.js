/**
 * CAS-backed seek materialization cache adapter.
 *
 * Implements SeekCachePort using @git-stunts/git-cas for persistent storage
 * of serialized WarpStateV5 snapshots. Each cached state is stored as a CAS
 * asset (chunked blobs + manifest tree), and an index ref tracks the mapping
 * from cache keys to tree OIDs.
 *
 * Index ref: `refs/warp/<graphName>/seek-cache` → blob containing JSON index.
 *
 * Blobs are loose Git objects — `git gc` prunes them using the configured
 * prune expiry (default ~2 weeks). Use vault pinning for GC-safe persistence.
 *
 * **Requires Node >= 22.0.0** (inherited from `@git-stunts/git-cas`).
 *
 * @module infrastructure/adapters/CasSeekCacheAdapter
 */

/**
 * Minimal interface for the ContentAddressableStore from @git-stunts/git-cas.
 * @typedef {{ readManifest: (opts: { treeOid: string }) => Promise<unknown>, restore: (opts: { manifest: unknown, encryptionKey?: Uint8Array }) => Promise<{ buffer: Uint8Array }>, restoreStream?: (opts: { manifest: unknown, encryptionKey?: Uint8Array }) => AsyncIterable<Uint8Array>, store: (opts: { source: import('node:stream').Readable, slug: string, filename: string, encryptionKey?: Uint8Array }) => Promise<unknown>, createTree: (opts: { manifest: unknown }) => Promise<string> }} CasStore
 */

/**
 * Persistence port subset used by CasSeekCacheAdapter for Git ref and blob operations.
 * @typedef {{ readRef: (ref: string) => Promise<string|null>, readBlob: (oid: string) => Promise<Uint8Array>, writeBlob: (data: Uint8Array) => Promise<string>, updateRef: (ref: string, oid: string) => Promise<void>, deleteRef: (ref: string) => Promise<void> }} CachePersistence
 */

import SeekCachePort from '../../ports/SeekCachePort.js';
import { buildSeekCacheRef } from '../../domain/utils/RefLayout.js';
import { createLazyCas } from './lazyCasInit.js';
import LoggerObservabilityBridge from './LoggerObservabilityBridge.js';
import CacheError from '../../domain/errors/CacheError.js';
import { textEncode, textDecode, concatBytes } from '../../domain/utils/bytes.js';
import { Readable } from 'node:stream';

const DEFAULT_MAX_ENTRIES = 200;
const INDEX_SCHEMA_VERSION = 1;
const MAX_CAS_RETRIES = 3;

/**
 * Returns a fresh empty cache index with the current schema version.
 * @returns {CacheIndex}
 */
function _emptyIndex() {
  return { schemaVersion: INDEX_SCHEMA_VERSION, entries: {} };
}

/**
 * Parses a raw blob into a CacheIndex, returning empty on schema mismatch.
 * @param {Uint8Array} buf - The raw index blob bytes
 * @returns {CacheIndex}
 */
function _parseIndexBlob(buf) {
  /** @type {unknown} */
  const parsed = JSON.parse(textDecode(buf));
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    /** @type {Record<string, unknown>} */ (parsed)['schemaVersion'] === INDEX_SCHEMA_VERSION
  ) {
    return /** @type {CacheIndex} */ (parsed);
  }
  return _emptyIndex();
}

/**
 * Describes a single cached seek entry in the index.
 * @typedef {Object} IndexEntry
 * @property {string} treeOid - Git tree OID of the CAS asset
 * @property {string} createdAt - ISO 8601 timestamp
 * @property {number} ceiling - Lamport ceiling tick
 * @property {string} frontierHash - Hex hash portion of the cache key
 * @property {number} sizeBytes - Serialized state size in bytes
 * @property {string} codec - Codec identifier (e.g. 'cbor-v1')
 * @property {number} schemaVersion - Index entry schema version
 * @property {string} [lastAccessedAt] - ISO 8601 timestamp of last read (for LRU eviction)
 * @property {string} [indexTreeOid] - Git tree OID of the bitmap index snapshot
 */

/**
 * Top-level seek cache index stored as a JSON blob in Git.
 * @typedef {Object} CacheIndex
 * @property {number} schemaVersion - Index-level schema version
 * @property {Record<string, IndexEntry>} entries - Map of cacheKey → entry
 */

export default class CasSeekCacheAdapter extends SeekCachePort {
  /**
   * Creates a new CAS-backed seek cache adapter.
   * @param {{ persistence: CachePersistence, plumbing: unknown, graphName: string, maxEntries?: number, encryptionKey?: Uint8Array, logger?: import('../../ports/LoggerPort.js').default }} options
   */
  constructor({ persistence, plumbing, graphName, maxEntries, encryptionKey, logger }) {
    super();
    /** @type {CachePersistence} */
    this._persistence = persistence;
    /** @type {unknown} */
    this._plumbing = plumbing;
    this._graphName = graphName;
    this._maxEntries = maxEntries ?? DEFAULT_MAX_ENTRIES;
    this._ref = buildSeekCacheRef(graphName);
    /** @type {Uint8Array|undefined} */
    this._encryptionKey = encryptionKey;
    /** @type {import('../../ports/LoggerPort.js').default|undefined} */
    this._logger = logger;
    this._getCas = createLazyCas(() => this._initCas());
  }

  /**
   * Lazily initializes the CAS store on first use.
   * @private
   * @returns {Promise<CasStore>}
   */
  async _initCas() {
    const { default: ContentAddressableStore, CborCodec } = await import(
      /* webpackIgnore: true */ '@git-stunts/git-cas'
    );
    /** @type {{ plumbing: unknown, codec: unknown, chunking: { strategy: 'cdc' }, observability?: unknown }} */
    const opts = {
      plumbing: this._plumbing,
      codec: new CborCodec(),
      chunking: { strategy: 'cdc' },
    };
    if (this._logger !== null && this._logger !== undefined) {
      opts.observability = new LoggerObservabilityBridge(this._logger);
    }
    return /** @type {CasStore} */ (/** @type {unknown} */ (new ContentAddressableStore(opts)));
  }

  // ---------------------------------------------------------------------------
  // Index management
  // ---------------------------------------------------------------------------

  /**
   * Reads the current cache index from the ref, returning empty on miss or corruption.
   * @private
   * @returns {Promise<CacheIndex>}
   */
  async _readIndex() {
    const oid = await this._persistence.readRef(this._ref);
    if (typeof oid !== 'string' || oid.length === 0) {
      return _emptyIndex();
    }
    try {
      const buf = await this._persistence.readBlob(oid);
      return _parseIndexBlob(buf);
    } catch {
      return _emptyIndex();
    }
  }

  /**
   * Writes the cache index blob and updates the ref atomically.
   * @private
   * @param {CacheIndex} index - The index to write
   * @returns {Promise<void>}
   */
  async _writeIndex(index) {
    const json = JSON.stringify(index);
    const oid = await this._persistence.writeBlob(textEncode(json));
    await this._persistence.updateRef(this._ref, oid);
  }

  /**
   * Mutates the index with retry on transient write failure.
   *
   * Note: this adapter is single-writer — concurrent index mutations from
   * separate processes may lose updates. The retry loop handles transient
   * I/O errors (e.g. temporary lock contention), not true CAS conflicts.
   *
   * @private
   * @param {function(CacheIndex): CacheIndex} mutate - Mutation function applied to current index
   * @returns {Promise<CacheIndex>} The mutated index
   */
  async _mutateIndex(mutate) {
    /** @type {unknown} */
    let lastErr;
    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
      const index = await this._readIndex();
      const mutated = mutate(index);
      try {
        await this._writeIndex(mutated);
        return mutated;
      } catch (err) {
        lastErr = err;
        // Transient write failure — retry with fresh read
        if (attempt === MAX_CAS_RETRIES - 1) {
          throw new CacheError(`CasSeekCacheAdapter: index update failed after retries: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
        }
      }
    }
    /* c8 ignore next - unreachable */
    throw new CacheError('CasSeekCacheAdapter: index update failed');
  }

  /**
   * Returns the LRU timestamp for an index entry, preferring lastAccessedAt over createdAt.
   * @private
   * @param {IndexEntry} entry - The index entry to extract timestamp from
   * @returns {string} ISO 8601 timestamp or empty string
   */
  _entryTimestamp(entry) {
    if (typeof entry.lastAccessedAt === 'string' && entry.lastAccessedAt.length > 0) {
      return entry.lastAccessedAt;
    }
    if (typeof entry.createdAt === 'string' && entry.createdAt.length > 0) {
      return entry.createdAt;
    }
    return '';
  }

  /**
   * Evicts oldest entries when index exceeds maxEntries.
   * @private
   * @param {CacheIndex} index - The index to enforce limits on
   * @returns {CacheIndex} The index with evicted entries removed
   */
  _enforceMaxEntries(index) {
    const keys = Object.keys(index.entries);
    if (keys.length <= this._maxEntries) {
      return index;
    }
    // Sort by last access (or creation) ascending — evict least recently used
    const sorted = keys.sort((a, b) => {
      const ta = this._entryTimestamp(index.entries[a]);
      const tb = this._entryTimestamp(index.entries[b]);
      if (ta < tb) {
        return -1;
      }
      return ta > tb ? 1 : 0;
    });
    const toEvict = sorted.slice(0, keys.length - this._maxEntries);
    for (const k of toEvict) {
      delete index.entries[k];
    }
    return index;
  }

  /**
   * Parses ceiling and frontierHash from a versioned cache key string.
   * @private
   * @param {string} key - e.g. 'v1:t42-abcdef...'
   * @returns {{ ceiling: number, frontierHash: string }}
   */
  _parseKey(key) {
    const colonIdx = key.indexOf(':');
    const rest = colonIdx >= 0 ? key.slice(colonIdx + 1) : key;
    const dashIdx = rest.indexOf('-');
    const ceiling = parseInt(rest.slice(1, dashIdx), 10);
    const frontierHash = rest.slice(dashIdx + 1);
    return { ceiling, frontierHash };
  }

  // ---------------------------------------------------------------------------
  // Restore helpers
  // ---------------------------------------------------------------------------

  /**
   * Restores a CAS asset into a single buffer, preferring streaming when available.
   *
   * Prefers `cas.restoreStream()` (git-cas v4+) for I/O pipelining —
   * chunk reads overlap with buffer accumulation. Falls back to
   * `cas.restore()` for older git-cas versions or when streaming is
   * unavailable (e.g. encrypted assets that require full buffering).
   *
   * @private
   * @param {CasStore} cas - ContentAddressableStore instance
   * @param {{ manifest: unknown, encryptionKey?: Uint8Array }} restoreOpts - Restore configuration
   * @returns {Promise<Uint8Array>}
   */
  async _restoreBuffer(cas, restoreOpts) {
    if (typeof cas.restoreStream === 'function') {
      const stream = cas.restoreStream(restoreOpts);
      /** @type {Uint8Array[]} */
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      if (chunks.length === 1) {
        return chunks[0];
      }
      return concatBytes(...chunks);
    }
    const { buffer } = await cas.restore(restoreOpts);
    return buffer;
  }

  // ---------------------------------------------------------------------------
  // SeekCachePort implementation
  // ---------------------------------------------------------------------------

  /**
   * Retrieves a cached state buffer by key, returning null on miss or corruption.
   *
   * Note: This method reads the index twice — once here for the entry lookup,
   * and again inside `_mutateIndex` for the `lastAccessedAt` update. The
   * double-read is a known trade-off: `_mutateIndex` re-reads to provide
   * CAS-safe retry semantics, and deduplicating the reads would complicate
   * the retry logic without meaningful performance impact (the index is a
   * single small JSON blob).
   *
   * @override
   * @param {string} key - Cache key to look up
   * @returns {Promise<{ buffer: Uint8Array, indexTreeOid?: string } | null>}
   */
  async get(key) {
    const cas = await this._getCas();
    const index = await this._readIndex();
    const entry = index.entries[key];
    if (entry === null || entry === undefined) {
      return null;
    }

    try {
      return await this._getEntry(cas, key, entry);
    } catch {
      // Blob GC'd or corrupted — self-heal by removing dead entry
      await this._mutateIndex((idx) => {
        delete idx.entries[key];
        return idx;
      });
      return null;
    }
  }

  /**
   * Restores a cached entry and updates its last-accessed timestamp.
   * @private
   * @param {CasStore} cas - The CAS store instance
   * @param {string} key - Cache key for the entry
   * @param {IndexEntry} entry - The index entry to restore
   * @returns {Promise<{ buffer: Uint8Array, indexTreeOid?: string }>}
   */
  async _getEntry(cas, key, entry) {
    const manifest = await cas.readManifest({ treeOid: entry.treeOid });
    /** @type {{ manifest: unknown, encryptionKey?: Uint8Array }} */
    const restoreOpts = { manifest };
    if (this._encryptionKey !== null && this._encryptionKey !== undefined) {
      restoreOpts.encryptionKey = this._encryptionKey;
    }
    const buffer = await this._restoreBuffer(cas, restoreOpts);
    // Update lastAccessedAt for LRU eviction ordering
    await this._mutateIndex((idx) => {
      if (idx.entries[key] !== null && idx.entries[key] !== undefined) {
        idx.entries[key].lastAccessedAt = new Date().toISOString();
      }
      return idx;
    });
    /** @type {{ buffer: Uint8Array, indexTreeOid?: string }} */
    const result = { buffer };
    if (typeof entry.indexTreeOid === 'string' && entry.indexTreeOid.length > 0) {
      result.indexTreeOid = entry.indexTreeOid;
    }
    return result;
  }

  /**
   * Stores a serialized state buffer under the given cache key.
   * @override
   * @param {string} key - Cache key
   * @param {Uint8Array} buffer - Serialized state bytes
   * @param {{ indexTreeOid?: string }} [options] - Optional index tree OID
   * @returns {Promise<void>}
   */
  async set(key, buffer, options) {
    const cas = await this._getCas();
    const { ceiling, frontierHash } = this._parseKey(key);

    const { manifest, treeOid } = await this._storeCasAsset(cas, key, buffer);
    void manifest; // manifest consumed by createTree

    // Update index with rich metadata
    await this._mutateIndex((index) => {
      /** @type {IndexEntry} */
      const entry = {
        treeOid,
        createdAt: new Date().toISOString(),
        ceiling,
        frontierHash,
        sizeBytes: buffer.length,
        codec: 'cbor-v1',
        schemaVersion: INDEX_SCHEMA_VERSION,
      };
      if (typeof options?.indexTreeOid === 'string' && options.indexTreeOid.length > 0) {
        entry.indexTreeOid = options.indexTreeOid;
      }
      index.entries[key] = entry;
      return this._enforceMaxEntries(index);
    });
  }

  /**
   * Stores a buffer as a CAS asset and returns the manifest and tree OID.
   * @private
   * @param {CasStore} cas - The CAS store instance
   * @param {string} key - Cache key used as slug
   * @param {Uint8Array} buffer - The data to store
   * @returns {Promise<{ manifest: unknown, treeOid: string }>}
   */
  async _storeCasAsset(cas, key, buffer) {
    const source = Readable.from([buffer]);
    /** @type {{ source: import('node:stream').Readable, slug: string, filename: string, encryptionKey?: Uint8Array }} */
    const storeOpts = { source, slug: key, filename: 'state.cbor' };
    if (this._encryptionKey !== null && this._encryptionKey !== undefined) {
      storeOpts.encryptionKey = this._encryptionKey;
    }
    const manifest = await cas.store(storeOpts);
    const treeOid = await cas.createTree({ manifest });
    return { manifest, treeOid };
  }

  /**
   * Checks whether an entry exists for the given cache key.
   * @override
   * @param {string} key - Cache key to check
   * @returns {Promise<boolean>}
   */
  async has(key) {
    const index = await this._readIndex();
    return key in index.entries;
  }

  /**
   * Returns all cache keys currently in the index.
   * @override
   * @returns {Promise<string[]>}
   */
  async keys() {
    const index = await this._readIndex();
    return Object.keys(index.entries);
  }

  /**
   * Deletes a cache entry by key, returning whether it existed.
   * @override
   * @param {string} key - Cache key to delete
   * @returns {Promise<boolean>}
   */
  async delete(key) {
    let existed = false;
    await this._mutateIndex((index) => {
      existed = key in index.entries;
      delete index.entries[key];
      return index;
    });
    return existed;
  }

  /**
   * Removes the index ref, leaving CAS objects for git gc to prune.
   * @override
   * @returns {Promise<void>}
   */
  async clear() {
    try {
      await this._persistence.deleteRef(this._ref);
    } catch {
      // Ref may not exist — that's fine
    }
  }
}
