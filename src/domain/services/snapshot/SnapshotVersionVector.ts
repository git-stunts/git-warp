import { type Dot } from '../../crdt/Dot.ts';
import type VersionVector from '../../crdt/VersionVector.ts';

/**
 * Read-side version-vector view for public immutable snapshots.
 */
export default class SnapshotVersionVector {
  readonly #entries: Map<string, number>;

  constructor(source: VersionVector) {
    this.#entries = new Map(source.entries());
    Object.freeze(this);
  }

  get(writerId: string): number | undefined {
    return this.#entries.get(writerId);
  }

  has(writerId: string): boolean {
    return this.#entries.has(writerId);
  }

  get size(): number {
    return this.#entries.size;
  }

  [Symbol.iterator](): IterableIterator<[string, number]> {
    return this.#entries[Symbol.iterator]();
  }

  keys(): IterableIterator<string> {
    return this.#entries.keys();
  }

  values(): IterableIterator<number> {
    return this.#entries.values();
  }

  entries(): IterableIterator<[string, number]> {
    return this.#entries.entries();
  }

  descends(other: SnapshotVersionVector): boolean {
    for (const [writerId, counter] of other) {
      const thisCounter = this.#entries.get(writerId) ?? 0;
      if (thisCounter < counter) {
        return false;
      }
    }
    return true;
  }

  contains(dot: Dot): boolean {
    const counter = this.#entries.get(dot.writerId) ?? 0;
    return dot.counter <= counter;
  }

  equals(other: SnapshotVersionVector): boolean {
    if (this.#entries.size !== other.size) {
      return false;
    }
    for (const [writerId, counter] of this.#entries) {
      if (other.get(writerId) !== counter) {
        return false;
      }
    }
    return true;
  }
}
