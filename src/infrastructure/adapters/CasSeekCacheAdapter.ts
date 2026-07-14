/**
 * CAS-backed seek materialization cache adapter.
 *
 * Implements SeekCachePort using @git-stunts/git-cas for persistent storage
 * of serialized WarpState snapshots. Each cached state is stored as a CAS
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

import SeekCachePort, { type SeekCacheEntry, type SeekCacheSetOptions } from '../../ports/SeekCachePort.ts';
import { buildSeekCacheRef } from '../../domain/utils/RefLayout.ts';
import CacheError from '../../domain/errors/CacheError.ts';
import { textEncode, textDecode, concatBytes } from '../../domain/utils/bytes.ts';
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
  'readManifest' | 'restoreStream' | 'store' | 'createTree'
>;

interface CachePersistence {
  readRef(ref: string): Promise<string | null>;
  readBlob(oid: string): Promise<Uint8Array>;
  writeBlob(data: Uint8Array): Promise<string>;
  updateRef(ref: string, oid: string): Promise<void>;
  deleteRef(ref: string): Promise<void>;
}

interface IndexEntry {
  treeOid: string;
  createdAt: string;
  ceiling: number;
  frontierHash: string;
  sizeBytes: number;
  codec: string;
  schemaVersion: number;
  lastAccessedAt?: string;
  indexTreeOid?: string;
}

interface CacheIndex {
  schemaVersion: number;
  entries: Record<string, IndexEntry>;
}

const DEFAULT_MAX_ENTRIES = 200;
const INDEX_SCHEMA_VERSION = 1;
const MAX_CAS_RETRIES = 3;

function _emptyEntries(): Record<string, IndexEntry> {
  return Object.create(null) as Record<string, IndexEntry>;
}

function _emptyIndex(): CacheIndex {
  return { schemaVersion: INDEX_SCHEMA_VERSION, entries: _emptyEntries() };
}

function _isObjectRecord(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function _normalizeIndexEntries(entries: unknown): Record<string, IndexEntry> {
  const normalized = _emptyEntries();
  if (!_isObjectRecord(entries)) {
    return normalized;
  }
  for (const [key, value] of Object.entries(entries)) {
    if (_isObjectRecord(value)) {
      normalized[key] = value as IndexEntry;
    }
  }
  return normalized;
}

function _parseIndexBlob(buf: Uint8Array): CacheIndex {
  const parsed: unknown = JSON.parse(textDecode(buf));
  const candidate = parsed as { schemaVersion?: unknown; entries?: unknown };
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    candidate.schemaVersion === INDEX_SCHEMA_VERSION
  ) {
    return {
      schemaVersion: INDEX_SCHEMA_VERSION,
      entries: _normalizeIndexEntries(candidate.entries),
    };
  }
  return _emptyIndex();
}

export default class CasSeekCacheAdapter extends SeekCachePort {
  private readonly _persistence: CachePersistence;
  private readonly _cas: CasStore;
  private readonly _maxEntries: number;
  private readonly _ref: string;
  private readonly _encryptionKey: Uint8Array | undefined;
  private readonly _contentEncryption: CasContentEncryptionPolicy;

  constructor({ persistence, cas, graphName, maxEntries, encryptionKey, contentEncryption }: {
    persistence: CachePersistence;
    cas: CasStore;
    graphName: string;
    maxEntries?: number;
    encryptionKey?: Uint8Array;
    contentEncryption?: CasContentEncryptionPolicy;
  }) {
    super();
    this._persistence = persistence;
    this._cas = cas;
    this._maxEntries = maxEntries ?? DEFAULT_MAX_ENTRIES;
    this._ref = buildSeekCacheRef(graphName);
    this._encryptionKey = encryptionKey;
    this._contentEncryption = resolveContentEncryption(contentEncryption, this._encryptionKey);
  }

  // ---------------------------------------------------------------------------
  // Index management
  // ---------------------------------------------------------------------------

  private async _readIndex(): Promise<CacheIndex> {
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

  private async _writeIndex(index: CacheIndex): Promise<void> {
    const json = JSON.stringify(index);
    const oid = await this._persistence.writeBlob(textEncode(json));
    await this._persistence.updateRef(this._ref, oid);
  }

  private async _mutateIndex(mutate: (index: CacheIndex) => CacheIndex): Promise<CacheIndex> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
      const index = await this._readIndex();
      const mutated = mutate(index);
      try {
        await this._writeIndex(mutated);
        return mutated;
      } catch (err) {
        lastErr = err;
        if (attempt === MAX_CAS_RETRIES - 1) {
          throw new CacheError(`CasSeekCacheAdapter: index update failed after retries: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
        }
      }
    }
    /* c8 ignore next - unreachable */
    throw new CacheError('CasSeekCacheAdapter: index update failed');
  }

  private _entryTimestamp(entry: IndexEntry): string {
    if (typeof entry.lastAccessedAt === 'string' && entry.lastAccessedAt.length > 0) {
      return entry.lastAccessedAt;
    }
    if (typeof entry.createdAt === 'string' && entry.createdAt.length > 0) {
      return entry.createdAt;
    }
    return '';
  }

  private _enforceMaxEntries(index: CacheIndex): CacheIndex {
    const keys = Object.keys(index.entries);
    if (keys.length <= this._maxEntries) {
      return index;
    }
    const sorted = keys.sort((a, b) => {
      const entryA = index.entries[a];
      const entryB = index.entries[b];
      if (entryA === undefined || entryB === undefined) { return 0; }
      const ta = this._entryTimestamp(entryA);
      const tb = this._entryTimestamp(entryB);
      if (ta < tb) { return -1; }
      return ta > tb ? 1 : 0;
    });
    const toEvict = sorted.slice(0, keys.length - this._maxEntries);
    for (const k of toEvict) {
      delete index.entries[k];
    }
    return index;
  }

  private _parseKey(key: string): { ceiling: number; frontierHash: string } {
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

  private async _restoreBuffer(cas: CasStore, restoreOpts: { manifest: Manifest } & CasRestoreEncryptionArguments): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of cas.restoreStream(restoreOpts)) {
      chunks.push(chunk);
    }
    if (chunks.length === 1 && chunks[0] !== undefined) {
      return chunks[0];
    }
    return concatBytes(...chunks);
  }

  // ---------------------------------------------------------------------------
  // SeekCachePort implementation
  // ---------------------------------------------------------------------------

  override async get(key: string): Promise<SeekCacheEntry | null> {
    const cas = this._cas;
    const index = await this._readIndex();
    const entry = index.entries[key];
    if (entry === null || entry === undefined) {
      return null;
    }

    try {
      return await this._getEntry(cas, key, entry);
    } catch (err) {
      const encryptionError = mapCasContentEncryptionError(err, 'seek-cache');
      if (encryptionError !== null) {
        throw encryptionError;
      }
      await this._mutateIndex((idx) => {
        delete idx.entries[key];
        return idx;
      });
      return null;
    }
  }

  private async _getEntry(cas: CasStore, key: string, entry: IndexEntry): Promise<SeekCacheEntry> {
    const manifest = await cas.readManifest({ treeOid: entry.treeOid });
    const restoreOpts: { manifest: Manifest } & CasRestoreEncryptionArguments = {
      manifest,
      ...this._contentEncryption.toRestoreOptions(),
    };
    const buffer = await this._restoreBuffer(cas, restoreOpts);
    await this._mutateIndex((idx) => {
      const tracked = idx.entries[key];
      if (tracked !== null && tracked !== undefined) {
        tracked.lastAccessedAt = new Date().toISOString();
      }
      return idx;
    });
    const result: SeekCacheEntry = { buffer };
    if (typeof entry.indexTreeOid === 'string' && entry.indexTreeOid.length > 0) {
      result.indexTreeOid = entry.indexTreeOid;
    }
    return result;
  }

  override async set(key: string, buffer: Uint8Array, options?: SeekCacheSetOptions): Promise<void> {
    const cas = this._cas;
    const { ceiling, frontierHash } = this._parseKey(key);

    const { treeOid } = await this._storeCasAsset(cas, key, buffer);

    await this._mutateIndex((index) => {
      const entry: IndexEntry = {
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

  private async _storeCasAsset(cas: CasStore, key: string, buffer: Uint8Array): Promise<{ manifest: Manifest; treeOid: string }> {
    const source = Readable.from([buffer]);
    const storeOpts: { source: Readable; slug: string; filename: string; encryptionKey?: Uint8Array; encryption?: CasStoreEncryptionOptions } = {
      source,
      slug: key,
      filename: 'state.cbor',
      ...this._contentEncryption.toStoreOptions(),
    };
    const manifest = await cas.store(storeOpts);
    const treeOid = await cas.createTree({ manifest });
    return { manifest, treeOid };
  }

  override async has(key: string): Promise<boolean> {
    const index = await this._readIndex();
    return Object.hasOwn(index.entries, key);
  }

  override async keys(): Promise<string[]> {
    const index = await this._readIndex();
    return Object.keys(index.entries);
  }

  override async delete(key: string): Promise<boolean> {
    let existed = false;
    await this._mutateIndex((index) => {
      existed = Object.hasOwn(index.entries, key);
      delete index.entries[key];
      return index;
    });
    return existed;
  }

  override async clear(): Promise<void> {
    try {
      await this._persistence.deleteRef(this._ref);
    } catch {
      // Ref may not exist — that's fine
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
