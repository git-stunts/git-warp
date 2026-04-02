/**
 * CasBlobAdapter — stores content blobs via git-cas.
 *
 * Content is chunked (CDC by default), optionally encrypted, and stored
 * as a CAS tree in the Git object store. The tree OID serves as the
 * storage identifier.
 *
 * Backward compatibility: if `retrieve()` fails to find a CAS manifest
 * at the given OID, it falls back to reading a raw Git blob. This
 * handles content written before the CAS migration.
 *
 * @module infrastructure/adapters/CasBlobAdapter
 */

import BlobStoragePort from '../../ports/BlobStoragePort.js';
import PersistenceError from '../../domain/errors/PersistenceError.js';
import { createLazyCas } from './lazyCasInit.js';
import LoggerObservabilityBridge from './LoggerObservabilityBridge.js';
import { Readable } from 'node:stream';

/**
 * @typedef {object} CasManifest
 * @property {Record<string, unknown>} [entries]
 */

/**
 * @typedef {object} CasStore
 * @property {(opts: { treeOid: string }) => Promise<CasManifest>} readManifest
 * @property {(opts: { manifest: CasManifest, encryptionKey?: Uint8Array }) => Promise<{ buffer: Uint8Array }>} restore
 * @property {((opts: { manifest: CasManifest, encryptionKey?: Uint8Array }) => AsyncIterable<Uint8Array>)|undefined} [restoreStream]
 * @property {(opts: { source: *, slug: string, filename: string, encryptionKey?: Uint8Array }) => Promise<CasManifest>} store
 * @property {(opts: { manifest: CasManifest }) => Promise<string>} createTree
 */

/**
 * @typedef {object} BlobPersistence
 * @property {(oid: string) => Promise<Uint8Array|null|undefined>} readBlob
 */

/**
 * Normalizes a Buffer or Uint8Array subclass to a plain Uint8Array.
 *
 * @param {Uint8Array} buffer
 * @returns {Uint8Array}
 */
function normalizeToUint8Array(buffer) {
  if (buffer instanceof Uint8Array && buffer.constructor !== Uint8Array) {
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
  return buffer;
}

/**
 * Error codes from `@git-stunts/git-cas` that indicate the OID is not
 * a CAS manifest (i.e. it's a legacy raw Git blob written before the
 * CAS migration).
 *
 * - `MANIFEST_NOT_FOUND` — tree exists but contains no manifest entry
 * - `GIT_ERROR` — Git couldn't read the tree at all (wrong object type)
 *
 * @type {ReadonlySet<string>}
 */
const LEGACY_BLOB_CODES = new Set(['MANIFEST_NOT_FOUND', 'GIT_ERROR']);

/**
 * Returns true when the error indicates the OID is not a CAS manifest
 * (i.e. it's a legacy raw Git blob). All other errors are considered
 * real failures and should be rethrown.
 *
 * Checks `err.code` (the machine-readable `CasError` code) first.
 * Falls back to message-based matching for non-CasError exceptions
 * thrown by lower-level Git operations.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
function isLegacyBlobError(err) {
  if (err instanceof Error && 'code' in err) {
    /** @type {{ code: unknown }} */
    const coded = /** @type {Error & { code: unknown }} */ (err);
    if (typeof coded.code === 'string') {
      return LEGACY_BLOB_CODES.has(coded.code);
    }
  }
  const msg = err instanceof Error ? err.message : '';
  return hasLegacyBlobMessage(msg);
}

/**
 * Checks whether a message string matches known legacy blob error patterns.
 *
 * @param {string} msg
 * @returns {boolean}
 */
function hasLegacyBlobMessage(msg) {
  return msg.includes('not a tree')
    || msg.includes('bad object')
    || msg.includes('does not exist');
}

export default class CasBlobAdapter extends BlobStoragePort {
  /**
   * Creates a CasBlobAdapter backed by git-cas.
   *
   * @param {{ plumbing: unknown, persistence: BlobPersistence, encryptionKey?: Uint8Array, logger?: import('../../ports/LoggerPort.js').default }} options
   */
  constructor({ plumbing, persistence, encryptionKey, logger }) {
    super();
    /** @type {unknown} */
    this._plumbing = plumbing;
    /** @type {BlobPersistence} */
    this._persistence = persistence;
    this._encryptionKey = encryptionKey;
    this._logger = logger;
    this._getCas = createLazyCas(() => this._initCas());
  }

  /**
   * Lazily initializes the git-cas ContentAddressableStore.
   *
   * @private
   * @returns {Promise<CasStore>}
   */
  async _initCas() {
    const casModule = /** @type {{ default: new (opts: unknown) => CasStore, CborCodec: new () => unknown }} */ (
      /** @type {unknown} */ (await import(/* webpackIgnore: true */ '@git-stunts/git-cas'))
    );
    const { default: ContentAddressableStore, CborCodec } = casModule;
    /** @type {{ plumbing: unknown, codec: unknown, chunking: { strategy: string }, observability?: unknown }} */
    const opts = {
      plumbing: this._plumbing,
      codec: new CborCodec(),
      chunking: { strategy: 'cdc' },
    };
    if (this._logger) {
      opts.observability = new LoggerObservabilityBridge(this._logger);
    }
    return new ContentAddressableStore(opts);
  }

  /**
   * Stores content via git-cas and returns the tree OID.
   *
   * @override
   * @param {Uint8Array|string} content
   * @param {{ slug?: string, mime?: string|null, size?: number|null }} [options]
   * @returns {Promise<string>}
   */
  async store(content, options) {
    const cas = await this._getCas();
    const buf = typeof content === 'string'
      ? new TextEncoder().encode(content)
      : content;
    const source = Readable.from([buf]);

    // `mime` and `size` are accepted on the public store() contract because
    // PatchBuilderV2 forwards higher-level attachment metadata here. This CAS
    // adapter persists that metadata via sibling CRDT properties instead of
    // encoding it into the git-cas manifest, so only slug/encryption are used.
    /** @type {{ source: *, slug: string, filename: string, encryptionKey?: Uint8Array }} */
    const storeOpts = {
      source,
      slug: options?.slug ?? `blob-${Date.now().toString(36)}`,
      filename: 'content',
    };
    if (this._encryptionKey) {
      storeOpts.encryptionKey = this._encryptionKey;
    }

    const manifest = await cas.store(storeOpts);
    return await cas.createTree({ manifest });
  }

  /**
   * Retrieves content by tree OID. Falls back to raw Git blob read
   * for backward compatibility with pre-CAS content.
   *
   * @override
   * @param {string} oid
   * @returns {Promise<Uint8Array>}
   */
  async retrieve(oid) {
    const cas = await this._getCas();

    try {
      return await this._restoreFromCas(cas, oid);
    } catch (err) {
      if (!isLegacyBlobError(err)) {
        throw err;
      }
      return await this._fallbackReadBlob(oid);
    }
  }

  /**
   * Restores content from a CAS manifest, normalizing Buffer to Uint8Array.
   *
   * @private
   * @param {CasStore} cas
   * @param {string} oid
   * @returns {Promise<Uint8Array>}
   */
  async _restoreFromCas(cas, oid) {
    const manifest = await cas.readManifest({ treeOid: oid });
    const restoreOpts = this._buildRestoreOpts(manifest);
    const { buffer } = await cas.restore(restoreOpts);
    return normalizeToUint8Array(buffer);
  }

  /**
   * Falls back to reading a raw Git blob for pre-CAS content.
   *
   * @private
   * @param {string} oid
   * @returns {Promise<Uint8Array>}
   */
  async _fallbackReadBlob(oid) {
    const blob = /** @type {Uint8Array|null|undefined} */ (await this._persistence.readBlob(oid));
    if (blob === null || blob === undefined) {
      throw new PersistenceError(
        `Missing Git object: ${oid}`,
        PersistenceError.E_MISSING_OBJECT,
        { context: { oid } },
      );
    }
    return blob;
  }

  /**
   * Builds restore options with optional encryption key.
   *
   * @private
   * @param {CasManifest} manifest
   * @returns {{ manifest: CasManifest, encryptionKey?: Uint8Array }}
   */
  _buildRestoreOpts(manifest) {
    /** @type {{ manifest: CasManifest, encryptionKey?: Uint8Array }} */
    const opts = { manifest };
    if (this._encryptionKey) {
      opts.encryptionKey = this._encryptionKey;
    }
    return opts;
  }

  /**
   * Stores content from a streaming source via git-cas.
   *
   * The source async iterable is piped directly to CAS without
   * intermediate buffering.
   *
   * @override
   * @param {AsyncIterable<Uint8Array>} source
   * @param {{ slug?: string, mime?: string|null, size?: number|null }} [options]
   * @returns {Promise<string>}
   */
  async storeStream(source, options) {
    const cas = await this._getCas();
    const readable = Readable.from(source);

    /** @type {{ source: *, slug: string, filename: string, encryptionKey?: Uint8Array }} */
    const storeOpts = {
      source: readable,
      slug: options?.slug ?? `blob-${Date.now().toString(36)}`,
      filename: 'content',
    };
    if (this._encryptionKey) {
      storeOpts.encryptionKey = this._encryptionKey;
    }

    const manifest = await cas.store(storeOpts);
    return await cas.createTree({ manifest });
  }

  /**
   * Retrieves content as an async iterable of chunks. Uses
   * `cas.restoreStream()` when available, falling back to
   * buffered `cas.restore()` wrapped as a single-chunk yield.
   *
   * Falls back to a single-chunk yield from `persistence.readBlob()`
   * for legacy raw Git blobs written before CAS migration.
   *
   * @override
   * @param {string} oid
   * @returns {AsyncIterable<Uint8Array>}
   */
  retrieveStream(oid) {
    const self = this;
    return /** @type {AsyncIterable<Uint8Array>} */ ({
      [Symbol.asyncIterator]() {
        /** @type {AsyncIterator<Uint8Array>|null} */
        let inner = null;
        let initialized = false;
        return {
          async next() {
            if (!initialized) {
              initialized = true;
              inner = await self._resolveStreamIterator(oid);
            }
            return await /** @type {AsyncIterator<Uint8Array>} */ (inner).next();
          },
          return() {
            return Promise.resolve({ value: undefined, done: true });
          },
        };
      },
    });
  }

  /**
   * Resolves the inner async iterator for retrieveStream().
   *
   * @private
   * @param {string} oid
   * @returns {Promise<AsyncIterator<Uint8Array>>}
   */
  async _resolveStreamIterator(oid) {
    const cas = await this._getCas();

    try {
      return await this._streamFromCas(cas, oid);
    } catch (err) {
      if (!isLegacyBlobError(err)) {
        throw err;
      }
      const blob = await this._fallbackReadBlob(oid);
      return singleChunkIterator(blob);
    }
  }

  /**
   * Attempts to stream content from a CAS manifest.
   *
   * @private
   * @param {CasStore} cas
   * @param {string} oid
   * @returns {Promise<AsyncIterator<Uint8Array>>}
   */
  async _streamFromCas(cas, oid) {
    const manifest = await cas.readManifest({ treeOid: oid });
    const restoreOpts = this._buildRestoreOpts(manifest);

    if (typeof cas.restoreStream === 'function') {
      const stream = cas.restoreStream(restoreOpts);
      return /** @type {AsyncIterable<Uint8Array>} */ (stream)[Symbol.asyncIterator]();
    }

    const { buffer } = await cas.restore(restoreOpts);
    return singleChunkIterator(buffer);
  }
}

/**
 * Creates a single-element async iterator from a buffer.
 *
 * @param {Uint8Array} buf
 * @returns {AsyncIterator<Uint8Array>}
 */
function singleChunkIterator(buf) {
  let done = false;
  return {
    next() {
      if (done) {
        return Promise.resolve({ value: undefined, done: true });
      }
      done = true;
      return Promise.resolve({ value: buf, done: false });
    },
    return() {
      done = true;
      return Promise.resolve({ value: undefined, done: true });
    },
  };
}
