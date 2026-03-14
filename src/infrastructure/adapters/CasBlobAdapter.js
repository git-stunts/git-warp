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

/** @typedef {{ readManifest: Function, restore: Function, store: Function, createTree: Function }} CasStore */

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
  return msg.includes('not a tree')
    || msg.includes('bad object')
    || msg.includes('does not exist');
}

export default class CasBlobAdapter extends BlobStoragePort {
  /**
   * @param {{ plumbing: *, persistence: *, encryptionKey?: Uint8Array, logger?: import('../../ports/LoggerPort.js').default }} options
   */
  constructor({ plumbing, persistence, encryptionKey, logger }) {
    super();
    this._plumbing = plumbing;
    this._persistence = persistence;
    this._encryptionKey = encryptionKey;
    this._logger = logger;
    this._getCas = createLazyCas(() => this._initCas());
  }

  /**
   * @private
   * @returns {Promise<CasStore>}
   */
  async _initCas() {
    const { default: ContentAddressableStore, CborCodec } = await import(
      /* webpackIgnore: true */ '@git-stunts/git-cas'
    );
    /** @type {{ plumbing: *, codec: *, chunking: { strategy: 'cdc' }, observability?: * }} */
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
   * @param {{ slug?: string }} [options]
   * @returns {Promise<string>}
   */
  async store(content, options) {
    const cas = await this._getCas();
    const buf = typeof content === 'string'
      ? new TextEncoder().encode(content)
      : content;
    const source = Readable.from([buf]);

    /** @type {{ source: *, slug: string, filename: string, encryptionKey?: Uint8Array }} */
    const storeOpts = {
      source,
      slug: options?.slug || `blob-${Date.now().toString(36)}`,
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
      const manifest = await cas.readManifest({ treeOid: oid });
      /** @type {{ manifest: *, encryptionKey?: Uint8Array }} */
      const restoreOpts = { manifest };
      if (this._encryptionKey) {
        restoreOpts.encryptionKey = this._encryptionKey;
      }
      const { buffer } = await cas.restore(restoreOpts);
      return buffer;
    } catch (err) {
      // Fallback: OID may be a raw Git blob (pre-CAS content).
      // Only fall through for "not a manifest" errors (missing tree, bad format).
      // Rethrow corruption, decryption, and I/O errors.
      if (!isLegacyBlobError(err)) {
        throw err;
      }
      const blob = await this._persistence.readBlob(oid);
      if (blob === null || blob === undefined) {
        throw new PersistenceError(
          `Missing Git object: ${oid}`,
          PersistenceError.E_MISSING_OBJECT,
          { context: { oid } },
        );
      }
      return blob;
    }
  }
}
