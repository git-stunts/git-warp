import WarpError from '../../errors/WarpError.ts';
import type ConeBasis from '../cone/ConeBasis.ts';
import WriterFrontierRefusal from './WriterFrontierRefusal.ts';

/**
 * The most writer chains a graph's frontier may hold, because every write retains each
 * of their heads (#1075). A writer already in the frontier is never refused here. A new
 * writer is admitted only while the frontier has room, so a newcomer at the limit is
 * refused and does not grow the frontier past what one write can retain. This reads one
 * clone's basis, so it cannot stop a frontier that passes the limit another way: custody
 * then refuses every writer, and a newcomer is told that, not to reuse a writer ID.
 */
export default class WriterFrontierLimit {
  readonly writers: number;

  constructor(writers: number) {
    if (!Number.isSafeInteger(writers) || writers < 0) {
      throw new WarpError('A writer frontier limit must be a count of writers', 'E_WRITER_FRONTIER_LIMIT');
    }
    this.writers = writers;
    Object.freeze(this);
  }

  /** Why a write by `writer` onto `basis` is refused before it reserves anything, or null when it may go on. */
  refusal(writer: string, basis: ConeBasis): WriterFrontierRefusal | null {
    const heads = basis.writerHeads();
    if (heads.has(writer) || heads.size < this.writers) {
      return null;
    }
    return heads.size > this.writers ? WriterFrontierRefusal.OVER_LIMIT : WriterFrontierRefusal.FULL;
  }
}
