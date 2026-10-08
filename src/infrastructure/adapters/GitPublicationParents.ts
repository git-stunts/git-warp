import { CasError } from '@git-stunts/git-cas';

const FULL_GIT_OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

/** Validated physical parent identifiers for git-cas application publication. */
export default class GitPublicationParents {
  readonly #values: readonly string[];

  constructor(parents: string[]) {
    if (!Array.isArray(parents)) {
      throw new CasError('Publication parents must be an array', 'PUBLICATION_INVALID');
    }
    this.#values = Object.freeze([...parents].map(normalizeParent));
    Object.freeze(this);
  }

  toArray(): string[] {
    return [...this.#values];
  }
}

function normalizeParent(parent: string): string {
  if (typeof parent !== 'string' || !FULL_GIT_OID.test(parent)) {
    throw new CasError('Publication parent is not a valid object identifier', 'PUBLICATION_INVALID', {
      field: 'parent', value: parent,
    });
  }
  return parent.toLowerCase();
}
