import WarpError from './errors/WarpError.ts';
import Patch from './types/Patch.ts';

/** One validated immutable patch retained by a persisted draft. */
export default class WarpDraftPatchEntry {
  readonly patch: Patch;
  readonly sha: string;

  constructor(fields: { readonly patch: Patch; readonly sha: string }) {
    if (!(fields?.patch instanceof Patch)) {
      throw new WarpError(
        'WarpDraftPatchEntry patch must be a Patch',
        'E_WARP_WORLDLINE_DRAFT_PATCH',
      );
    }
    if (typeof fields.sha !== 'string' || fields.sha.trim().length === 0) {
      throw new WarpError(
        'WarpDraftPatchEntry sha must be non-empty',
        'E_WARP_WORLDLINE_DRAFT_PATCH',
      );
    }
    this.patch = fields.patch;
    this.sha = fields.sha;
    Object.freeze(this);
  }
}
