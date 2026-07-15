import type { WarpStateCoordinate } from '../../ports/WarpStateCachePort.ts';
import type { PatchDiff } from '../types/PatchDiff.ts';

/** Metadata that keeps an installed materialized state tied to its causal basis. */
export type MaterializedStateUpdateOptions = Readonly<{
  diff?: PatchDiff | null;
  coordinate?: WarpStateCoordinate | null;
}>;
