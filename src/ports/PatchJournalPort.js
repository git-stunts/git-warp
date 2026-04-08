import WarpError from '../domain/errors/WarpError.ts';

/**
 * Port for patch journal persistence.
 *
 * Domain-facing port that speaks PatchV2 domain objects. No bytes cross
 * this boundary. The adapter implementation owns the codec and talks to
 * the raw Git ports (BlobPort, BlobStoragePort) internally.
 *
 * This is part of the two-stage persistence boundary (P5 compliance):
 *   Domain Service → PatchJournalPort (domain objects)
 *     → Adapter (codec + raw Git ports) → Git
 *
 * @abstract
 * @see CborPatchJournalAdapter - Reference implementation
 */
export default class PatchJournalPort {
  /**
   * Persists a patch and returns its storage OID.
   *
   * @param {import('../domain/types/WarpTypesV2.ts').PatchV2} _patch - The patch to persist
   * @returns {Promise<string>} The storage OID (opaque handle — domain doesn't care it's a Git blob SHA)
   * @throws {Error} If not implemented by a concrete adapter
   */
  async writePatch(_patch) {
    throw new WarpError('PatchJournalPort.writePatch() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Reads a patch by its storage OID.
   *
   * @param {string} _patchOid - The storage OID returned by writePatch
   * @param {{ encrypted?: boolean }} [_options] - Read options
   * @returns {Promise<import('../domain/types/WarpTypesV2.ts').PatchV2>} The decoded patch
   * @throws {Error} If not implemented by a concrete adapter
   * @throws {Error} If the patch blob is not found
   */
  async readPatch(_patchOid, _options) {
    throw new WarpError('PatchJournalPort.readPatch() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Whether this journal uses external blob storage.
   *
   * When true, readers must use the `encrypted` flag in the commit
   * message trailer to retrieve blobs via BlobStoragePort rather than
   * reading them directly from Git.
   *
   * @returns {boolean}
   */
  get usesExternalStorage() {
    return false;
  }

  /**
   * Scans patches in a writer's chain between two SHAs, yielding
   * PatchEntry instances in chronological order (oldest first).
   *
   * This is the unbounded streaming alternative to the legacy
   * loadPatchRange() which returns a whole array.
   *
   * @param {string} _writerId - The writer whose chain to scan
   * @param {string|null} _fromSha - Start SHA (exclusive), null for all
   * @param {string} _toSha - End SHA (inclusive)
   * @returns {import('../domain/stream/WarpStream.js').default<import('../domain/artifacts/PatchEntry.js').default>}
   * @throws {Error} If not implemented by a concrete adapter
   */
  scanPatchRange(_writerId, _fromSha, _toSha) {
    throw new WarpError('PatchJournalPort.scanPatchRange() not implemented', 'E_NOT_IMPLEMENTED');
  }
}
