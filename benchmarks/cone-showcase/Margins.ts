import type MarginsUnavailable from './MarginsUnavailable.ts';

export { default as MarginsUnavailable } from './MarginsUnavailable.ts';

/** One document's actual thread and comment identities; no inferred membership. */
export class Margins {
  readonly documentId: string;
  readonly #threads: ReadonlyMap<string, readonly string[]>;

  constructor(documentId: string, threads: ReadonlyMap<string, readonly string[]>) {
    if (!/^d\d+$/.test(documentId)) {
      throw new TypeError('a margins document must have its corpus identity');
    }
    const copied = new Map<string, readonly string[]>();
    const allComments = new Set<string>();
    for (const [threadId, comments] of threads) {
      if (!/^t\d+$/.test(threadId) || comments.some((comment) => !/^c\d+$/.test(comment))
        || new Set(comments).size !== comments.length) {
        throw new TypeError('margins membership must contain unique corpus identities');
      }
      for (const comment of comments) {
        if (allComments.has(comment)) {
          throw new TypeError('a comment cannot belong to two margins threads');
        }
        allComments.add(comment);
      }
      copied.set(threadId, Object.freeze([...comments]));
    }
    this.documentId = documentId;
    this.#threads = copied;
    Object.freeze(this);
  }

  get threads(): ReadonlyMap<string, readonly string[]> {
    return new Map(this.#threads);
  }
}

export type MarginsRead = Margins | MarginsUnavailable;
