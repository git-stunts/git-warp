import type Patch from '../types/Patch.ts';

/**
 * Collects patches for a given frontier.
 *
 * Used by MaterializeController to gather the set of patches
 * that must be replayed during materialization. Replaces the
 * direct `_host._collectPatches()` coupling.
 */
export default abstract class PatchCollector {
  abstract collectForFrontier(
    _frontier: Map<string, string>,
    _ceiling: number | null,
  ): Promise<Array<{ patch: Patch; sha: string }>>;
}
