import ConeRecordError from '../../errors/ConeRecordError.ts';

const REVISION_PATTERN = /^[0-9a-f]{4,64}$/u;

/**
 * The root of a cone record trie: an opaque storage revision, or the empty
 * trie that holds no records. A basis that has never folded anything starts
 * from the empty root.
 */
export default class ConeRoot {
  readonly #revision: string | null;

  private constructor(revision: string | null) {
    this.#revision = revision;
    Object.freeze(this);
  }

  static empty(): ConeRoot {
    return new ConeRoot(null);
  }

  static at(revision: string): ConeRoot {
    if (!REVISION_PATTERN.test(revision)) {
      throw new ConeRecordError('Cone root revision must be a lowercase hex object id', { context: { revision } });
    }
    return new ConeRoot(revision);
  }

  isEmpty(): boolean {
    return this.#revision === null;
  }

  /** The storage revision; only a non-empty root has one. */
  revision(): string {
    if (this.#revision === null) {
      throw new ConeRecordError('The empty cone root has no revision');
    }
    return this.#revision;
  }

  equals(other: ConeRoot): boolean {
    return other.#revision === this.#revision;
  }

  toString(): string {
    return this.#revision ?? '(empty)';
  }
}
