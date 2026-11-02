import type ConePatchFeedPort from '../../../ports/ConePatchFeedPort.ts';
import ConeBasis from './ConeBasis.ts';
import ConeBasisHead from './ConeBasisHead.ts';
import ConeBasisScope from './ConeBasisScope.ts';

/** A lane's own basis: every writer chain of the lane, folded to its tip; it starts empty. */
export default class LaneConeScope extends ConeBasisScope {
  readonly head: ConeBasisHead;

  constructor(lane: string) {
    super();
    this.head = ConeBasisHead.forLane(lane);
    Object.freeze(this);
  }

  override async tips(feed: ConePatchFeedPort): Promise<ReadonlyMap<string, string>> {
    return await feed.writerTips(this.head.lane);
  }

  override seed(): Promise<ConeBasis> {
    return Promise.resolve(ConeBasis.empty());
  }
}
