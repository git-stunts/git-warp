import {
  buildConeHeadRef,
  buildConeStrandBaseRef,
  buildConeStrandHeadRef,
} from '../../utils/ConeRefLayout.ts';

/**
 * Where one cone basis of a lane is published (#1039): the lane's own
 * basis, the basis a strand was forked from (pinned for the strand's life),
 * or a strand's basis, which is that base plus the strand's own patches.
 * Every head is clone-local derived state and never transferred.
 */
export default class ConeBasisHead {
  readonly lane: string;
  readonly #ref: string;

  private constructor(lane: string, ref: string) {
    this.lane = lane;
    this.#ref = ref;
    Object.freeze(this);
  }

  /** The lane's basis: every writer chain, folded to its tip. */
  static forLane(lane: string): ConeBasisHead {
    return new ConeBasisHead(lane, buildConeHeadRef(lane));
  }

  /** The lane basis a strand was forked from, pinned at the strand's base frontier. */
  static forStrandBase(lane: string, strandId: string): ConeBasisHead {
    return new ConeBasisHead(lane, buildConeStrandBaseRef(lane, strandId));
  }

  /** A strand's basis: its pinned base with the strand's own patches folded on top. */
  static forStrand(lane: string, strandId: string): ConeBasisHead {
    return new ConeBasisHead(lane, buildConeStrandHeadRef(lane, strandId));
  }

  /** The ref this head is published under. */
  ref(): string {
    return this.#ref;
  }

  equals(other: ConeBasisHead): boolean {
    return other.#ref === this.#ref;
  }
}
