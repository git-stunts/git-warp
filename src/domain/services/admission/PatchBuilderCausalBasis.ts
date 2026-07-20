import PatchError from '../../errors/PatchError.ts';
import type { PatchBuilder } from '../PatchBuilder.ts';

export type PatchBuilderCausalBasis = Readonly<{
  graphName: string;
  writerId: string;
  participantId: string;
  expectedParentSha: string | null;
  evaluationCoordinateRef: string | null;
}>;

const PATCH_BUILDER_CAUSAL_BASES = new WeakMap<PatchBuilder, PatchBuilderCausalBasis>();

export function capturePatchBuilderCausalBasis(
  builder: PatchBuilder,
  basis: PatchBuilderCausalBasis
): void {
  PATCH_BUILDER_CAUSAL_BASES.set(builder, Object.freeze({ ...basis }));
}

export function readPatchBuilderCausalBasis(builder: PatchBuilder): PatchBuilderCausalBasis {
  const basis = PATCH_BUILDER_CAUSAL_BASES.get(builder);
  if (basis === undefined) {
    throw new PatchError('PatchBuilder causal basis is unavailable', {
      code: 'E_PATCH_CAUSAL_BASIS',
    });
  }
  return basis;
}
