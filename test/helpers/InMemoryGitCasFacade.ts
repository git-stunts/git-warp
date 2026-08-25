import {
  AssetHandle as GitCasAssetHandle,
  BundleHandle,
  CacheHit,
  PageHandle,
  RetentionWitness,
  StagedAsset,
  StagedBundle,
  StagedPage,
  type ApplicationHandle,
  type AssetCapability,
  type BundleHandleInput,
  type BundleCapability,
  type BundleMember,
  type CacheAcquisition,
  type CacheInspection,
  type CacheSet,
  type PageCapability,
  type PublicationCapability,
} from '@git-stunts/git-cas';
import AssetHandle from '../../src/domain/storage/AssetHandle.ts';
import { collectAsyncIterable } from '../../src/domain/utils/streamUtils.ts';
import type { GitTreeCommitOptions } from '../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import type { GitCasStagingWorkspace } from '../../src/infrastructure/adapters/GitCasMaterializationWorkspace.ts';
import InMemoryBlobStorageAdapter from './InMemoryBlobStorageAdapter.ts';
import {
  parseInMemoryApplicationHandle as parseApplicationHandle,
} from './InMemoryGitCasApplicationHandle.ts';
import InMemoryGitCasWorkspaceRegistry from './InMemoryGitCasWorkspaceRegistry.ts';

type PublicationHistory = {
  readRef(ref: string): Promise<string | null>;
  compareAndSwapRef(ref: string, newOid: string, expectedOid: string | null): Promise<void>;
  commitNodeWithTree(options: GitTreeCommitOptions): Promise<string>;
  writeBlob(content: Uint8Array | string): Promise<string>;
  writeTree(entries: string[]): Promise<string>;
  readObjectType(oid: string): Promise<string>;
};

type FixtureAssetReader = (oid: string) => Promise<Uint8Array | null>;

const BUNDLE_LIMITS = Object.freeze({
  maxMembers: 100_000,
  maxMemberPathBytes: 4_096,
  maxDescriptorBytes: 16_777_216,
  maxFanoutEntries: 1_024,
  maxFanoutDepth: 16,
});
const ENCRYPTED_ASSET_MAGIC = new Uint8Array([0x47, 0x57, 0x45, 0x43]);
const ENCRYPTED_ASSET_NONCE_BYTES = 12;

/** Minimal high-level git-cas facade used to exercise production adapters in memory. */
export default class InMemoryGitCasFacade {
  readonly assets: Pick<AssetCapability, 'put' | 'adopt' | 'open'>;
  readonly bundles: Pick<
    BundleCapability,
    | 'getMember'
    | 'getMemberReference'
    | 'putOrdered'
    | 'putOrderedBatch'
    | 'iterateMembers'
    | 'iterateMemberReferences'
  >;
  readonly caches: {
    open(options: {
      readonly namespace: string;
    }): Promise<Pick<
      CacheSet,
      | 'acquire'
      | 'doctor'
      | 'get'
      | 'inspect'
      | 'put'
      | 'remove'
      | 'repair'
      | 'ref'
      | 'sweep'
    >>;
  };
  readonly pages: Pick<PageCapability, 'get' | 'put' | 'putBatch'>;
  readonly publications: Pick<PublicationCapability, 'commit'>;
  readonly workspaces: {
    open(options: {
      readonly namespace: string;
      readonly ttlMs?: number;
    }): Promise<GitCasStagingWorkspace>;
  };

  readonly #history: PublicationHistory;
  readonly #storage: InMemoryBlobStorageAdapter;
  readonly #fixtureAssetReader: FixtureAssetReader | null;
  readonly #stagedAssetsByOid = new Map<string, StagedAsset>();
  readonly #bundleMembers = new Map<string, readonly [string, string][]>();
  readonly #cacheAcquisitions = new Set<string>();
  readonly #cacheEntries = new Map<string, Map<string, CacheHit>>();
  readonly #pageBytes = new Map<string, Uint8Array>();
  readonly #publicationRoots = new Map<string, string>();
  readonly #workspaceRegistry: InMemoryGitCasWorkspaceRegistry;
  #cacheGeneration = 0;
  #nextCacheAcquisition = 1;

  constructor(options: {
    history: PublicationHistory;
    storage: InMemoryBlobStorageAdapter;
    fixtureAssetReader?: FixtureAssetReader;
  }) {
    this.#history = options.history;
    this.#storage = options.storage;
    this.#fixtureAssetReader = options.fixtureAssetReader ?? null;
    this.#workspaceRegistry = new InMemoryGitCasWorkspaceRegistry({
      putAsset: async (request) => await this.#putAsset(request),
      adoptAsset: async (treeOid) => await this.#adoptAsset(treeOid),
      putPage: async (request) => await this.#putPage(request),
      putPageBatch: async (request) => await this.#putPageBatch(request),
      putBundle: async (members) => await this.#putBundle(members),
      putBundleBatch: async (request) => await this.#putBundleBatch(request),
    });
    this.assets = Object.freeze({
      put: async (request) => await this.#putAsset(request),
      adopt: async ({ treeOid }) => await this.#adoptAsset(treeOid),
      open: (request) => this.#openAsset(request),
    });
    this.bundles = Object.freeze({
      putOrdered: async (request) => await this.#putBundle(request.members),
      putOrderedBatch: async (request) => await this.#putBundleBatch(request),
      getMember: async (request) => await this.#getBundleMember(request.handle, request.path),
      getMemberReference: async (request) => (
        await this.#getBundleMember(request.handle, request.path)
      ),
      iterateMembers: (request) => this.#iterateBundleMembers(request.handle),
      iterateMemberReferences: (request) => this.#iterateBundleMembers(request.handle),
    });
    this.caches = Object.freeze({
      open: async ({ namespace }) => await this.#openCache(namespace),
    });
    this.pages = Object.freeze({
      put: async (request) => await this.#putPage(request),
      putBatch: async (request) => await this.#putPageBatch(request),
      get: async (request) => await this.#getPage(request),
    });
    this.publications = Object.freeze({
      commit: async (request) => await this.#publish(request),
    });
    this.workspaces = Object.freeze({
      open: async (request) => await this.#workspaceRegistry.open(request),
    });
  }

  readBundleMembers(handle: string): readonly [string, string][] {
    return this.#bundleMembers.get(handle) ?? Object.freeze([]);
  }

  replaceBundleMembers(handle: string, members: readonly [string, string][]): void {
    this.#bundleMembers.set(handle, Object.freeze([...members]));
  }

  readCacheKeys(namespace: string): readonly string[] {
    return Object.freeze([...(this.#cacheEntries.get(namespace)?.keys() ?? [])]);
  }

  readCacheHits(namespace: string): readonly CacheHit[] {
    return Object.freeze([...(this.#cacheEntries.get(namespace)?.values() ?? [])]);
  }

  readActiveCacheAcquisitionCount(): number {
    return this.#cacheAcquisitions.size;
  }

  readActiveWorkspaceCount(): number {
    return this.#workspaceRegistry.readActiveCount();
  }

  readWorkspaceRoots(): readonly (readonly string[])[] {
    return this.#workspaceRegistry.readRoots();
  }

  readWorkspaceGenerationCount(): number {
    return this.#workspaceRegistry.readGenerationCount();
  }

  replaceStoredPage(handle: string, bytes: Uint8Array): void {
    this.#pageBytes.set(handle, bytes.slice());
  }

  readPublicationRoot(commitId: string): string | null {
    return this.#publicationRoots.get(commitId) ?? null;
  }

  async readStoredAsset(handle: string): Promise<Uint8Array> {
    return await this.#readStoredAsset(GitCasAssetHandle.parse(handle));
  }

  replaceStoredAsset(handle: string, bytes: Uint8Array): void {
    this.#storage.replace(new AssetHandle(handle), bytes);
  }

  async #putAsset(
    request: Parameters<AssetCapability['put']>[0],
  ): Promise<StagedAsset> {
    const sourceBytes = await collectAsyncIterable(request.source);
    const storedBytes = request.encryptionKey === undefined
      ? sourceBytes
      : await encryptAsset(sourceBytes, request.encryptionKey);
    const staged = await this.#storage.stage(singleChunk(storedBytes), {
      slug: request.slug,
      filename: request.filename ?? 'content',
    });
    const asset = new StagedAsset({
      handle: GitCasAssetHandle.parse(staged.handle.toString()),
      slug: request.slug,
      filename: request.filename ?? 'content',
      size: sourceBytes.byteLength,
      observedAt: staged.observedAt,
    });
    this.#stagedAssetsByOid.set(asset.handle.oid, asset);
    return asset;
  }

  async #adoptAsset(treeOid: string): Promise<StagedAsset> {
    const existing = this.#stagedAssetsByOid.get(treeOid);
    if (existing !== undefined) {
      return existing;
    }
    if (await this.#history.readObjectType(treeOid) !== 'tree') {
      throw Object.assign(
        new Error(`Cannot adopt non-tree object as asset: ${treeOid}`),
        { code: 'GIT_ERROR' },
      );
    }
    const handle = new GitCasAssetHandle({
      codec: 'raw',
      hashAlgorithm: treeOid.length === 64 ? 'sha256' : 'sha1',
      oid: treeOid,
    });
    return new StagedAsset({
      handle,
      slug: 'adopted',
      filename: 'content',
      size: 0,
      observedAt: new Date(0).toISOString(),
    });
  }

  async *#openAsset(request: Parameters<AssetCapability['open']>[0]): AsyncIterable<Uint8Array> {
    const handle = GitCasAssetHandle.from(request.handle);
    const storedBytes = await this.#readStoredAsset(handle);
    if (!hasEncryptedAssetMagic(storedBytes)) {
      yield storedBytes;
      return;
    }
    if (request.encryptionKey === undefined) {
      throw encryptedAssetIntegrityError();
    }
    yield await decryptAsset(storedBytes, request.encryptionKey);
  }

  async #readStoredAsset(handle: GitCasAssetHandle): Promise<Uint8Array> {
    try {
      return await this.#storage.retrieve(handle.toString());
    } catch {
      try {
        return await this.#storage.retrieve(handle.oid);
      } catch (storageError) {
        const fixtureBytes = await this.#fixtureAssetReader?.(handle.oid) ?? null;
        if (fixtureBytes !== null) {
          return fixtureBytes;
        }
        throw storageError;
      }
    }
  }

  async #putBundle(
    members: Parameters<BundleCapability['putOrdered']>[0]['members'],
  ): Promise<StagedBundle> {
    const lines: string[] = [];
    const recordedMembers: Array<[string, string]> = [];
    for await (const [path, member] of members) {
      const token = String(member);
      lines.push(`${path}\0${token}`);
      recordedMembers.push([path, token]);
    }
    const descriptorOid = await this.#history.writeBlob(lines.join('\n'));
    const oid = await this.#history.writeTree([
      `100644 blob ${descriptorOid}\tbundle.members`,
    ]);
    const handle = new BundleHandle({
      codec: 'ordered-test-bundle',
      hashAlgorithm: oid.length === 64 ? 'sha256' : 'sha1',
      oid,
    });
    this.#bundleMembers.set(handle.toString(), Object.freeze(recordedMembers));
    return new StagedBundle({
      handle,
      memberCount: lines.length,
      indexDepth: 1,
      descriptorBytes: lines.join('\n').length,
      limits: BUNDLE_LIMITS,
      observedAt: new Date(0).toISOString(),
    });
  }

  async #putBundleBatch(
    request: Parameters<BundleCapability['putOrderedBatch']>[0],
  ): Promise<Awaited<ReturnType<BundleCapability['putOrderedBatch']>>> {
    const staged: StagedBundle[] = [];
    for (const bundle of request.bundles) {
      staged.push(await this.#putBundle(bundle.members));
    }
    return Object.freeze(staged);
  }

  async *#iterateBundleMembers(
    handleInput: BundleHandleInput,
  ): AsyncGenerator<BundleMember> {
    const handle = BundleHandle.from(handleInput);
    const members = this.#bundleMembers.get(handle.toString());
    if (members === undefined) {
      throw Object.assign(new Error(`Unknown bundle: ${handle.toString()}`), {
        code: 'BUNDLE_NOT_FOUND',
      });
    }
    for (const [path, token] of members) {
      const memberHandle = parseApplicationHandle(token);
      const asset = memberHandle instanceof GitCasAssetHandle
        ? this.#stagedAssetsByOid.get(memberHandle.oid)
        : undefined;
      yield Object.freeze({
        version: 1,
        path,
        handle: memberHandle,
        type: memberHandle instanceof PageHandle ? 'blob' : 'tree',
        size: asset?.asset.size ?? null,
        logicalBytes: asset?.asset.size ?? 0,
      });
    }
  }

  async #getBundleMember(
    handleInput: BundleHandleInput,
    path: string,
  ): Promise<BundleMember | null> {
    for await (const member of this.#iterateBundleMembers(handleInput)) {
      if (member.path === path) {
        return member;
      }
    }
    return null;
  }

  async #putPage(
    request: Parameters<PageCapability['put']>[0],
  ): Promise<Awaited<ReturnType<PageCapability['put']>>> {
    const bytes = await collectPageSource(request.source);
    if (request.maxBytes !== undefined && bytes.byteLength > request.maxBytes) {
      throw Object.assign(new Error('Page exceeds configured maximum'), { code: 'PAGE_TOO_LARGE' });
    }
    const oid = await this.#history.writeBlob(bytes);
    const handle = new PageHandle({
      oid,
      hashAlgorithm: oid.length === 64 ? 'sha256' : 'sha1',
    });
    this.#pageBytes.set(handle.toString(), bytes.slice());
    return new StagedPage({
      handle,
      size: bytes.byteLength,
      observedAt: new Date(0).toISOString(),
    });
  }

  async #putPageBatch(
    request: Parameters<PageCapability['putBatch']>[0],
  ): Promise<Awaited<ReturnType<PageCapability['putBatch']>>> {
    const maxBatchBytes = request.maxBatchBytes ?? 32 * 1024 * 1024;
    const maxBatchPages = request.maxBatchPages ?? 256;
    if (request.pages.length > maxBatchPages) {
      throw Object.assign(new Error('Page batch exceeds configured count'), {
        code: 'PAGE_BATCH_LIMIT',
      });
    }
    const staged: StagedPage[] = [];
    let totalBytes = 0;
    for (const page of request.pages) {
      const result = await this.#putPage(page);
      totalBytes += result.page.size;
      if (totalBytes > maxBatchBytes) {
        throw Object.assign(new Error('Page batch exceeds configured bytes'), {
          code: 'PAGE_BATCH_LIMIT',
        });
      }
      staged.push(result);
    }
    return Object.freeze(staged);
  }

  async #getPage(
    request: Parameters<PageCapability['get']>[0],
  ): Promise<Uint8Array> {
    const handle = PageHandle.from(request.handle);
    const bytes = this.#pageBytes.get(handle.toString());
    if (bytes === undefined) {
      throw Object.assign(new Error(`Unknown page: ${handle.toString()}`), {
        code: 'HANDLE_TARGET_MISSING',
      });
    }
    if (request.maxBytes !== undefined && bytes.byteLength > request.maxBytes) {
      throw Object.assign(new Error('Page exceeds configured maximum'), { code: 'PAGE_TOO_LARGE' });
    }
    return bytes.slice();
  }

  async #openCache(
    namespace: string,
  ): Promise<Pick<
    CacheSet,
    | 'acquire'
    | 'doctor'
    | 'get'
    | 'inspect'
    | 'put'
    | 'remove'
    | 'repair'
    | 'ref'
    | 'sweep'
  >> {
    const entries = this.#cacheEntries.get(namespace) ?? new Map<string, CacheHit>();
    this.#cacheEntries.set(namespace, entries);
    const ref = `refs/cas/caches/${namespace}`;
    const nextGeneration = (): string => {
      this.#cacheGeneration += 1;
      return this.#cacheGeneration.toString(16).padStart(40, '0');
    };
    const witness = (
      handle: ApplicationHandle,
      generation: string,
    ): RetentionWitness => new RetentionWitness({
      handle,
      policy: 'evictable',
      reachability: 'anchored',
      root: {
        kind: 'cache-set',
        namespace,
        ref,
        generation,
        path: 'root-00000000',
      },
      observedAt: new Date(0).toISOString(),
    });
    return Object.freeze({
      ref,
      acquire: async (key): Promise<CacheAcquisition | null> => {
        const hit = entries.get(key);
        if (hit === undefined) {
          return null;
        }
        const id = `test-acquisition-${String(this.#nextCacheAcquisition)}`;
        this.#nextCacheAcquisition += 1;
        this.#cacheAcquisitions.add(id);
        const acquiredAt = new Date(0).toISOString();
        const evidence = new RetentionWitness({
          handle: hit.handle,
          policy: 'pinned',
          reachability: 'anchored',
          root: {
            kind: 'cache-set',
            namespace,
            ref: `refs/cas/cache-acquisitions/${namespace}/${id}`,
            generation: hit.generation,
            path: 'root-00000000',
          },
          observedAt: acquiredAt,
        });
        return Object.freeze({
          id,
          hit,
          evidence,
          acquiredAt,
          release: async () => Object.freeze({
            id,
            generation: hit.generation,
            changed: this.#cacheAcquisitions.delete(id),
            releasedAt: new Date(0).toISOString(),
          }),
        });
      },
      doctor: async () => Object.freeze({
        healthy: true,
        root: Object.freeze({
          healthy: true,
          ref,
          entryCount: entries.size,
        }),
        issues: Object.freeze([]),
      }),
      get: async (key) => entries.get(key) ?? null,
      inspect: async (
        { limit = 100, cursor = null }: { limit?: number; cursor?: string | null } = {},
      ): Promise<CacheInspection> => {
        const candidates = [...entries.values()]
          .sort((left, right) => left.key.localeCompare(right.key))
          .filter((hit) => cursor === null || hit.key > cursor);
        const selected = candidates.slice(0, limit);
        return Object.freeze({
          namespace,
          ref: `refs/cas/caches/${namespace}`,
          generation: null,
          state: null,
          observed: null,
          policy: null,
          entries: Object.freeze(selected.map((hit) => Object.freeze({
            version: 1 as const,
            accountingVersion: 1 as const,
            key: hit.key,
            keyDigest: hit.key,
            handle: hit.handle.toString(),
            policy: hit.policy,
            expiresAt: hit.expiresAt,
            logicalBytes: hit.logicalBytes,
            createdAt: hit.createdAt,
            accessedAt: hit.accessedAt,
          }))),
          nextCursor: candidates.length > limit
            ? selected.at(-1)?.key ?? null
            : null,
        });
      },
      put: async (key, handle, options) => {
        const previous = entries.get(key) ?? null;
        const target = parseApplicationHandle(handle);
        const generation = nextGeneration();
        const observedAt = new Date(0).toISOString();
        const evidence = new RetentionWitness({
          handle: target,
          policy: options?.retention ?? 'evictable',
          reachability: 'anchored',
          root: {
            kind: 'cache-set',
            namespace,
            ref: `refs/cas/caches/${namespace}`,
            generation,
            path: 'root-00000000',
          },
          observedAt,
        });
        const hit = new CacheHit({
          key,
          handle: target,
          policy: options?.retention ?? 'evictable',
          expiresAt: options?.expiresAt === undefined || options.expiresAt === null
            ? null
            : new Date(options.expiresAt).toISOString(),
          logicalBytes: 0,
          createdAt: observedAt,
          accessedAt: observedAt,
          generation,
          evidence,
        });
        entries.set(key, hit);
        return Object.freeze({
          changed: previous?.handle.toString() !== target.toString(),
          accepted: true,
          hit,
          previous,
          generation,
          policy: null,
          witness: evidence,
        });
      },
      remove: async (key) => {
        const removed = entries.get(key) ?? null;
        const changed = entries.delete(key);
        const generation = nextGeneration();
        return Object.freeze({
          changed,
          removed,
          generation,
          policy: null,
          witness: null,
        });
      },
      repair: async (options) => {
        const repaired = new Map<string, CacheHit>();
        let retainedHandle: ApplicationHandle | null = null;
        const observedAt = new Date(0).toISOString();
        const generation = nextGeneration();
        for await (const entry of options.entries) {
          const handle = parseApplicationHandle(entry.handle);
          retainedHandle ??= handle;
          const previous = entries.get(entry.key);
          const evidence = witness(handle, generation);
          repaired.set(entry.key, new CacheHit({
            key: entry.key,
            handle,
            policy: entry.retention ?? 'evictable',
            expiresAt: entry.expiresAt === undefined || entry.expiresAt === null
              ? null
              : new Date(entry.expiresAt).toISOString(),
            logicalBytes: previous?.logicalBytes ?? 0,
            createdAt: entry.createdAt === undefined
              ? observedAt
              : new Date(entry.createdAt).toISOString(),
            accessedAt: entry.accessedAt === undefined
              ? observedAt
              : new Date(entry.accessedAt).toISOString(),
            generation,
            evidence,
          }));
        }
        entries.clear();
        for (const [key, hit] of repaired) {
          entries.set(key, hit);
        }
        const handle = retainedHandle ?? new PageHandle({
          oid: '0'.repeat(40),
          hashAlgorithm: 'sha1',
        });
        const policy = Object.freeze({
          satisfied: true,
          entryCount: entries.size,
          logicalBytes: [...entries.values()]
            .reduce((total, entry) => total + entry.logicalBytes, 0),
          pinnedEntries: [...entries.values()]
            .filter((entry) => entry.policy === 'pinned').length,
          evictableEntries: [...entries.values()]
            .filter((entry) => entry.policy === 'evictable').length,
          expiredEntries: 0,
          limits: Object.freeze({
            maxEntries: options.policy?.maxEntries ?? 10_000,
            maxBytes: options.policy?.maxBytes ?? null,
            accessResolutionMs: options.policy?.accessResolutionMs ?? 60_000,
          }),
        });
        return Object.freeze({
          repaired: true as const,
          generation,
          policy,
          witness: witness(handle, generation),
        });
      },
      sweep: async () => {
        const removed = [...entries.values()]
          .filter((entry) => (
            entry.policy === 'evictable'
            && entry.expiresAt !== null
            && Date.parse(entry.expiresAt) <= 0
          ));
        for (const entry of removed) {
          entries.delete(entry.key);
        }
        const generation = nextGeneration();
        return Object.freeze({
          changed: removed.length > 0,
          generation,
          policy: null,
          witness: null,
          removed: removed.length,
        });
      },
    });
  }

  async #publish(
    request: Parameters<PublicationCapability['commit']>[0],
  ): Promise<Awaited<ReturnType<PublicationCapability['commit']>>> {
    const root = parseApplicationHandle(request.root);
    const current = await this.#history.readRef(request.ref.name);
    if (current !== request.ref.expected) {
      // Delegate conflict construction to the history fake's verified CAS path.
      await this.#history.compareAndSwapRef(
        request.ref.name,
        current ?? root.oid,
        request.ref.expected,
      );
    }
    const commitId = await this.#history.commitNodeWithTree({
      treeOid: root.oid,
      parents: request.commit.parents ?? [],
      message: request.commit.message,
    });
    await this.#history.compareAndSwapRef(request.ref.name, commitId, request.ref.expected);
    const witness = new RetentionWitness({
      handle: root,
      policy: 'pinned',
      reachability: 'anchored',
      root: {
        kind: 'publication',
        namespace: request.ref.name,
        ref: request.ref.name,
        generation: commitId,
        path: '/',
      },
      observedAt: new Date(0).toISOString(),
    });
    this.#publicationRoots.set(commitId, root.toString());
    return Object.freeze({
      operation: 'publication',
      commitId,
      ref: request.ref.name,
      root,
      witness,
    });
  }
}

async function encryptAsset(bytes: Uint8Array, keyBytes: Uint8Array): Promise<Uint8Array> {
  const key = await importAesKey(keyBytes);
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(ENCRYPTED_ASSET_NONCE_BYTES));
  const ciphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    exactBytes(bytes),
  ));
  const envelope = new Uint8Array(
    ENCRYPTED_ASSET_MAGIC.byteLength + nonce.byteLength + ciphertext.byteLength,
  );
  envelope.set(ENCRYPTED_ASSET_MAGIC, 0);
  envelope.set(nonce, ENCRYPTED_ASSET_MAGIC.byteLength);
  envelope.set(ciphertext, ENCRYPTED_ASSET_MAGIC.byteLength + nonce.byteLength);
  return envelope;
}

async function decryptAsset(envelope: Uint8Array, keyBytes: Uint8Array): Promise<Uint8Array> {
  const nonceStart = ENCRYPTED_ASSET_MAGIC.byteLength;
  const ciphertextStart = nonceStart + ENCRYPTED_ASSET_NONCE_BYTES;
  try {
    const key = await importAesKey(keyBytes);
    return new Uint8Array(await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: envelope.slice(nonceStart, ciphertextStart) },
      key,
      envelope.slice(ciphertextStart),
    ));
  } catch {
    throw encryptedAssetIntegrityError();
  }
}

async function importAesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return await globalThis.crypto.subtle.importKey(
    'raw',
    exactBytes(keyBytes),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

function exactBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const exact = new Uint8Array(bytes.byteLength);
  exact.set(bytes);
  return exact;
}

function hasEncryptedAssetMagic(bytes: Uint8Array): boolean {
  return bytes.byteLength >= ENCRYPTED_ASSET_MAGIC.byteLength + ENCRYPTED_ASSET_NONCE_BYTES
    && ENCRYPTED_ASSET_MAGIC.every((value, index) => bytes[index] === value);
}

function encryptedAssetIntegrityError(): Error & { readonly code: 'INTEGRITY_ERROR' } {
  return Object.assign<Error, { readonly code: 'INTEGRITY_ERROR' }>(
    new Error('Decryption failed: Integrity check error'),
    { code: 'INTEGRITY_ERROR' },
  );
}

async function* singleChunk(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  yield bytes;
}

async function collectPageSource(
  source: Parameters<PageCapability['put']>[0]['source'],
): Promise<Uint8Array> {
  if (source instanceof Uint8Array) {
    return source.slice();
  }
  return await collectAsyncIterable(toAsyncIterable(source));
}

async function* toAsyncIterable(
  source: Iterable<Uint8Array> | AsyncIterable<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  for await (const chunk of source) {
    yield chunk;
  }
}

/** Converts a git-cas asset handle for assertions against WARP ports. */
export function warpAssetHandle(handle: GitCasAssetHandle): AssetHandle {
  return new AssetHandle(handle.toString());
}
