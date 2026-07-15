import type {
  BundleCapability,
  PublicationCapability,
} from '@git-stunts/git-cas';
import PatchEntry from '../../domain/artifacts/PatchEntry.ts';
import PatchPublicationConflictError from '../../domain/errors/PatchPublicationConflictError.ts';
import SyncError from '../../domain/errors/SyncError.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import { hydrateDecodedPatch } from '../../domain/services/PatchHydrator.ts';
import type AssetHandle from '../../domain/storage/AssetHandle.ts';
import BundleHandle from '../../domain/storage/BundleHandle.ts';
import WarpStream from '../../domain/stream/WarpStream.ts';
import type Patch from '../../domain/types/Patch.ts';
import type AssetStoragePort from '../../ports/AssetStoragePort.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import {
  createGitCasPatchStorage,
  type PatchCommitMessage,
  type default as CommitMessageCodecPort,
} from '../../ports/CommitMessageCodecPort.ts';
import PatchJournalPort, {
  type AppendPatchRequest,
  type PublishedPatch,
} from '../../ports/PatchJournalPort.ts';
import {
  CURRENT_SUBSTRATE_ONLY_POLICY,
  type SubstrateCompatibilityPolicyValue,
} from './SubstrateCompatibilityPolicy.ts';
import { adaptGitCasRetentionWitness } from './GitCasRetentionWitnessAdapter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from './TrailerCommitMessageCodecAdapter.ts';
import { collectAsyncIterable } from '../../domain/utils/streamUtils.ts';
import { requireAdapterDependency } from './AdapterDependencyGuard.ts';
import { readGitCasErrorCode } from './GitCasErrorCode.ts';

type CommitInfo = {
  sha: string;
  message: string;
  author: string;
  date: string;
  parents: string[];
};

type CommitReader = {
  getNodeInfo(sha: string): Promise<CommitInfo>;
};

export type GitCasPatchFacade = {
  readonly bundles: Pick<BundleCapability, 'putOrdered'>;
  readonly publications: Pick<PublicationCapability, 'commit'>;
};

/** CBOR patch codec over git-cas asset, bundle, and publication capabilities. */
export class CborPatchJournalAdapter extends PatchJournalPort {
  readonly #assetStorage: AssetStoragePort;
  readonly #cas: GitCasPatchFacade;
  readonly #codec: CodecPort;
  readonly #commitMessageCodec: CommitMessageCodecPort;
  readonly #commitReader: CommitReader;
  readonly #compatibilityPolicy: SubstrateCompatibilityPolicyValue;
  readonly #encrypted: boolean;

  constructor(options: {
    readonly assetStorage: AssetStoragePort;
    readonly cas: GitCasPatchFacade;
    readonly codec: CodecPort;
    readonly commitReader: CommitReader;
    readonly commitMessageCodec?: CommitMessageCodecPort;
    readonly compatibilityPolicy?: SubstrateCompatibilityPolicyValue;
    readonly encrypted?: boolean;
  }) {
    super();
    requireAdapterDependency(options.assetStorage, 'assetStorage');
    requireAdapterDependency(options.cas, 'cas');
    requireAdapterDependency(options.codec, 'codec');
    requireAdapterDependency(options.commitReader, 'commitReader');
    this.#assetStorage = options.assetStorage;
    this.#cas = options.cas;
    this.#codec = options.codec;
    this.#commitReader = options.commitReader;
    this.#commitMessageCodec = options.commitMessageCodec ?? DEFAULT_COMMIT_MESSAGE_CODEC;
    this.#compatibilityPolicy = options.compatibilityPolicy ?? CURRENT_SUBSTRATE_ONLY_POLICY;
    this.#encrypted = options.encrypted ?? false;
  }

  override async appendPatch(request: AppendPatchRequest): Promise<PublishedPatch> {
    const stagedPatch = await this.#assetStorage.stage(WarpStream.from([
      this.#codec.encode(request.patch),
    ]), {
      slug: `patch-${request.writer}-${request.patch.lamport}`,
      filename: 'patch.cbor',
    });
    const bundle = await this.#cas.bundles.putOrdered({
      members: patchBundleMembers(stagedPatch.handle, request.attachments),
    });
    const message = this.#commitMessageCodec.encodePatch({
      kind: 'patch',
      graph: request.graph,
      writer: request.writer,
      lamport: request.patch.lamport,
      patchHandle: stagedPatch.handle,
      schema: request.patch.schema,
      storage: createGitCasPatchStorage({ encrypted: this.#encrypted }),
    });
    const publication = await this.#publishBundle(bundle.handle, message, request);
    return Object.freeze({
      sha: publication.commitId,
      bundleHandle: new BundleHandle(publication.root.toString()),
      stagedPatch,
      retention: adaptGitCasRetentionWitness(publication.witness.toJSON()),
    });
  }

  async #publishBundle(
    root: Parameters<PublicationCapability['commit']>[0]['root'],
    message: string,
    request: AppendPatchRequest,
  ): Promise<Awaited<ReturnType<PublicationCapability['commit']>>> {
    try {
      return await this.#cas.publications.commit({
        root,
        commit: {
          message,
          parents: request.parent === null ? [] : [request.parent],
        },
        ref: { name: request.targetRef, expected: request.expectedHead },
      });
    } catch (error) {
      if (readGitCasErrorCode(error) !== 'PUBLICATION_CONFLICT') {
        throw error;
      }
      throw new PatchPublicationConflictError(
        error instanceof Error ? error : undefined,
      );
    }
  }

  override async readPatch(message: PatchCommitMessage): Promise<Patch> {
    this.#requireReadableStorage(message);
    const handle = message.patchHandle;
    const bytes = await collectAsyncIterable(this.#assetStorage.open(handle));
    return hydrateDecodedPatch(this.#codec.decode(bytes));
  }

  override scanPatchRange(
    writerId: string,
    fromSha: string | null,
    toSha: string,
  ): WarpStream<PatchEntry> {
    const adapter = this;
    return WarpStream.from((async function* (): AsyncGenerator<PatchEntry> {
      const stack: Array<{ sha: string; message: PatchCommitMessage }> = [];
      let current: string | null = toSha;
      while (current !== null && current !== fromSha) {
        const node = await adapter.#commitReader.getNodeInfo(current);
        if (adapter.#commitMessageCodec.detectKind(node.message) !== 'patch') {
          break;
        }
        stack.push({ sha: current, message: adapter.#commitMessageCodec.decodePatch(node.message) });
        current = node.parents[0] ?? null;
      }
      if (fromSha !== null && current !== fromSha) {
        throw new SyncError(
          `Divergence detected: ${toSha} does not descend from ${fromSha} for writer ${writerId}`,
          { code: 'E_SYNC_DIVERGENCE', context: { writerId, fromSha, toSha } },
        );
      }
      for (let index = stack.length - 1; index >= 0; index--) {
        const entry = stack[index];
        if (entry !== undefined) {
          yield new PatchEntry({ patch: await adapter.readPatch(entry.message), sha: entry.sha });
        }
      }
    })());
  }

  #requireReadableStorage(message: PatchCommitMessage): void {
    if (message.storage.strategy === 'git-cas-asset') {
      return;
    }
    if (this.#compatibilityPolicy.legacyPatchStorageReads) {
      return;
    }
    throw new WarpError(
      `Legacy patch storage reads require the substrate migration compatibility policy: ${message.storage.strategy}`,
      'E_LEGACY_SUBSTRATE_DISABLED',
    );
  }
}

function patchBundleMembers(
  patch: AssetHandle,
  attachments: readonly AssetHandle[],
): WarpStream<[string, string]> {
  const members: Array<[string, string]> = [];
  const unique = [...new Set(attachments.map((handle) => handle.toString()))].sort();
  for (let index = 0; index < unique.length; index++) {
    const handle = unique[index];
    if (handle !== undefined) {
      members.push([`attachments/${String(index).padStart(8, '0')}`, handle]);
    }
  }
  members.push(['patch', patch.toString()]);
  return WarpStream.from(members);
}
