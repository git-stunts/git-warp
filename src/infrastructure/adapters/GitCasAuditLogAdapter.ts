import type {
  AssetCapability,
  PublicationCapability,
} from '@git-stunts/git-cas';
import AuditError from '../../domain/errors/AuditError.ts';
import AssetHandle from '../../domain/storage/AssetHandle.ts';
import WarpStream from '../../domain/stream/WarpStream.ts';
import { buildAuditPrefix, buildAuditRef } from '../../domain/utils/RefLayout.ts';
import type AssetStoragePort from '../../ports/AssetStoragePort.ts';
import AuditLogPort, {
  type AppendAuditRecordRequest,
  type AuditLogEntry,
  type PublishedAuditRecord,
} from '../../ports/AuditLogPort.ts';
import { adaptGitCasRetentionWitness } from './GitCasRetentionWitnessAdapter.ts';
import {
  CURRENT_SUBSTRATE_ONLY_POLICY,
  type SubstrateCompatibilityPolicyValue,
} from './SubstrateCompatibilityPolicy.ts';

type AuditHistory = {
  readRef(ref: string): Promise<string | null>;
  listRefs(prefix: string): Promise<string[]>;
  getNodeInfo(sha: string): Promise<{
    sha: string;
    message: string;
    parents: string[];
  }>;
  getCommitTree(sha: string): Promise<string>;
  readTreeOids(treeOid: string): Promise<Record<string, string>>;
  readBlob(oid: string): Promise<Uint8Array>;
};

type AuditCas = {
  readonly assets: Pick<AssetCapability, 'put' | 'adopt' | 'open'>;
  readonly publications: Pick<PublicationCapability, 'commit'>;
};

/** git-cas-backed audit receipt publication and legacy-read adapter. */
export default class GitCasAuditLogAdapter extends AuditLogPort {
  readonly #history: AuditHistory;
  readonly #cas: AuditCas;
  readonly #assets: AssetStoragePort;
  readonly #compatibilityPolicy: SubstrateCompatibilityPolicyValue;

  constructor(options: {
    readonly history: AuditHistory;
    readonly cas: AuditCas;
    readonly assets: AssetStoragePort;
    readonly compatibilityPolicy?: SubstrateCompatibilityPolicyValue;
  }) {
    super();
    this.#history = options.history;
    this.#cas = options.cas;
    this.#assets = options.assets;
    this.#compatibilityPolicy = options.compatibilityPolicy ?? CURRENT_SUBSTRATE_ONLY_POLICY;
  }

  override async readHead(graphName: string, writerId: string): Promise<string | null> {
    return await this.#history.readRef(buildAuditRef(graphName, writerId));
  }

  override async listWriterIds(graphName: string): Promise<string[]> {
    const prefix = buildAuditPrefix(graphName);
    const refs = await this.#history.listRefs(prefix);
    return refs
      .filter((ref) => ref.startsWith(prefix))
      .map((ref) => ref.slice(prefix.length))
      .filter((writerId) => writerId.length > 0);
  }

  override async append(request: AppendAuditRecordRequest): Promise<PublishedAuditRecord> {
    const stagedReceipt = await this.#assets.stage(WarpStream.from([request.receipt]), {
      slug: `audit-${request.graphName}-${request.writerId}`,
      filename: 'receipt.cbor',
      mime: 'application/cbor',
      expectedSize: request.receipt.byteLength,
    });
    const publication = await this.#cas.publications.commit({
      root: stagedReceipt.handle.toString(),
      commit: {
        message: request.message,
        parents: request.parent === null ? [] : [request.parent],
      },
      ref: {
        name: buildAuditRef(request.graphName, request.writerId),
        expected: request.expectedHead,
      },
    });
    return Object.freeze({
      sha: publication.commitId,
      stagedReceipt,
      retention: adaptGitCasRetentionWitness(publication.witness.toJSON()),
    });
  }

  override async readEntry(sha: string): Promise<AuditLogEntry> {
    const node = await this.#history.getNodeInfo(sha);
    const treeOid = await this.#history.getCommitTree(sha);
    return Object.freeze({
      sha,
      message: node.message,
      parents: Object.freeze([...node.parents]),
      receipt: await this.#readReceiptRoot(treeOid),
    });
  }

  async #readReceiptRoot(treeOid: string): Promise<Uint8Array> {
    try {
      const staged = await this.#cas.assets.adopt({ treeOid });
      return await collectBytes(
        this.#assets.open(new AssetHandle(staged.handle.toString())),
      );
    } catch (assetError) {
      rethrowUnlessLegacyReceiptTree(assetError);
      return await this.#readLegacyReceiptTree(treeOid, assetError);
    }
  }

  async #readLegacyReceiptTree(treeOid: string, cause: unknown): Promise<Uint8Array> {
    if (!this.#compatibilityPolicy.legacyAuditReceiptTreeReads) {
      throw new AuditError(
        `Legacy audit receipt tree reads require the substrate migration compatibility policy: ${treeOid}`,
        {
          code: 'E_LEGACY_SUBSTRATE_DISABLED',
          context: { treeOid },
        },
      );
    }
    const entries = await this.#history.readTreeOids(treeOid);
    const paths = Object.keys(entries);
    const receiptOid = entries['receipt.cbor'];
    if (paths.length !== 1 || receiptOid === undefined) {
      throw new AuditError(
        `Expected exactly one audit receipt entry in ${treeOid}`,
        {
          code: 'E_AUDIT_RECEIPT_TREE',
          context: {
            treeOid,
            paths,
            cause: cause instanceof Error ? cause.message : String(cause),
          },
        },
      );
    }
    return await this.#history.readBlob(receiptOid);
  }
}

async function collectBytes(source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of source) {
    chunks.push(chunk);
    size += chunk.byteLength;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function rethrowUnlessLegacyReceiptTree(error: unknown): void {
  if (errorCode(error) !== 'MANIFEST_NOT_FOUND') {
    throw error;
  }
}

function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : null;
  }
  return null;
}
