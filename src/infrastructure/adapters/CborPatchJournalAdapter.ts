import PatchJournalPort, { type ReadPatchOptions } from '../../ports/PatchJournalPort.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import WarpStream from '../../domain/stream/WarpStream.ts';
import PatchEntry from '../../domain/artifacts/PatchEntry.ts';
import { decodePatchMessage, detectMessageKind } from '../../domain/services/codec/WarpMessageCodec.ts';
import { hydrateDecodedPatch } from '../../domain/services/PatchHydrator.ts';
import SyncError from '../../domain/errors/SyncError.ts';
import EncryptionError from '../../domain/errors/EncryptionError.ts';
import type Patch from '../../domain/types/Patch.ts';
import type BlobStoragePort from '../../ports/BlobStoragePort.ts';

interface Codec {
  encode(value: unknown): Uint8Array;
  decode(bytes: Uint8Array): unknown;
}

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
  private readonly _codec: Codec;
  private readonly _blobPort: BlobPort;
  private readonly _commitPort: CommitPort | null;
  private readonly _patchBlobStorage: BlobStoragePort | null;

  constructor({ codec, blobPort, commitPort, patchBlobStorage }: {
    codec: Codec;
    blobPort: BlobPort;
    commitPort?: CommitPort;
    patchBlobStorage?: BlobStoragePort | null;
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
    this._patchBlobStorage = patchBlobStorage ?? null;
  }

  override async writePatch(patch: Patch): Promise<string> {
    const bytes = this._codec.encode(patch);
    if (this._patchBlobStorage) {
      return await this._patchBlobStorage.store(bytes);
    }
    return await this._blobPort.writeBlob(bytes);
  }

  override async readPatch(patchOid: string, { encrypted = false }: ReadPatchOptions = {}): Promise<Patch> {
    let bytes: Uint8Array;
    if (encrypted && this._patchBlobStorage) {
      bytes = await this._patchBlobStorage.retrieve(patchOid);
    } else if (encrypted) {
      throw new EncryptionError(
        `Patch ${patchOid} is encrypted but no patchBlobStorage is configured`,
      );
    } else {
      bytes = await this._blobPort.readBlob(patchOid);
    }
    return hydrateDecodedPatch(this._codec.decode(bytes));
  }

  override get usesExternalStorage(): boolean {
    return this._patchBlobStorage !== null;
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

        const stack: Array<{ sha: string; patchOid: string; encrypted: boolean }> = [];
        let cur: string | null = toSha;

        while (cur !== null && cur !== fromSha) {
          const nodeInfo = await commitPort.getNodeInfo(cur);
          const kind = detectMessageKind(nodeInfo.message);
          if (kind !== 'patch') {
            break;
          }
          const meta = decodePatchMessage(nodeInfo.message);
          stack.push({ sha: cur, patchOid: meta.patchOid, encrypted: meta.encrypted });

          const parent: string | null = (Array.isArray(nodeInfo.parents) && nodeInfo.parents.length > 0)
            ? (nodeInfo.parents[0] as string)
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
          const { sha, patchOid, encrypted } = stack[i] as { sha: string; patchOid: string; encrypted: boolean };
          const patch = await adapter.readPatch(patchOid, { encrypted });
          yield new PatchEntry({ patch, sha });
        }
      })(),
    );
  }
}
