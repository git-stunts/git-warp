import PatchEntry from '../../artifacts/PatchEntry.ts';
import type { PatchCommitResult } from '../../types/PatchCommitResult.ts';
import type ConeBasis from '../cone/ConeBasis.ts';
import type ConeLaneBasis from '../cone/ConeLaneBasis.ts';
import type ConeWriteKnowledge from './ConeWriteKnowledge.ts';

/** Folds a just-published patch into its lane's basis, so the next write costs only what it touches. */
export default class PatchEntryFold {
  readonly #cone: ConeLaneBasis;
  readonly #parent: string | null;
  readonly #knowledge: ConeWriteKnowledge;
  readonly #observed: ConeBasis;

  constructor(cone: ConeLaneBasis, written: {
    readonly parent: string | null;
    readonly knowledge: ConeWriteKnowledge;
    readonly observed: ConeBasis;
  }) {
    this.#cone = cone;
    this.#parent = written.parent;
    this.#knowledge = written.knowledge;
    this.#observed = written.observed;
    Object.freeze(this);
  }

  /** The basis is derived: a fold that cannot finish here is left to the next advance, which folds it from the chain. */
  async fold(publication: PatchCommitResult): Promise<void> {
    this.#knowledge.landed(this.#observed, publication);
    try {
      await this.#cone.foldCommitted(new PatchEntry({ patch: publication.patch, sha: publication.sha }), this.#parent);
    } catch {
      // The patch is durable and the next advance folds it.
    }
  }
}
