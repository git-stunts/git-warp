import ContentAddressableStore, {
  AssetHandle as GitCasAssetHandle,
  CborCodec as GitCasCborCodec,
} from '@git-stunts/git-cas';

import { hydrateDecodedPatch } from '../../src/domain/services/PatchHydrator.ts';
import AssetHandle from '../../src/domain/storage/AssetHandle.ts';
import {
  createGitCasPatchStorage,
} from '../../src/ports/CommitMessageCodecPort.ts';
import warpCborCodec from '../../src/infrastructure/codecs/CborCodec.ts';
import {
  TrailerCommitMessageCodecAdapter,
} from '../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import type { V18PatchCommit } from './V18PatchCommit.ts';
import { runV18MigrationGit, v18MigrationGitText } from './V18MigrationGit.ts';

const OID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
const messageCodec = new TrailerCommitMessageCodecAdapter();

type DecodedRecord = { readonly [key: string]: unknown };

export type V18TranslatedPatch = Readonly<{
  attachmentHandles: readonly string[];
  message: string;
  patchHandle: string;
  tree: string;
}>;

/** Rewrites legacy patch and content references into current explicit asset handles. */
export default class V18PatchTranslator {
  readonly #cas: ContentAddressableStore;
  readonly #contentHandles = new Map<string, string>();
  readonly #passphrase: string | null;
  readonly #repositoryPath: string;

  private constructor(
    repositoryPath: string,
    cas: ContentAddressableStore,
    passphrase: string | null,
  ) {
    this.#repositoryPath = repositoryPath;
    this.#cas = cas;
    this.#passphrase = passphrase;
  }

  static async open(options: Readonly<{
    passphrase?: string;
    repositoryPath: string;
  }>): Promise<V18PatchTranslator> {
    const cas = await ContentAddressableStore.open({
      cwd: options.repositoryPath,
      codec: new GitCasCborCodec(),
      applicationRefPrefixes: ['refs/warp/'],
    });
    return new V18PatchTranslator(
      options.repositoryPath,
      cas,
      options.passphrase ?? null,
    );
  }

  async translate(patch: V18PatchCommit): Promise<V18TranslatedPatch> {
    if (patch.storage.kind === 'current') {
      throw new Error(`commit ${patch.commit.sha} is already current`);
    }
    this.#requirePassphrase(patch);
    const source = await this.#readLegacyPatch(patch);
    const decoded = requireRecord(warpCborCodec.decode(source), 'patch root');
    const rewritten = await this.#rewriteContentHandles(decoded, patch.storage.encrypted);
    hydrateDecodedPatch(rewritten.patch);
    const encoded = warpCborCodec.encode(rewritten.patch);
    const stagedPatch = await this.#cas.assets.put({
      source: singleChunk(encoded),
      slug: `patch-${patch.writer}-${String(patch.lamport)}`,
      filename: 'patch.cbor',
      ...this.#encryptionOptions(patch.storage.encrypted),
    });
    const attachmentHandles = [...rewritten.attachmentHandles].sort();
    const members: Array<[string, string]> = attachmentHandles.map((handle, index) => [
      `attachments/${String(index).padStart(8, '0')}`,
      handle,
    ]);
    members.push(['patch', stagedPatch.handle.toString()]);
    const bundle = await this.#cas.bundles.putOrdered({ members });
    const patchHandle = stagedPatch.handle.toString();
    return Object.freeze({
      attachmentHandles: Object.freeze(attachmentHandles),
      message: messageCodec.encodePatch({
        kind: 'patch',
        graph: patch.graph,
        writer: patch.writer,
        lamport: patch.lamport,
        patchHandle: new AssetHandle(patchHandle),
        schema: patch.schema,
        storage: createGitCasPatchStorage({ encrypted: patch.storage.encrypted }),
      }),
      patchHandle,
      tree: bundle.handle.oid,
    });
  }

  close(): Promise<void> {
    return this.#cas.close();
  }

  translatedContentHandle(reference: string): string {
    if (!OID_PATTERN.test(reference)) {
      GitCasAssetHandle.parse(reference);
      return reference;
    }
    const translated = new Set(
      [false, true]
        .map((encrypted) => this.#contentHandles.get(contentCacheKey(reference, encrypted)))
        .filter((handle): handle is string => handle !== undefined),
    );
    if (translated.size === 0) {
      throw new Error(
        `legacy checkpoint content ${reference} was not translated from writer history`,
      );
    }
    if (translated.size > 1) {
      throw new Error(
        `legacy checkpoint content ${reference} has ambiguous encryption modes`,
      );
    }
    return [...translated][0] as string;
  }

  async #readLegacyPatch(patch: V18PatchCommit): Promise<Uint8Array> {
    if (patch.storage.kind === 'legacy-blob') {
      return await runV18MigrationGit(
        this.#repositoryPath,
        ['cat-file', 'blob', patch.storage.oid],
      );
    }
    if (patch.storage.kind === 'current') {
      throw new Error(`commit ${patch.commit.sha} is already current`);
    }
    const adopted = await this.#cas.assets.adopt({ treeOid: patch.storage.oid });
    return await collectChunks(this.#cas.assets.open({
      handle: adopted.handle,
      ...this.#decryptionOptions(patch.storage.encrypted),
    }));
  }

  async #rewriteContentHandles(
    patch: DecodedRecord,
    encrypted: boolean,
  ): Promise<Readonly<{
    attachmentHandles: ReadonlySet<string>;
    patch: DecodedRecord;
  }>> {
    const ops = requireArray(patch['ops'], 'patch ops');
    const attachmentHandles = new Set<string>();
    const rewrittenOps: DecodedRecord[] = [];
    for (const value of ops) {
      const op = requireRecord(value, 'patch op');
      rewrittenOps.push(await this.#rewriteOperation(op, encrypted, attachmentHandles));
    }
    return Object.freeze({
      attachmentHandles,
      patch: Object.freeze({ ...patch, ops: Object.freeze(rewrittenOps) }),
    });
  }

  async #rewriteOperation(
    op: DecodedRecord,
    encrypted: boolean,
    attachmentHandles: Set<string>,
  ): Promise<DecodedRecord> {
    const type = op['type'];
    if (op['key'] === '_content') {
      const contentValue = op['value'];
      if (typeof contentValue !== 'string') {
        throw new Error('legacy patch content is not a string reference');
      }
      const handle = await this.#translateContentReference(contentValue, encrypted);
      attachmentHandles.add(handle);
      return Object.freeze({ ...op, value: handle });
    }
    if (type === 'BlobValue' && typeof op['oid'] === 'string') {
      const handle = await this.#translateContentReference(op['oid'], encrypted);
      attachmentHandles.add(handle);
      return Object.freeze({ ...op, oid: handle });
    }
    return op;
  }

  async #translateContentReference(reference: string, encrypted: boolean): Promise<string> {
    if (!OID_PATTERN.test(reference)) {
      GitCasAssetHandle.parse(reference);
      return reference;
    }
    const cacheKey = contentCacheKey(reference, encrypted);
    const existing = this.#contentHandles.get(cacheKey);
    if (existing !== undefined) {
      return existing;
    }
    const objectType = await v18MigrationGitText(
      this.#repositoryPath,
      ['cat-file', '-t', reference],
    );
    const handle = objectType === 'tree'
      ? await this.#adoptContentTree(reference, encrypted)
      : await this.#stageContentBlob(reference, objectType, encrypted);
    this.#contentHandles.set(cacheKey, handle);
    return handle;
  }

  async #adoptContentTree(treeOid: string, encrypted: boolean): Promise<string> {
    const adopted = await this.#cas.assets.adopt({ treeOid });
    await drain(this.#cas.assets.open({
      handle: adopted.handle,
      ...this.#decryptionOptions(encrypted),
    }));
    return adopted.handle.toString();
  }

  async #stageContentBlob(
    oid: string,
    objectType: string,
    encrypted: boolean,
  ): Promise<string> {
    if (objectType !== 'blob') {
      throw new Error(`legacy content ${oid} has unsupported Git object type ${objectType}`);
    }
    const bytes = await runV18MigrationGit(this.#repositoryPath, ['cat-file', 'blob', oid]);
    const staged = await this.#cas.assets.put({
      source: singleChunk(bytes),
      slug: `v18-content-${oid}`,
      filename: 'content',
      ...this.#encryptionOptions(encrypted),
    });
    return staged.handle.toString();
  }

  #requirePassphrase(patch: V18PatchCommit): void {
    if (patch.storage.encrypted && this.#passphrase === null) {
      throw new Error(
        `encrypted commit ${patch.commit.sha} requires GIT_WARP_MIGRATION_PASSPHRASE`,
      );
    }
  }

  #decryptionOptions(encrypted: boolean): Readonly<{ passphrase?: string }> {
    return encrypted && this.#passphrase !== null ? { passphrase: this.#passphrase } : {};
  }

  #encryptionOptions(encrypted: boolean): Readonly<{ passphrase?: string }> {
    return this.#decryptionOptions(encrypted);
  }
}

function contentCacheKey(reference: string, encrypted: boolean): string {
  return `${reference}:${String(encrypted)}`;
}

function requireRecord(value: unknown, label: string): DecodedRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return Object.freeze(Object.fromEntries(Object.entries(value)));
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

async function collectChunks(source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of source) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function drain(source: AsyncIterable<Uint8Array>): Promise<void> {
  for await (const _chunk of source) {
    // Draining makes git-cas verify every retained chunk before promotion.
  }
}

async function* singleChunk(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes;
}
