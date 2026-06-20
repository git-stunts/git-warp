import PatchJournalPort, { type ReadPatchOptions } from '../../ports/PatchJournalPort.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import WarpStream from '../../domain/stream/WarpStream.ts';
import PatchEntry from '../../domain/artifacts/PatchEntry.ts';
import { hydrateDecodedPatch } from '../../domain/services/PatchHydrator.ts';
import SyncError from '../../domain/errors/SyncError.ts';
import EncryptionError from '../../domain/errors/EncryptionError.ts';
import type Patch from '../../domain/types/Patch.ts';
import type BlobStoragePort from '../../ports/BlobStoragePort.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import {
  DEFAULT_COMMIT_MESSAGE_CODEC,
} from './TrailerCommitMessageCodecAdapter.ts';
import {
  LEGACY_EXTERNAL_PATCH_STORAGE,
  LEGACY_GIT_BLOB_PATCH_STORAGE,
  type PatchStorageRoute,
  type default as CommitMessageCodecPort,
} from '../../ports/CommitMessageCodecPort.ts';
import {
  CURRENT_SUBSTRATE_ONLY_POLICY,
  type SubstrateCompatibilityPolicyValue,
} from './SubstrateCompatibilityPolicy.ts';

interface BlobPort {
  readBlob(oid: string): Promise<Uint8Array>;
  writeBlob(content: Uint8Array | string): Promise<string>;
}

interface CommitPort {
  getNodeInfo(sha: string): Promise<{ sha: string; message: string; author: string; date: string; parents: string[] }>;
}

/**
 * CBOR-backed implementation of PatchJournalPort.
 *
 * Owns the codec and raw blob persistence. Domain services pass Patch
 * objects in and get Patch objects back — no bytes leak across the
 * port boundary.
 *
 * Supports both plain Git blob storage (BlobPort) and encrypted external
 * storage (BlobStoragePort) via the optional `patchBlobStorage` parameter.
 */
export class CborPatchJournalAdapter extends PatchJournalPort {
  private readonly _codec: CodecPort;
  private readonly _blobPort: BlobPort;
  private readonly _commitPort: CommitPort | null;
  private readonly _blobStorage: BlobStoragePort | null;
  private readonly _legacyPatchBlobStorage: BlobStoragePort | null;
  private readonly _writeStorage: PatchStorageRoute;
  private readonly _commitMessageCodec: CommitMessageCodecPort;
  private readonly _compatibilityPolicy: SubstrateCompatibilityPolicyValue;

  constructor({ codec, blobPort, commitPort, patchBlobStorage, blobStorage, legacyPatchBlobStorage, writeStorage, commitMessageCodec, compatibilityPolicy }: {
    codec: CodecPort;
    blobPort: BlobPort;
    commitPort?: CommitPort;
    patchBlobStorage?: BlobStoragePort | null;
    blobStorage?: BlobStoragePort | null;
    legacyPatchBlobStorage?: BlobStoragePort | null;
    writeStorage?: PatchStorageRoute;
    commitMessageCodec?: CommitMessageCodecPort;
    compatibilityPolicy?: SubstrateCompatibilityPolicyValue;
  }) {
    super();
    if (codec === null || codec === undefined) {
      throw new WarpError('CborPatchJournalAdapter requires a codec', 'E_INVALID_DEPENDENCY');
    }
    if (blobPort === null || blobPort === undefined) {
      throw new WarpError('CborPatchJournalAdapter requires a blobPort', 'E_INVALID_DEPENDENCY');
    }
    this._codec = codec;
    this._blobPort = blobPort;
    this._commitPort = commitPort ?? null;
    this._blobStorage = blobStorage ?? null;
    this._legacyPatchBlobStorage = legacyPatchBlobStorage ?? patchBlobStorage ?? null;
    this._writeStorage = writeStorage ?? (patchBlobStorage !== null && patchBlobStorage !== undefined
      ? LEGACY_EXTERNAL_PATCH_STORAGE
      : LEGACY_GIT_BLOB_PATCH_STORAGE);
    this._commitMessageCodec = commitMessageCodec ?? DEFAULT_COMMIT_MESSAGE_CODEC;
    this._compatibilityPolicy = compatibilityPolicy ?? CURRENT_SUBSTRATE_ONLY_POLICY;
  }

  override async writePatch(patch: Patch): Promise<string> {
    const bytes = this._codec.encode(patch);
    if (this._writeStorage.strategy === 'git-cas') {
      if (this._blobStorage === null) {
        throw new WarpError('CborPatchJournalAdapter requires blobStorage for git-cas patch writes', 'E_INVALID_DEPENDENCY');
      }
      return await this._blobStorage.store(bytes, {
        slug: `patch-${patch.writer}-${patch.lamport}`,
      });
    }
    if (this._writeStorage.strategy === 'legacy-external-storage') {
      if (this._legacyPatchBlobStorage === null) {
        throw new WarpError('CborPatchJournalAdapter requires legacyPatchBlobStorage for external patch writes', 'E_INVALID_DEPENDENCY');
      }
      return await this._legacyPatchBlobStorage.store(bytes);
    }
    return await this._blobPort.writeBlob(bytes);
  }

  override async readPatch(
    patchOid: string,
    { storage, encrypted = false }: ReadPatchOptions = {},
  ): Promise<Patch> {
    const resolvedStorage = storage ?? (encrypted ? LEGACY_EXTERNAL_PATCH_STORAGE : this._writeStorage);
    this._requireReadableStorage(resolvedStorage);
    let bytes: Uint8Array;
    if (resolvedStorage.strategy === 'git-cas') {
      if (this._blobStorage === null) {
        throw new EncryptionError(
          `Patch ${patchOid} is stored via git-cas but no blobStorage is configured`,
        );
      }
      bytes = await this._blobStorage.retrieve(patchOid);
    } else if (resolvedStorage.strategy === 'legacy-external-storage') {
      if (this._legacyPatchBlobStorage === null) {
        throw new EncryptionError(
          `Patch ${patchOid} is encrypted but no legacy patchBlobStorage is configured`,
        );
      }
      bytes = await this._legacyPatchBlobStorage.retrieve(patchOid);
    } else {
      bytes = await this._blobPort.readBlob(patchOid);
    }
    return hydrateDecodedPatch(this._codec.decode(bytes));
  }

  private _requireReadableStorage(storage: PatchStorageRoute): void {
    if (storage.strategy === 'git-cas' || this._isConfiguredWriteRoute(storage)) {
      return;
    }
    if (this._compatibilityPolicy.legacyPatchStorageReads) {
      return;
    }
    throw new WarpError(
      `Legacy patch storage reads require the substrate migration compatibility policy: ${storage.strategy}`,
      'E_LEGACY_SUBSTRATE_DISABLED',
    );
  }

  private _isConfiguredWriteRoute(storage: PatchStorageRoute): boolean {
    return this._writeStorage.strategy === storage.strategy && this._blobStorage === null;
  }

  override get writeStorage(): PatchStorageRoute {
    return this._writeStorage;
  }

  /**
   * Scans patches in a writer's chain between two SHAs, yielding
   * PatchEntry instances in chronological order (oldest first).
   */
  scanPatchRange(writerId: string, fromSha: string | null, toSha: string): WarpStream<PatchEntry> {
    const adapter = this;
    return WarpStream.from(
      (async function* (): AsyncGenerator<PatchEntry> {
        if (adapter._commitPort === null) {
          throw new SyncError('scanPatchRange requires commitPort on the adapter', {
            code: 'E_MISSING_COMMIT_PORT',
            context: { writerId },
          });
        }
        const commitPort = adapter._commitPort;

        const stack: Array<{ sha: string; patchOid: string; storage: PatchStorageRoute }> = [];
        let cur: string | null = toSha;

        while (cur !== null && cur !== fromSha) {
          const nodeInfo = await commitPort.getNodeInfo(cur);
          const kind = adapter._commitMessageCodec.detectKind(nodeInfo.message);
          if (kind !== 'patch') {
            break;
          }
          const meta = adapter._commitMessageCodec.decodePatch(nodeInfo.message);
          stack.push({ sha: cur, patchOid: meta.patchOid, storage: meta.storage });

          const parent = Array.isArray(nodeInfo.parents) && nodeInfo.parents.length > 0
            ? (nodeInfo.parents[0] ?? null)
            : null;
          cur = parent;
        }

        if (fromSha !== null && fromSha !== undefined && fromSha.length > 0 && cur === null) {
          throw new SyncError(
            `Divergence detected: ${toSha} does not descend from ${fromSha} for writer ${writerId}`,
            { code: 'E_SYNC_DIVERGENCE', context: { writerId, fromSha, toSha } },
          );
        }

        for (let i = stack.length - 1; i >= 0; i--) {
          const entry = stack[i];
          if (entry === undefined) {
            continue;
          }
          const patch = await adapter.readPatch(entry.patchOid, { storage: entry.storage });
          yield new PatchEntry({ patch, sha: entry.sha });
        }
      })(),
    );
  }
}
