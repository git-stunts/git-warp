import { Dot } from '../crdt/Dot.ts';

/**
 * The add dots one atomic write issues, per element (#1039). A remove later
 * in the same write observes them too, so removing an element the write
 * itself added removes that add, as it does for content and property checks.
 */
export default class InWriteAddDots {
  readonly #dots = new Map<string, string[]>();

  /** Records that this write added `element` with `dot`. */
  record(element: string, dot: Dot): void {
    this.#dots.set(element, [...this.of(element), Dot.encode(dot)]);
  }

  /** The encoded dots this write added `element` with, in issue order. */
  of(element: string): readonly string[] {
    return this.#dots.get(element) ?? [];
  }
}
