import type ORSet from '../../crdt/ORSet.ts';

type SnapshotORSetEntry = Readonly<{
  element: string;
  dots: readonly string[];
}>;

function frozenStringArray(values: Iterable<string>): readonly string[] {
  return Object.freeze([...values]);
}

function frozenEntries(entries: Iterable<SnapshotORSetEntry>): readonly SnapshotORSetEntry[] {
  return Object.freeze([...entries]);
}

function copyEntryMap(source: ORSet): Map<string, readonly string[]> {
  const entries = new Map<string, readonly string[]>();
  for (const [element, dots] of source.entries) {
    entries.set(element, frozenStringArray(dots));
  }
  return entries;
}

/**
 * Read-side OR-set view for public immutable snapshots.
 */
export default class SnapshotORSet {
  readonly #entries: Map<string, readonly string[]>;
  readonly #tombstones: readonly string[];
  readonly #tombstoneSet: Set<string>;

  constructor(source: ORSet) {
    this.#entries = copyEntryMap(source);
    this.#tombstones = frozenStringArray(source.tombstones);
    this.#tombstoneSet = new Set(this.#tombstones);
    Object.freeze(this);
  }

  contains(element: string): boolean {
    const dots = this.#entries.get(element);
    if (dots === undefined) {
      return false;
    }
    return dots.some((dot) => !this.#tombstoneSet.has(dot));
  }

  elements(): readonly string[] {
    const elements: string[] = [];
    for (const element of this.#entries.keys()) {
      if (this.contains(element)) {
        elements.push(element);
      }
    }
    return Object.freeze(elements);
  }

  countEntries(): number {
    let count = 0;
    for (const dots of this.#entries.values()) {
      count += dots.length;
    }
    return count;
  }

  countLiveDots(): number {
    let count = 0;
    for (const dots of this.#entries.values()) {
      count += dots.filter((dot) => !this.#tombstoneSet.has(dot)).length;
    }
    return count;
  }

  countTombstones(): number {
    let count = 0;
    for (const dots of this.#entries.values()) {
      count += dots.filter((dot) => this.#tombstoneSet.has(dot)).length;
    }
    return count;
  }

  getDots(element: string): readonly string[] {
    const dots = this.#entries.get(element) ?? [];
    return frozenStringArray(dots.filter((dot) => !this.#tombstoneSet.has(dot)));
  }

  hasDot(element: string, encodedDot: string): boolean {
    return this.#entries.get(element)?.includes(encodedDot) === true;
  }

  isTombstoned(encodedDot: string): boolean {
    return this.#tombstoneSet.has(encodedDot);
  }

  entries(): readonly SnapshotORSetEntry[] {
    const entries: SnapshotORSetEntry[] = [];
    for (const [element, dots] of this.#entries) {
      entries.push(Object.freeze({
        element,
        dots: frozenStringArray(dots),
      }));
    }
    return frozenEntries(entries);
  }

  entryDots(): readonly string[] {
    const dots: string[] = [];
    for (const entryDots of this.#entries.values()) {
      dots.push(...entryDots);
    }
    return Object.freeze(dots);
  }

  tombstones(): readonly string[] {
    return frozenStringArray(this.#tombstones);
  }
}
