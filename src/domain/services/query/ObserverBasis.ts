import QueryError from '../../errors/QueryError.ts';

/** Runtime-backed native distinctions for a structural observer. */
export default class ObserverBasis {
  readonly #distinctions: readonly string[];

  constructor(distinctions: readonly string[] = []) {
    this.#distinctions = normalizeDistinctions(distinctions);
    Object.freeze(this);
  }

  static from(distinctions: readonly string[] | undefined): ObserverBasis {
    return new ObserverBasis(distinctions ?? []);
  }

  get distinctions(): readonly string[] {
    return this.#distinctions;
  }

  get size(): number {
    return this.#distinctions.length;
  }

  isEmpty(): boolean {
    return this.#distinctions.length === 0;
  }

  contains(distinction: string): boolean {
    return this.#distinctions.includes(distinction);
  }

  matchedBy(propertyKeys: readonly string[]): readonly string[] {
    const keys = new Set(propertyKeys);
    return Object.freeze(this.#distinctions.filter((distinction) => keys.has(distinction)));
  }

  toConfigValue(): string[] {
    return [...this.#distinctions];
  }
}

function normalizeDistinctions(distinctions: readonly string[]): readonly string[] {
  requireDistinctionArray(distinctions);
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const distinction of distinctions) {
    normalized.push(requireDistinction(distinction, seen));
  }
  return Object.freeze(normalized);
}

function requireDistinctionArray(distinctions: readonly string[]): void {
  if (!Array.isArray(distinctions)) {
    throw new QueryError('observer basis must be an array of distinctions', {
      code: 'E_OBSERVER_BASIS_TYPE',
      context: { field: 'basis' },
    });
  }
}

function requireDistinction(distinction: string, seen: Set<string>): string {
  if (typeof distinction !== 'string' || distinction.length === 0) {
    throw new QueryError('observer basis distinction must be non-empty', {
      code: 'E_OBSERVER_BASIS_DISTINCTION',
      context: { field: 'basis' },
    });
  }
  if (seen.has(distinction)) {
    throw new QueryError('observer basis distinction must be unique', {
      code: 'E_OBSERVER_BASIS_DISTINCTION',
      context: { field: 'basis', distinction },
    });
  }
  seen.add(distinction);
  return distinction;
}
