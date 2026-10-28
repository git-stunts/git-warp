import type PatchEntry from '../../artifacts/PatchEntry.ts';
import type ObservedWriteFrontier from '../../types/ObservedWriteFrontier.ts';
import type { EventId } from '../../utils/EventId.ts';
import { compareStrings } from '../../utils/StringComparison.ts';

/**
 * What one patch causally observed (#1039, conflict visibility): per writer
 * chain, the highest Lamport clock of that chain's events the patch saw.
 *
 * A Lane patch records the writer heads it observed (`observedFrontier`); a
 * chain's events are ordered by Lamport clock, so the patch observed an event
 * of chain `w` at clock `l` exactly when it observed `w` at `l` or later.
 * Every patch also observed its own chain's earlier events. A patch without
 * a recorded frontier (a legacy patch, or a deprecated facade write) observed
 * only its own chain as far as anyone can prove, and is marked uncausal so a
 * plurality it takes part in is reported as underdetermined, never guessed.
 */
export default class ConeObservation {
  /** Writer chain to the highest observed Lamport clock, inclusive. */
  readonly #observed: ReadonlyMap<string, number>;
  /** Whether the patch carried causal evidence of what it observed. */
  readonly causal: boolean;

  private constructor(observed: ReadonlyMap<string, number>, causal: boolean) {
    this.#observed = observed;
    this.causal = causal;
    Object.freeze(this);
  }

  /**
   * What `entry` observed: its recorded frontier, its own chain, and
   * `implicit`, the chains a strand patch observed by being written on its
   * strand's pinned base (empty for any other patch).
   */
  static ofPatch(entry: PatchEntry, implicit: ReadonlyMap<string, number>): ConeObservation {
    const { observedFrontier, writer, lamport } = entry.patch;
    const observed = new Map(implicit);
    ConeObservation.#merge(observed, writer, lamport - 1);
    for (const head of observedFrontier?.heads ?? []) {
      ConeObservation.#merge(observed, head.writerId, head.lamport);
    }
    return new ConeObservation(observed, observedFrontier !== undefined || implicit.size > 0);
  }

  /** What a write recording `frontier` observes, written by `writer` at clock `lamport`. */
  static ofWrite(frontier: ObservedWriteFrontier, writer: string, lamport: number): ConeObservation {
    const observed = new Map<string, number>();
    ConeObservation.#merge(observed, writer, lamport - 1);
    for (const head of frontier.heads) {
      ConeObservation.#merge(observed, head.writerId, head.lamport);
    }
    return new ConeObservation(observed, true);
  }

  /** Whether the patch observed `event`. */
  observes(event: EventId): boolean {
    return this.observesClock(event.writerId, event.lamport);
  }

  /** Whether the patch observed chain `writerId` at Lamport clock `lamport`. */
  observesClock(writerId: string, lamport: number): boolean {
    return (this.#observed.get(writerId) ?? -1) >= lamport;
  }

  /** Per chain, the highest clock either observation saw. */
  joined(other: ReadonlyMap<string, number>): Map<string, number> {
    const joined = new Map(other);
    for (const [writerId, lamport] of this.#observed) {
      ConeObservation.#merge(joined, writerId, lamport);
    }
    return new Map([...joined].sort(([left], [right]) => compareStrings(left, right)));
  }

  static #merge(observed: Map<string, number>, writerId: string, lamport: number): void {
    if (lamport >= 0 && lamport > (observed.get(writerId) ?? -1)) {
      observed.set(writerId, lamport);
    }
  }
}
