import { canonicalStringify } from '../../utils/canonicalStringify.ts';
import { compareStrings } from '../../utils/StringComparison.ts';

/** Stable causal coordinate for one materialized graph frontier. */
export function graphFrontierCoordinateRef(
  worldline: string,
  frontier: ReadonlyMap<string, string>,
  checkpointSha?: string
): string {
  const frontierEntries = [...frontier]
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([writerId, patchSha]) => ({ writerId, patchSha }));
  const coordinate =
    checkpointSha === undefined
      ? { worldline, frontier: frontierEntries }
      : { worldline, checkpointSha, frontier: frontierEntries };
  return `warp:graph-coordinate:${canonicalStringify(coordinate)}`;
}

/** Explicitly records that no bounded graph basis was available. */
export function missingBoundedBasisCoordinateRef(worldline: string): string {
  return missingBasisCoordinateRef(worldline, 'missing-bounded-basis');
}

/** Preserves the established guard-read coordinate when no checkpoint exists. */
export function missingCheckpointCoordinateRef(worldline: string): string {
  return missingBasisCoordinateRef(worldline, 'missing-checkpoint');
}

function missingBasisCoordinateRef(worldline: string, basis: string): string {
  return `warp:graph-coordinate:${canonicalStringify({
    worldline,
    basis,
  })}`;
}

/** Stable coordinate for the exact patch sequence materialized by one strand. */
export function strandPatchCoordinateRef(
  worldline: string,
  strandId: string,
  patchShas: readonly string[]
): string {
  return `warp:strand-coordinate:${canonicalStringify({
    worldline,
    strandId,
    patchShas,
  })}`;
}
