import ConeBasis from '../cone/ConeBasis.ts';
import ConeWriterPosition from '../cone/ConeWriterPosition.ts';
import type { PatchCommitResult } from '../../types/PatchCommitResult.ts';

/**
 * What a blind write can honestly claim to have observed (#1051): what this clone held
 * when this Warp began writing, plus the patches this Warp's own writes landed. The
 * published cone head cannot say this, since any fold moves it, including a refused
 * attempt's or another process's, without anyone having read what it folded. Nothing
 * else adds to it until reads can (#1052), so a race stays plural until then.
 */
export default class ConeWriteKnowledge {
  #seen: ConeBasis | null = null;

  /** The basis a blind write observed, fixed by the first write to ask. */
  seen(from: ConeBasis): ConeBasis {
    this.#seen ??= from;
    return this.#seen;
  }

  /** Records a landed write's own patch, and nothing else it may have read: other writers did not read that. */
  landed(from: ConeBasis, publication: PatchCommitResult): void {
    const { root, frontier } = this.seen(from);
    const position = new ConeWriterPosition(publication.sha, publication.patch.lamport);
    this.#seen = new ConeBasis(root, frontier.advanced(publication.patch.writer, position));
  }
}
