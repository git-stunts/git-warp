import ConeBasis from '../cone/ConeBasis.ts';
import ConeWriterPosition from '../cone/ConeWriterPosition.ts';
import type { PatchCommitResult } from '../../types/PatchCommitResult.ts';

/**
 * What a blind write can honestly claim its writer observed (#1051): what this clone
 * held when this Warp began writing, plus that writer's own landed patches. The contract
 * makes the writer the observer, so another writer's patch is not seen merely because it
 * shares a Warp. The published cone head cannot say this either, since any fold moves
 * it without anyone having read what it folded. Nothing else adds to this until reads
 * can (#1052), so a race stays plural until then.
 */
export default class ConeWriteKnowledge {
  #start: ConeBasis | null = null;
  readonly #seen = new Map<string, ConeBasis>();

  /** The basis a writer's blind write observed. The first write on this Warp fixes where every writer starts. */
  seen(writer: string, from: ConeBasis): ConeBasis {
    this.#start ??= from;
    return this.#seen.get(writer) ?? this.#start;
  }

  /** Records a landed write's own patch, and nothing else it may have read. */
  landed(from: ConeBasis, publication: PatchCommitResult): void {
    const { writer, lamport } = publication.patch;
    const { root, frontier } = this.seen(writer, from);
    this.#seen.set(writer, new ConeBasis(root, frontier.advanced(writer, new ConeWriterPosition(publication.sha, lamport))));
  }
}
