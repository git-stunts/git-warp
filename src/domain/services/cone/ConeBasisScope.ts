import type ConePatchFeedPort from '../../../ports/ConePatchFeedPort.ts';
import type ConeBasis from './ConeBasis.ts';
import type ConeBasisHead from './ConeBasisHead.ts';
import type ConeObstruction from './ConeObstruction.ts';

/**
 * What one cone ingest advances (#1039): the head its basis is published
 * under, the writer tips that basis folds up to, and the basis it starts
 * from while the head does not exist yet.
 */
export default abstract class ConeBasisScope {
  abstract readonly head: ConeBasisHead;

  /** Per writer, the patch the basis must fold up to. */
  abstract tips(feed: ConePatchFeedPort): Promise<ReadonlyMap<string, string>>;

  /** The basis to start from when nothing is published under the head yet. */
  abstract seed(): Promise<ConeBasis | ConeObstruction>;
}
