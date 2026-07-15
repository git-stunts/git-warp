import {
  AssetHandle as GitCasAssetHandle,
  BundleHandle,
  PageHandle,
  RetentionWitness,
  StagedAsset,
  StagedBundle,
  type ApplicationHandle,
  type ApplicationHandleInput,
  type AssetHandleInput,
  type AssetCapability,
  type BundleHandleInput,
  type BundleCapability,
  type BundleMember,
  type PageHandleInput,
  type PublicationCapability,
} from '@git-stunts/git-cas';
import AssetHandle from '../../src/domain/storage/AssetHandle.ts';
import { collectAsyncIterable } from '../../src/domain/utils/streamUtils.ts';
import type { GitTreeCommitOptions } from '../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import InMemoryBlobStorageAdapter from './InMemoryBlobStorageAdapter.ts';

type PublicationHistory = {
  readRef(ref: string): Promise<string | null>;
  compareAndSwapRef(ref: string, newOid: string, expectedOid: string | null): Promise<void>;
  commitNodeWithTree(options: GitTreeCommitOptions): Promise<string>;
  writeBlob(content: Uint8Array | string): Promise<string>;
  writeTree(entries: string[]): Promise<string>;
  readObjectType(oid: string): Promise<string>;
};

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
  readonly bundles: Pick<BundleCapability, 'putOrdered' | 'iterateMembers'>;
  readonly publications: Pick<PublicationCapability, 'commit'>;

  readonly #history: PublicationHistory;
  readonly #storage: InMemoryBlobStorageAdapter;
  readonly #stagedAssetsByOid = new Map<string, StagedAsset>();
  readonly #bundleMembers = new Map<string, readonly [string, string][]>();
  readonly #publicationRoots = new Map<string, string>();

  constructor(options: {
    history: PublicationHistory;
    storage: InMemoryBlobStorageAdapter;
  }) {
    this.#history = options.history;
    this.#storage = options.storage;
    this.assets = Object.freeze({
      put: async (request) => await this.#putAsset(request),
      adopt: async ({ treeOid }) => await this.#adoptAsset(treeOid),
      open: (request) => this.#openAsset(request),
    });
    this.bundles = Object.freeze({
      putOrdered: async (request) => await this.#putBundle(request.members),
      iterateMembers: (request) => this.#iterateBundleMembers(request.handle),
    });
    this.publications = Object.freeze({
      commit: async (request) => await this.#publish(request),
    });
  }

  readBundleMembers(handle: string): readonly [string, string][] {
    return this.#bundleMembers.get(handle) ?? Object.freeze([]);
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
    return await this.#storage.retrieve(handle.toString()).catch(
      async () => await this.#storage.retrieve(handle.oid),
    );
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

function parseApplicationHandle(input: ApplicationHandleInput): ApplicationHandle {
  if (input instanceof GitCasAssetHandle || input instanceof BundleHandle || input instanceof PageHandle) {
    return input;
  }
  if (typeof input === 'string') {
    try {
      return GitCasAssetHandle.parse(input);
    } catch {
      try {
        return BundleHandle.parse(input);
      } catch {
        return PageHandle.parse(input);
      }
    }
  }
  if (input.kind === 'asset' || input.format === 'manifest-tree') {
    return GitCasAssetHandle.from(input as AssetHandleInput);
  }
  if (input.kind === 'bundle' || input.format === 'fanout-tree') {
    return BundleHandle.from(input as BundleHandleInput);
  }
  return PageHandle.from(input as PageHandleInput);
}

/** Converts a git-cas asset handle for assertions against WARP ports. */
export function warpAssetHandle(handle: GitCasAssetHandle): AssetHandle {
  return new AssetHandle(handle.toString());
}
