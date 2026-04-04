import PatchJournalPort from '../../ports/PatchJournalPort.js';

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
   *   patchBlobStorage?: import('../../ports/BlobStoragePort.js').default | null,
   * }} options
   */
  constructor({ codec, blobPort, patchBlobStorage }) {
    super();
    /** @type {import('../../ports/CodecPort.js').default} */
    this._codec = codec;
    /** @type {import('../../ports/BlobPort.js').default} */
    this._blobPort = blobPort;
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
}
