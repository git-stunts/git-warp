import type ConeWriterDivergedObstruction from '../domain/services/cone/ConeWriterDivergedObstruction.ts';
import type ConeWriterPatches from '../domain/services/cone/ConeWriterPatches.ts';

/**
 * Supplies the patches a cone basis has not folded yet (#1039).
 *
 * An implementation reads each writer's new range with one bulk history
 * read and decodes each patch once; it never walks history it does not
 * return.
 */
export default abstract class ConePatchFeedPort {
  /** Every writer chain tip of the lane, by writer id. */
  abstract writerTips(_lane: string): Promise<ReadonlyMap<string, string>>;

  /**
   * The patches of `writerId` after `fromSha` (null: from the chain start)
   * up to and including `toSha`, oldest first, or the divergence that
   * stops them when `toSha` does not descend from `fromSha`.
   */
  abstract patchesAfter(
    _lane: string,
    _writerId: string,
    _range: { readonly fromSha: string | null; readonly toSha: string },
  ): Promise<ConeWriterPatches | ConeWriterDivergedObstruction>;
}
