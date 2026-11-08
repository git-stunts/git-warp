import PatchError from './PatchError.ts';
import type { WarpErrorOptions } from './WarpError.ts';

/**
 * A remove lists an observed dot that the same patch adds to a different
 * element. The patch is self-contradictory, so it is refused at the patch
 * boundary (decode and sync ingress). Code: `E_PATCH_CROSS_OWNER_REMOVE`.
 */
export default class CrossOwnerRemoveError extends PatchError {
  static readonly CODE = 'E_PATCH_CROSS_OWNER_REMOVE';

  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, { ...options, code: CrossOwnerRemoveError.CODE });
  }
}
