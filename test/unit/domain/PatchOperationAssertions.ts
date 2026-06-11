import type Patch from '../../../src/domain/types/Patch.ts';
import type { PatchOp } from '../../../src/domain/types/ops/unions.ts';

/**
 * Returns a patch operation or fails the test fixture deterministically.
 */
export function requirePatchOp(patch: Patch, index: number): PatchOp {
  const op = patch.ops[index];
  if (op === undefined) {
    throw new Error(`Expected patch op at index ${index}`);
  }
  return op;
}
