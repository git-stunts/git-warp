import WarpError from '../errors/WarpError.ts';
import Patch from '../types/Patch.ts';

/**
 * A patch entry from a patch scan stream.
 *
 * Pairs a decoded Patch with its commit SHA. This is the semantic
 * unit yielded by PatchJournalPort.scanPatchRange().
 */
export default class PatchEntry {
  readonly patch: Patch;
  readonly sha: string;

  constructor({ patch, sha }: { patch: Patch; sha: string }) {
    if (!(patch instanceof Patch)) {
      throw new WarpError('PatchEntry requires a patch', 'E_INVALID_ENTRY');
    }
    if (typeof sha !== 'string' || sha.length === 0) {
      throw new WarpError('PatchEntry requires a non-empty sha', 'E_INVALID_ENTRY');
    }
    this.patch = patch;
    this.sha = sha;
    Object.freeze(this);
  }
}
