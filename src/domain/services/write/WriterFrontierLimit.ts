import WarpError from '../../errors/WarpError.ts';
import type ConeBasis from '../cone/ConeBasis.ts';

/**
 * The most writer chains a graph's frontier may hold, because every write retains each
 * of their heads (#1075). A writer already in the frontier always writes. A new writer
 * is admitted only while the frontier has room, so a newcomer past the limit is refused
 * and the graph does not grow into a frontier no write could retain.
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

  /** Whether a write by `writer` onto `basis` leaves a frontier within the limit. */
  admits(writer: string, basis: ConeBasis): boolean {
    const heads = basis.writerHeads();
    return heads.has(writer) || heads.size < this.writers;
  }
}
