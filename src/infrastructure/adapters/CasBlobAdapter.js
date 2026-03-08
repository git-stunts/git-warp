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
import { Readable } from 'node:stream';

/** @typedef {{ readManifest: Function, restore: Function, store: Function, createTree: Function }} CasStore */

export default class CasBlobAdapter extends BlobStoragePort {
  /**
   * @param {{ plumbing: *, persistence: *, encryptionKey?: Buffer|Uint8Array, logger?: import('../../ports/LoggerPort.js').default }} options
   */
  constructor({ plumbing, persistence, encryptionKey, logger }) {
    super();
    this._plumbing = plumbing;
    this._persistence = persistence;
    this._encryptionKey = encryptionKey;
    this._logger = logger;
    this._casPromise = null;
  }

  /**
   * Lazily initializes the CAS instance.
   *
   * @private
   * @returns {Promise<CasStore>}
   */
  async _getCas() {
    if (!this._casPromise) {
      this._casPromise = this._initCas().catch((err) => {
        this._casPromise = null;
        throw err;
      });
    }
    return await this._casPromise;
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
      const { default: LoggerObservabilityBridge } = await import(
        './LoggerObservabilityBridge.js'
      );
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
      ? Buffer.from(content, 'utf8')
      : content;
    const source = Readable.from([buf]);

    /** @type {{ source: *, slug: string, filename: string, encryptionKey?: Buffer|Uint8Array }} */
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
      /** @type {{ manifest: *, encryptionKey?: Buffer|Uint8Array }} */
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
      const msg = err instanceof Error ? err.message : '';
      const isNotManifest = msg.includes('not a tree')
        || msg.includes('bad object')
        || msg.includes('unknown object')
        || msg.includes('could not find')
        || msg.includes('does not exist');
      if (!isNotManifest) {
        throw err;
      }
      return await this._persistence.readBlob(oid);
    }
  }
}
