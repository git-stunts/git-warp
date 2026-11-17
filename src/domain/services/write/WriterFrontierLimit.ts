import WarpError from '../../errors/WarpError.ts';
import type ConeBasis from '../cone/ConeBasis.ts';
import WriterFrontierRefusal from './WriterFrontierRefusal.ts';

/**
 * The most writers a graph admits (#1075). A writer already in the frontier is never
 * refused here. A new writer is admitted only while the frontier holds fewer than the
 * limit. This reads one clone's basis, so a frontier can still pass the limit, through
 * first writes made at once or through writer chains fetched from other clones; every
 * writer in it keeps writing, because custody retains any frontier through shared
 * frontier anchors (#1197), and a newcomer there is refused as at the limit.
 */
export default class WriterFrontierLimit {
  readonly writers: number;
  readonly #full: WriterFrontierRefusal;

  constructor(writers: number) {
    if (!Number.isSafeInteger(writers) || writers < 0) {
      throw new WarpError('A writer frontier limit must be a count of writers', 'E_WRITER_FRONTIER_LIMIT');
    }
    this.writers = writers;
    this.#full = WriterFrontierRefusal.full(writers);
    Object.freeze(this);
  }

  /** Why a write by `writer` onto `basis` is refused before it reserves anything, or null when it may go on. */
  refusal(writer: string, basis: ConeBasis): WriterFrontierRefusal | null {
    const heads = basis.writerHeads();
    return heads.has(writer) || heads.size < this.writers ? null : this.#full;
  }
}
