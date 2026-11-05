import type ConeBasis from '../cone/ConeBasis.ts';

/**
 * What a blind write can honestly claim its writer observed (#1051): what this clone
 * held when this Warp began writing. A writer's own chain always counts as observed, and
 * the contract makes the writer the observer, so another writer's patch is not seen
 * merely because it shares a Warp. The published cone head cannot say this, since any
 * fold moves it without anyone having read what it folded. Nothing else adds to this
 * until reads can (#1052), so a race stays plural until then.
 */
export default class ConeWriteKnowledge {
  #start: ConeBasis | null = null;

  /** The basis a blind write observed. The first write on this Warp fixes it for every writer. */
  seen(from: ConeBasis): ConeBasis {
    this.#start ??= from;
    return this.#start;
  }
}
