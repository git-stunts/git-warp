import WarpError from '../errors/WarpError.ts';

/**
 * A patch entry from a patch scan stream.
 *
 * Pairs a decoded PatchV2 with its commit SHA. This is the semantic
 * unit yielded by PatchJournalPort.scanPatchRange().
 */
export default class PatchEntry {
  /**
   * Creates a PatchEntry.
   *
   * @param {{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }} fields
   */
  constructor({ patch, sha }) {
    if (patch === null || patch === undefined) {
      throw new WarpError('PatchEntry requires a patch', 'E_INVALID_ENTRY');
    }
    if (typeof sha !== 'string' || sha.length === 0) {
      throw new WarpError('PatchEntry requires a non-empty sha', 'E_INVALID_ENTRY');
    }
    /** @type {import('../types/WarpTypesV2.js').PatchV2} */
    this.patch = patch;
    /** @type {string} */
    this.sha = sha;
    Object.freeze(this);
  }
}
