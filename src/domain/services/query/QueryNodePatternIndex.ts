import type ORSet from '../../crdt/ORSet.ts';

const MATCH_ALL_PATTERN = '*';
const NO_MATCH = -1;
const TRAILING_WILDCARD_LENGTH = 1;
const SEGMENT_EXACT = 'exact';
const SEGMENT_PREFIX = 'prefix';

type SortedEntryKeyCache = {
  readonly entryCount: number;
  readonly keys: readonly string[];
};

type QueryNodePatternSegment =
  | { readonly kind: typeof SEGMENT_EXACT; readonly value: string }
  | { readonly kind: typeof SEGMENT_PREFIX; readonly value: string };

const sortedEntryKeysBySet: WeakMap<ORSet, SortedEntryKeyCache> = new WeakMap();

export default class QueryNodePatternIndex {
  readonly #alive: ORSet;

  constructor(alive: ORSet) {
    this.#alive = alive;
    Object.freeze(this);
  }

  *liveCandidates(pattern: string | readonly string[]): Iterable<string> {
    const route = patternRoute(pattern);
    if (route === null) {
      yield* this.#allLiveCandidates();
      return;
    }
    yield* this.#indexedCandidates(route);
  }

  *#allLiveCandidates(): Iterable<string> {
    for (const element of this.#alive.entries.keys()) {
      if (this.#alive.contains(element)) {
        yield element;
      }
    }
  }

  *#indexedCandidates(route: readonly QueryNodePatternSegment[]): Iterable<string> {
    const emitted = new Set<string>();
    for (const segment of route) {
      yield* this.#segmentCandidates(segment, emitted);
    }
  }

  *#segmentCandidates(segment: QueryNodePatternSegment, emitted: Set<string>): Iterable<string> {
    const candidates = segment.kind === SEGMENT_EXACT
      ? this.#exactCandidate(segment.value)
      : this.#prefixCandidates(segment.value);
    for (const candidate of candidates) {
      if (!emitted.has(candidate)) {
        emitted.add(candidate);
        yield candidate;
      }
    }
  }

  *#exactCandidate(nodeId: string): Iterable<string> {
    if (this.#alive.contains(nodeId)) {
      yield nodeId;
    }
  }

  *#prefixCandidates(prefix: string): Iterable<string> {
    const keys = sortedEntryKeys(this.#alive);
    for (let index = lowerBound(keys, prefix); index < keys.length; index += 1) {
      const candidate = keys[index];
      if (candidate === undefined) {
        return;
      }
      if (!candidate.startsWith(prefix)) {
        return;
      }
      if (this.#alive.contains(candidate)) {
        yield candidate;
      }
    }
  }
}

function patternRoute(pattern: string | readonly string[]): readonly QueryNodePatternSegment[] | null {
  const patterns = typeof pattern === 'string' ? [pattern] : pattern;
  const route: QueryNodePatternSegment[] = [];
  for (const entry of patterns) {
    const segment = patternSegment(entry);
    if (segment === null) {
      return null;
    }
    route.push(segment);
  }
  return Object.freeze(route);
}

function patternSegment(pattern: string): QueryNodePatternSegment | null {
  if (pattern === MATCH_ALL_PATTERN) {
    return null;
  }
  const wildcardIndex = pattern.indexOf(MATCH_ALL_PATTERN);
  if (wildcardIndex === NO_MATCH) {
    return Object.freeze({ kind: SEGMENT_EXACT, value: pattern });
  }
  if (isSingleTrailingWildcard(pattern, wildcardIndex)) {
    return Object.freeze({ kind: SEGMENT_PREFIX, value: pattern.slice(0, wildcardIndex) });
  }
  return null;
}

function isSingleTrailingWildcard(pattern: string, wildcardIndex: number): boolean {
  return wildcardIndex === pattern.length - TRAILING_WILDCARD_LENGTH
    && pattern.indexOf(MATCH_ALL_PATTERN, wildcardIndex + TRAILING_WILDCARD_LENGTH) === NO_MATCH;
}

function sortedEntryKeys(alive: ORSet): readonly string[] {
  const cached = sortedEntryKeysBySet.get(alive);
  if (cached !== undefined && cached.entryCount === alive.entries.size) {
    return cached.keys;
  }
  const keys = Object.freeze([...alive.entries.keys()].sort(compareStrings));
  sortedEntryKeysBySet.set(alive, Object.freeze({ entryCount: alive.entries.size, keys }));
  return keys;
}

function lowerBound(keys: readonly string[], needle: string): number {
  let low = 0;
  let high = keys.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const midValue = keys[mid];
    if (midValue === undefined) {
      return low;
    }
    if (midValue < needle) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}
