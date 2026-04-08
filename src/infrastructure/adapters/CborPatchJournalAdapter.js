import PatchJournalPort from '../../ports/PatchJournalPort.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import WarpStream from '../../domain/stream/WarpStream.js';
import PatchEntry from '../../domain/artifacts/PatchEntry.js';
import { decodePatchMessage, detectMessageKind } from '../../domain/services/codec/WarpMessageCodec.js';
import SyncError from '../../domain/errors/SyncError.ts';
import EncryptionError from '../../domain/errors/EncryptionError.ts';
import VersionVector from '../../domain/crdt/VersionVector.js';

/**
 * CBOR-backed implementation of PatchJournalPort.
 *
 * Owns the codec and raw blob persistence. Domain services pass Patch
 * objects in and get Patch objects back — no bytes leak across the
 * port boundary.
 *
 * Supports both plain Git blob storage (BlobPort) and encrypted external
 * storage (BlobStoragePort) via the optional `patchBlobStorage` parameter.
 *
 * @extends PatchJournalPort
 */
export class CborPatchJournalAdapter extends PatchJournalPort {
  /**
   * Creates a new CborPatchJournalAdapter.
   *
   * @param {{
   *   codec: { encode(value: unknown): Uint8Array, decode(bytes: Uint8Array): unknown },
   *   blobPort: { readBlob(oid: string): Promise<Uint8Array>, writeBlob(content: Uint8Array | string): Promise<string> },
   *   commitPort?: { getNodeInfo(sha: string): Promise<{sha: string, message: string, author: string, date: string, parents: string[]}> },
   *   patchBlobStorage?: import('../../ports/BlobStoragePort.ts').default | null,
   * }} options
   */
  constructor({ codec, blobPort, commitPort, patchBlobStorage }) {
    super();
    if (codec === null || codec === undefined) {
      throw new WarpError('CborPatchJournalAdapter requires a codec', 'E_INVALID_DEPENDENCY');
    }
    if (blobPort === null || blobPort === undefined) {
      throw new WarpError('CborPatchJournalAdapter requires a blobPort', 'E_INVALID_DEPENDENCY');
    }
    /** @type {{ encode(value: unknown): Uint8Array, decode(bytes: Uint8Array): unknown }} */
    this._codec = codec;
    /** @type {{ readBlob(oid: string): Promise<Uint8Array>, writeBlob(content: Uint8Array | string): Promise<string> }} */
    this._blobPort = blobPort;
    /** @type {{ getNodeInfo(sha: string): Promise<{sha: string, message: string, author: string, date: string, parents: string[]}> } | null} */
    this._commitPort = commitPort ?? null;
    /** @type {import('../../ports/BlobStoragePort.ts').default | null} */
    this._patchBlobStorage = patchBlobStorage ?? null;
  }

  /**
   * Encodes a Patch to CBOR and persists it as a blob.
   *
   * @param {import('../../domain/types/Patch.ts').default} patch
   * @returns {Promise<string>} The blob OID
   */
  async writePatch(patch) {
    const bytes = this._codec.encode(patch);
    if (this._patchBlobStorage) {
      return await this._patchBlobStorage.store(bytes);
    }
    return await this._blobPort.writeBlob(bytes);
  }

  /**
   * Reads a blob by OID and decodes the CBOR bytes to a Patch.
   *
   * @param {string} patchOid
   * @param {{ encrypted?: boolean }} [options]
   * @returns {Promise<import('../../domain/types/Patch.ts').default>}
   */
  async readPatch(patchOid, { encrypted = false } = {}) {
    /** @type {Uint8Array} */
    let bytes;
    if (encrypted && this._patchBlobStorage) {
      bytes = await this._patchBlobStorage.retrieve(patchOid);
    } else if (encrypted) {
      throw new EncryptionError(
        `Patch ${patchOid} is encrypted but no patchBlobStorage is configured`,
      );
    } else {
      bytes = await this._blobPort.readBlob(patchOid);
    }
    return /** @type {import('../../domain/types/Patch.ts').default} */ (
      this._codec.decode(bytes)
    );
  }

  /**
   * Whether this journal uses external blob storage.
   *
   * @returns {boolean}
   */
  get usesExternalStorage() {
    return this._patchBlobStorage !== null;
  }

  /**
   * Scans patches in a writer's chain between two SHAs, yielding
   * PatchEntry instances in chronological order (oldest first).
   *
   * Walks the commit DAG backwards from toSha to fromSha, decodes
   * each patch, and yields PatchEntry. The walk is streamed — patches
   * are yielded as they're decoded, not accumulated into an array.
   *
   * @param {string} writerId - The writer whose chain to scan
   * @param {string|null} fromSha - Start SHA (exclusive), null for all
   * @param {string} toSha - End SHA (inclusive)
   * @returns {WarpStream<PatchEntry>}
   */
  scanPatchRange(writerId, fromSha, toSha) {
    const adapter = this;
    return WarpStream.from(
      /** Walks commit chain and yields PatchEntry instances. @returns {AsyncGenerator<PatchEntry>} */
      (async function* () {
        if (adapter._commitPort === null) {
          throw new SyncError('scanPatchRange requires commitPort on the adapter', {
            code: 'E_MISSING_COMMIT_PORT',
            context: { writerId },
          });
        }
        const commitPort = adapter._commitPort;

        // Walk backwards, collect into stack for chronological order
        /** @type {Array<{sha: string, patchOid: string, encrypted: boolean}>} */
        const stack = [];
        /** @type {string | null} */
        let cur = toSha;

        while (cur !== null && cur !== fromSha) {
          const nodeInfo = await commitPort.getNodeInfo(cur);
          const kind = detectMessageKind(nodeInfo.message);
          if (kind !== 'patch') {
            break;
          }
          const meta = decodePatchMessage(nodeInfo.message);
          stack.push({ sha: cur, patchOid: meta.patchOid, encrypted: meta.encrypted });

          /** @type {string | null} */
          const parent = (Array.isArray(nodeInfo.parents) && nodeInfo.parents.length > 0)
            ? /** @type {string} */ (nodeInfo.parents[0])
            : null;
          cur = parent;
        }

        // Divergence check
        if (fromSha !== null && fromSha !== undefined && fromSha.length > 0 && cur === null) {
          throw new SyncError(
            `Divergence detected: ${toSha} does not descend from ${fromSha} for writer ${writerId}`,
            { code: 'E_SYNC_DIVERGENCE', context: { writerId, fromSha, toSha } },
          );
        }

        // Yield in chronological order (oldest first)
        for (let i = stack.length - 1; i >= 0; i--) {
          const { sha, patchOid, encrypted } = /** @type {{ sha: string, patchOid: string, encrypted: boolean }} */ (stack[i]);
          const raw = await adapter.readPatch(patchOid, { encrypted });
          const patch = _normalizePatch(raw);
          yield new PatchEntry({ patch, sha });
        }
      })(),
    );
  }
}

/**
 * Normalizes a decoded patch (converts context from plain object to Map).
 *
 * @param {import('../../domain/types/Patch.ts').default} patch
 * @returns {import('../../domain/types/Patch.ts').default}
 */
function _normalizePatch(patch) {
  if (patch.context !== null && patch.context !== undefined && !(patch.context instanceof Map)) {
    const ctx = patch.context;
    if (ctx instanceof VersionVector) {
      return patch;
    }
    /** @type {Record<string, number>} */
    const record = Object.fromEntries(Object.entries(/** @type {Record<string, number>} */ (ctx)));
    return { ...patch, context: record };
  }
  return patch;
}
