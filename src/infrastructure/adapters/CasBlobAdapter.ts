/**
 * CasBlobAdapter — stores content blobs via git-cas.
 *
 * Content is chunked (CDC by default), optionally encrypted, and stored
 * as a CAS tree in the Git object store. The tree OID serves as the
 * storage identifier.
 *
 * Current runtime reads require CAS manifests. Migration tooling can inject an
 * explicit retired raw Git blob read policy while translating old substrates.
 *
 * @module infrastructure/adapters/CasBlobAdapter
 */

import BlobStoragePort from '../../ports/BlobStoragePort.ts';
import PersistenceError from '../../domain/errors/PersistenceError.ts';
import { createLazyCas } from './lazyCasInit.ts';
import { createCdcCasStore } from './CasStoreFactory.ts';
import {
  CURRENT_SUBSTRATE_ONLY_POLICY,
  type SubstrateCompatibilityPolicyValue,
} from './SubstrateCompatibilityPolicy.ts';
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
  private readonly _compatibilityPolicy: SubstrateCompatibilityPolicyValue;

  constructor({ plumbing, persistence, encryptionKey, logger, compatibilityPolicy }: {
    plumbing: unknown;
    persistence: BlobPersistence;
    encryptionKey?: Uint8Array;
    logger?: LoggerPort;
    compatibilityPolicy?: SubstrateCompatibilityPolicyValue;
  }) {
    super();
    this._plumbing = plumbing;
    this._persistence = persistence;
    this._encryptionKey = encryptionKey;
    this._logger = logger;
    this._getCas = createLazyCas(() => this._initCas());
    this._compatibilityPolicy = compatibilityPolicy ?? CURRENT_SUBSTRATE_ONLY_POLICY;
  }

  private async _initCas(): Promise<CasStore> {
    return await createCdcCasStore<CasStore>({
      plumbing: this._plumbing,
      logger: this._logger,
    });
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
      this._requireLegacyContentBlobPolicy(oid, err);
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
      [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
        let inner: AsyncIterator<Uint8Array> | null = null;
        let initialized = false;
        return {
          async next(): Promise<IteratorResult<Uint8Array>> {
            if (!initialized) {
              initialized = true;
              inner = await self._resolveStreamIterator(oid);
            }
            if (inner === null) {
              return doneIteratorResult();
            }
            return await inner.next();
          },
          async return(): Promise<IteratorResult<Uint8Array>> {
            if (inner !== null && typeof inner.return === 'function') {
              return await inner.return();
            }
            return doneIteratorResult();
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
      this._requireLegacyContentBlobPolicy(oid, err);
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

  private _requireLegacyContentBlobPolicy(oid: string, error: unknown): void {
    if (this._compatibilityPolicy.legacyContentBlobReads) {
      return;
    }
    throw new PersistenceError(
      `Legacy raw blob reads require the substrate migration compatibility policy: ${oid}`,
      'E_LEGACY_SUBSTRATE_DISABLED',
      {
        ...(error instanceof Error ? { cause: error } : {}),
        context: { oid },
      },
    );
  }
}

function singleChunkIterator(buf: Uint8Array): AsyncIterator<Uint8Array> {
  let done = false;
  return {
    next(): Promise<IteratorResult<Uint8Array>> {
      if (done) {
        return Promise.resolve(doneIteratorResult());
      }
      done = true;
      return Promise.resolve({ value: buf, done: false });
    },
    return(): Promise<IteratorResult<Uint8Array>> {
      done = true;
      return Promise.resolve(doneIteratorResult());
    },
  };
}

function doneIteratorResult(): IteratorResult<Uint8Array> {
  return { value: new Uint8Array(0), done: true };
}
