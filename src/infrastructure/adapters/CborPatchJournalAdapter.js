import PatchJournalPort from '../../ports/PatchJournalPort.js';
import WarpStream from '../../domain/stream/WarpStream.js';
import PatchEntry from '../../domain/artifacts/PatchEntry.js';
import { decodePatchMessage, detectMessageKind } from '../../domain/services/codec/WarpMessageCodec.js';
import SyncError from '../../domain/errors/SyncError.js';
import VersionVector from '../../domain/crdt/VersionVector.js';

/**
 * CBOR-backed implementation of PatchJournalPort.
 *
 * Owns the codec and raw blob persistence. Domain services pass PatchV2
 * objects in and get PatchV2 objects back — no bytes leak across the
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
   *   codec: import('../../ports/CodecPort.js').default,
   *   blobPort: import('../../ports/BlobPort.js').default,
   *   commitPort?: import('../../ports/CommitPort.js').default,
   *   patchBlobStorage?: import('../../ports/BlobStoragePort.js').default | null,
   * }} options
   */
  constructor({ codec, blobPort, commitPort, patchBlobStorage }) {
    super();
    /** @type {import('../../ports/CodecPort.js').default} */
    this._codec = codec;
    /** @type {import('../../ports/BlobPort.js').default} */
    this._blobPort = blobPort;
    /** @type {import('../../ports/CommitPort.js').default | null} */
    this._commitPort = commitPort ?? null;
    /** @type {import('../../ports/BlobStoragePort.js').default | null} */
    this._patchBlobStorage = patchBlobStorage ?? null;
  }

  /**
   * Encodes a PatchV2 to CBOR and persists it as a blob.
   *
   * @param {import('../../domain/types/WarpTypesV2.js').PatchV2} patch
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
   * Reads a blob by OID and decodes the CBOR bytes to a PatchV2.
   *
   * @param {string} patchOid
   * @param {{ encrypted?: boolean }} [options]
   * @returns {Promise<import('../../domain/types/WarpTypesV2.js').PatchV2>}
   */
  async readPatch(patchOid, { encrypted = false } = {}) {
    /** @type {Uint8Array} */
    let bytes;
    if (encrypted && this._patchBlobStorage) {
      bytes = await this._patchBlobStorage.retrieve(patchOid);
    } else {
      bytes = await this._blobPort.readBlob(patchOid);
    }
    return /** @type {import('../../domain/types/WarpTypesV2.js').PatchV2} */ (
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
            ? nodeInfo.parents[0]
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
          const { sha, patchOid, encrypted } = stack[i];
          /* eslint-disable @typescript-eslint/no-unsafe-assignment -- PatchV2 types lost in async generator context */
          const raw = await adapter.readPatch(patchOid, { encrypted });
          const patch = _normalizePatch(raw);
          yield new PatchEntry({ patch, sha });
          /* eslint-enable @typescript-eslint/no-unsafe-assignment */
        }
      })(),
    );
  }
}

/**
 * Normalizes a decoded patch (converts context from plain object to Map).
 *
 * @param {import('../../domain/types/WarpTypesV2.js').PatchV2} patch
 * @returns {import('../../domain/types/WarpTypesV2.js').PatchV2}
 */
function _normalizePatch(patch) {
  if (patch.context !== null && patch.context !== undefined && !(patch.context instanceof Map)) {
    const ctx = patch.context;
    if (ctx instanceof VersionVector) {
      return patch;
    }
    /** @type {Map<string, number>} */
    const map = new Map();
    for (const [k, v] of Object.entries(/** @type {Record<string, number>} */ (ctx))) {
      map.set(k, v);
    }
    return { ...patch, context: map };
  }
  return patch;
}
