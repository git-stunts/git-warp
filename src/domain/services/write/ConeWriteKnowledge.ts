import ConeBasis from '../cone/ConeBasis.ts';
import ConeWriterPosition from '../cone/ConeWriterPosition.ts';
import type { PatchCommitResult } from '../../types/PatchCommitResult.ts';

/**
 * What a blind write can honestly claim to have observed (#1051): the writer heads
 * this Warp's own landed writes had seen. The published cone head cannot say this, since
 * any fold moves it, including a refused attempt's or another process's, without anyone
 * having read what it folded. A new Warp starts from the head as it first finds it,
 * so a value folded by an earlier process counts as seen.
 */
export default class ConeWriteKnowledge {
  #seen: ConeBasis | null = null;

  /** The basis a blind write observed, given what this clone held when it began. */
  seen(from: ConeBasis): ConeBasis {
    this.#seen ??= from;
    return this.#seen;
  }

  /** Records a landed write: it saw what it observed, and now its own patch. */
  landed(observed: ConeBasis, publication: PatchCommitResult): void {
    const position = new ConeWriterPosition(publication.sha, publication.patch.lamport);
    this.#seen = new ConeBasis(observed.root, observed.frontier.advanced(publication.patch.writer, position));
  }
}
