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

import BlobStoragePort from '../../ports/BlobStoragePort.ts';
import PersistenceError from '../../domain/errors/PersistenceError.ts';
import { createLazyCas } from './lazyCasInit.ts';
import LoggerObservabilityBridge from './LoggerObservabilityBridge.ts';
import type LoggerPort from '../../ports/LoggerPort.ts';
import { Readable } from 'node:stream';

interface CasManifest {
  entries?: Record<string, unknown>;
}

interface CasStore {
  readManifest(opts: { treeOid: string }): Promise<CasManifest>;
  restore(opts: { manifest: CasManifest; encryptionKey?: Uint8Array }): Promise<{ buffer: Uint8Array }>;
  restoreStream?: (opts: { manifest: CasManifest; encryptionKey?: Uint8Array }) => AsyncIterable<Uint8Array>;
  store(opts: { source: unknown; slug: string; filename: string; encryptionKey?: Uint8Array }): Promise<CasManifest>;
  createTree(opts: { manifest: CasManifest }): Promise<string>;
}

export interface BlobPersistence {
  readBlob(oid: string): Promise<Uint8Array | null | undefined>;
}

function normalizeToUint8Array(buffer: Uint8Array): Uint8Array {
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
 */
const LEGACY_BLOB_CODES = new Set(['MANIFEST_NOT_FOUND', 'GIT_ERROR']);

function isLegacyBlobError(err: unknown): boolean {
  if (err instanceof Error && 'code' in err) {
    const coded = err as Error & { code: unknown };
    if (typeof coded.code === 'string') {
      return LEGACY_BLOB_CODES.has(coded.code);
    }
  }
  const msg = err instanceof Error ? err.message : '';
  return hasLegacyBlobMessage(msg);
}

function hasLegacyBlobMessage(msg: string): boolean {
  return msg.includes('not a tree')
    || msg.includes('bad object')
    || msg.includes('does not exist');
}

export default class CasBlobAdapter extends BlobStoragePort {
  private readonly _plumbing: unknown;
  private readonly _persistence: BlobPersistence;
  private readonly _encryptionKey: Uint8Array | undefined;
  private readonly _logger: LoggerPort | undefined;
  private readonly _getCas: () => Promise<CasStore>;

  constructor({ plumbing, persistence, encryptionKey, logger }: {
    plumbing: unknown;
    persistence: BlobPersistence;
    encryptionKey?: Uint8Array;
    logger?: LoggerPort;
  }) {
    super();
    this._plumbing = plumbing;
    this._persistence = persistence;
    this._encryptionKey = encryptionKey;
    this._logger = logger;
    this._getCas = createLazyCas(() => this._initCas());
  }

  private async _initCas(): Promise<CasStore> {
    const casModule = await import(/* webpackIgnore: true */ '@git-stunts/git-cas') as unknown as {
      default: new (opts: unknown) => CasStore;
      CborCodec: new () => unknown;
    };
    const { default: ContentAddressableStore, CborCodec } = casModule;
    const opts: { plumbing: unknown; codec: unknown; chunking: { strategy: string }; observability?: unknown } = {
      plumbing: this._plumbing,
      codec: new CborCodec(),
      chunking: { strategy: 'cdc' },
    };
    if (this._logger) {
      opts.observability = new LoggerObservabilityBridge(this._logger);
    }
    return new ContentAddressableStore(opts);
  }

  override async store(content: Uint8Array | string, options?: { slug?: string; mime?: string | null; size?: number | null }): Promise<string> {
    const cas = await this._getCas();
    const buf = typeof content === 'string'
      ? new TextEncoder().encode(content)
      : content;
    const source = Readable.from([buf]);

    const storeOpts: { source: unknown; slug: string; filename: string; encryptionKey?: Uint8Array } = {
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

  override async retrieve(oid: string): Promise<Uint8Array> {
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

  private async _restoreFromCas(cas: CasStore, oid: string): Promise<Uint8Array> {
    const manifest = await cas.readManifest({ treeOid: oid });
    const restoreOpts = this._buildRestoreOpts(manifest);
    const { buffer } = await cas.restore(restoreOpts);
    return normalizeToUint8Array(buffer);
  }

  private async _fallbackReadBlob(oid: string): Promise<Uint8Array> {
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

  private _buildRestoreOpts(manifest: CasManifest): { manifest: CasManifest; encryptionKey?: Uint8Array } {
    const opts: { manifest: CasManifest; encryptionKey?: Uint8Array } = { manifest };
    if (this._encryptionKey) {
      opts.encryptionKey = this._encryptionKey;
    }
    return opts;
  }

  override async storeStream(source: AsyncIterable<Uint8Array>, options?: { slug?: string; mime?: string | null; size?: number | null }): Promise<string> {
    const cas = await this._getCas();
    const readable = Readable.from(source);

    const storeOpts: { source: unknown; slug: string; filename: string; encryptionKey?: Uint8Array } = {
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

  override retrieveStream(oid: string): AsyncIterable<Uint8Array> {
    const self = this;
    return {
      [Symbol.asyncIterator]() {
        let inner: AsyncIterator<Uint8Array> | null = null;
        let initialized = false;
        return {
          async next() {
            if (!initialized) {
              initialized = true;
              inner = await self._resolveStreamIterator(oid);
            }
            return await (inner as AsyncIterator<Uint8Array>).next();
          },
          return() {
            return Promise.resolve({ value: undefined as unknown as Uint8Array, done: true as const });
          },
        };
      },
    };
  }

  private async _resolveStreamIterator(oid: string): Promise<AsyncIterator<Uint8Array>> {
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

  private async _streamFromCas(cas: CasStore, oid: string): Promise<AsyncIterator<Uint8Array>> {
    const manifest = await cas.readManifest({ treeOid: oid });
    const restoreOpts = this._buildRestoreOpts(manifest);

    if (typeof cas.restoreStream === 'function') {
      const stream = cas.restoreStream(restoreOpts);
      return stream[Symbol.asyncIterator]();
    }

    const { buffer } = await cas.restore(restoreOpts);
    return singleChunkIterator(buffer);
  }
}

function singleChunkIterator(buf: Uint8Array): AsyncIterator<Uint8Array> {
  let done = false;
  return {
    next() {
      if (done) {
        return Promise.resolve({ value: undefined as unknown as Uint8Array, done: true as const });
      }
      done = true;
      return Promise.resolve({ value: buf, done: false });
    },
    return() {
      done = true;
      return Promise.resolve({ value: undefined as unknown as Uint8Array, done: true as const });
    },
  };
}
