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
import {
  CURRENT_SUBSTRATE_ONLY_POLICY,
  type SubstrateCompatibilityPolicyValue,
} from './SubstrateCompatibilityPolicy.ts';
import CasContentEncryptionPolicy, {
  type CasRestoreEncryptionArguments,
  type CasStoreEncryptionOptions,
  mapCasContentEncryptionError,
} from './CasContentEncryptionPolicy.ts';
import { Readable } from 'node:stream';
import type ContentAddressableStore from '@git-stunts/git-cas';
import type { Manifest } from '@git-stunts/git-cas';

type CasStore = Pick<
  ContentAddressableStore,
  'readManifest' | 'restore' | 'restoreStream' | 'store' | 'createTree'
>;

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
 * - `GIT_ERROR` — Git couldn't read the tree at all
 *
 * `GIT_ERROR` can mean either "wrong object type" or "missing object" depending
 * on the plumbing path. The legacy fallback path probes the raw object before
 * deciding whether this is retired legacy content or a genuinely missing OID.
 */
const LEGACY_BLOB_CODES = new Set(['MANIFEST_NOT_FOUND', 'GIT_ERROR']);
const CAS_NOT_FOUND_CODES = new Set(['MANIFEST_NOT_FOUND', 'GIT_OBJECT_NOT_FOUND']);

function isCasNotFoundError(err: unknown): boolean {
  return (
    typeof err === 'object'
    && err !== null
    && 'code' in err
    && typeof err.code === 'string'
    && CAS_NOT_FOUND_CODES.has(err.code)
  );
}

function isLegacyBlobError(err: unknown): err is Error {
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

function missingGitObjectError(oid: string, cause: Error): PersistenceError {
  return new PersistenceError(
    `Missing Git object: ${oid}`,
    PersistenceError.E_MISSING_OBJECT,
    { cause, context: { oid } },
  );
}

export default class CasBlobAdapter extends BlobStoragePort {
  private readonly _cas: CasStore;
  private readonly _persistence: BlobPersistence;
  private readonly _contentEncryption: CasContentEncryptionPolicy;
  private readonly _compatibilityPolicy: SubstrateCompatibilityPolicyValue;

  constructor({ cas, persistence, encryptionKey, contentEncryption, compatibilityPolicy }: {
    cas: CasStore;
    persistence: BlobPersistence;
    encryptionKey?: Uint8Array;
    contentEncryption?: CasContentEncryptionPolicy;
    compatibilityPolicy?: SubstrateCompatibilityPolicyValue;
  }) {
    super();
    this._cas = cas;
    this._persistence = persistence;
    this._contentEncryption = resolveContentEncryption(contentEncryption, encryptionKey);
    this._compatibilityPolicy = compatibilityPolicy ?? CURRENT_SUBSTRATE_ONLY_POLICY;
  }

  override async store(content: Uint8Array | string, options?: { slug?: string; mime?: string | null; size?: number | null }): Promise<string> {
    const cas = this._cas;
    const buf = typeof content === 'string'
      ? new TextEncoder().encode(content)
      : content;
    const source = Readable.from([buf]);

    const storeOpts: { source: AsyncIterable<Uint8Array>; slug: string; filename: string; encryptionKey?: Uint8Array; encryption?: CasStoreEncryptionOptions } = {
      source,
      slug: options?.slug ?? `blob-${Date.now().toString(36)}`,
      filename: 'content',
      ...this._contentEncryption.toStoreOptions(),
    };

    const manifest = await cas.store(storeOpts);
    return await cas.createTree({ manifest });
  }

  override async has(oid: string): Promise<boolean> {
    const cas = this._cas;
    try {
      await cas.readManifest({ treeOid: oid });
      return true;
    } catch (err) {
      if (isCasNotFoundError(err)) {
        return false;
      }
      throw err;
    }
  }

  override async retrieve(oid: string): Promise<Uint8Array> {
    const cas = this._cas;

    try {
      return await this._restoreFromCas(cas, oid);
    } catch (err) {
      const encryptionError = mapCasContentEncryptionError(err, 'content-attachment');
      if (encryptionError !== null) {
        throw encryptionError;
      }
      if (!isLegacyBlobError(err)) {
        throw err;
      }
      return await this._readLegacyContentBlobCandidate(oid, err);
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

  private _buildRestoreOpts(manifest: Manifest): { manifest: Manifest } & CasRestoreEncryptionArguments {
    return { manifest, ...this._contentEncryption.toRestoreOptions() };
  }

  override async storeStream(source: AsyncIterable<Uint8Array>, options?: { slug?: string; mime?: string | null; size?: number | null }): Promise<string> {
    const cas = this._cas;
    const readable = Readable.from(source);

    const storeOpts: { source: AsyncIterable<Uint8Array>; slug: string; filename: string; encryptionKey?: Uint8Array; encryption?: CasStoreEncryptionOptions } = {
      source: readable,
      slug: options?.slug ?? `blob-${Date.now().toString(36)}`,
      filename: 'content',
      ...this._contentEncryption.toStoreOptions(),
    };

    const manifest = await cas.store(storeOpts);
    return await cas.createTree({ manifest });
  }

  override retrieveStream(oid: string): AsyncIterable<Uint8Array> {
    const self = this;
    return {
      [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
        let inner: AsyncIterator<Uint8Array> | null = null;
        return {
          async next(): Promise<IteratorResult<Uint8Array>> {
            if (inner === null) {
              inner = await self._resolveStreamIterator(oid);
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
    const cas = this._cas;

    try {
      return await this._streamFromCas(cas, oid);
    } catch (err) {
      const encryptionError = mapCasContentEncryptionError(err, 'content-attachment-stream');
      if (encryptionError !== null) {
        throw encryptionError;
      }
      if (!isLegacyBlobError(err)) {
        throw err;
      }
      const blob = await this._readLegacyContentBlobCandidate(oid, err);
      return singleChunkIterator(blob);
    }
  }

  private async _streamFromCas(cas: CasStore, oid: string): Promise<AsyncIterator<Uint8Array>> {
    const manifest = await cas.readManifest({ treeOid: oid });
    const restoreOpts = this._buildRestoreOpts(manifest);

    return cas.restoreStream(restoreOpts)[Symbol.asyncIterator]();
  }

  private async _readLegacyContentBlobCandidate(oid: string, error: Error): Promise<Uint8Array> {
    if (this._compatibilityPolicy.legacyContentBlobReads) {
      return await this._fallbackReadBlob(oid);
    }
    const blob = await this._probeLegacyContentBlob(oid);
    if (blob === null) {
      throw missingGitObjectError(oid, error);
    }
    throw new PersistenceError(
      `Legacy raw blob reads require the substrate migration compatibility policy: ${oid}`,
      'E_LEGACY_SUBSTRATE_DISABLED',
      {
        cause: error,
        context: { oid },
      },
    );
  }

  private async _probeLegacyContentBlob(oid: string): Promise<Uint8Array | null> {
    try {
      const blob = await this._persistence.readBlob(oid);
      return blob ?? null;
    } catch (err) {
      if (err instanceof PersistenceError && err.code === PersistenceError.E_MISSING_OBJECT) {
        return null;
      }
      throw err;
    }
  }
}

function resolveContentEncryption(
  contentEncryption: CasContentEncryptionPolicy | undefined,
  encryptionKey: Uint8Array | undefined,
): CasContentEncryptionPolicy {
  if (contentEncryption !== undefined) {
    return contentEncryption;
  }
  if (encryptionKey !== undefined) {
    return CasContentEncryptionPolicy.fromInternalResolvedKey({ encryptionKey });
  }
  return CasContentEncryptionPolicy.disabled();
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
