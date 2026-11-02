import ConeLaneBasis from '../../src/domain/services/cone/ConeLaneBasis.ts';
import type { PatchOp } from '../../src/domain/types/ops/unions.ts';
import InMemoryConeRecordStore from './InMemoryConeRecordStore.ts';
import MemoryConeFeed from './MemoryConeFeed.ts';

/**
 * A lane cone basis over in-memory records and chains (#1039). With no
 * chains it is the empty basis, which a blind write never advances; each
 * chain entry appends one patch of that writer.
 */
export function coneLane(
  lane = 'events',
  chains: ReadonlyArray<readonly [string, PatchOp[]]> = [],
): { readonly cone: ConeLaneBasis; readonly feed: MemoryConeFeed; readonly store: InMemoryConeRecordStore } {
  const store = new InMemoryConeRecordStore();
  const feed = new MemoryConeFeed(lane);
  for (const [writer, ops] of chains) {
    feed.append(writer, ops);
  }
  return { cone: ConeLaneBasis.ofLane({ store, feed, lane }), feed, store };
}
