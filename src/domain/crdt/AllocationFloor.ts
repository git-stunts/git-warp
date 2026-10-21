import CrdtError from '../errors/CrdtError.ts';

/**
 * The highest dot counter one writer has used on a lane, as far as a
 * chain head `coveredHead` shows (#1021).
 *
 * Allocation is not observation: a used counter says nothing about which
 * operations the writer saw, so a floor never enters a patch's context.
 * `coveredHead` is the writer chain tip the floor was computed through, or
 * null when only reservations have been made.
 */
export default class AllocationFloor {
  readonly writerId: string;
  readonly counter: number;
  readonly coveredHead: string | null;

  constructor(writerId: string, counter: number, coveredHead: string | null) {
    this.writerId = requireWriterId(writerId);
    this.counter = requireCounter(writerId, counter);
    this.coveredHead = requireCoveredHead(writerId, coveredHead);
    Object.freeze(this);
  }

  /** The same floor, raised to `counter` and covering `coveredHead`. */
  advancedTo(counter: number, coveredHead: string | null): AllocationFloor {
    return new AllocationFloor(this.writerId, Math.max(this.counter, counter), coveredHead);
  }
}

function requireWriterId(writerId: string): string {
  if (typeof writerId !== 'string' || writerId.length === 0) {
    throw new CrdtError('AllocationFloor writerId must be a non-empty string', {
      code: 'E_CRDT_INVALID_WRITER_ID',
      context: { writerId },
    });
  }
  return writerId;
}

function requireCounter(writerId: string, counter: number): number {
  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new CrdtError('AllocationFloor counter must be a non-negative safe integer', {
      code: 'E_CRDT_INVALID_COUNTER',
      context: { writerId, counter },
    });
  }
  return counter;
}

function requireCoveredHead(writerId: string, coveredHead: string | null): string | null {
  if (coveredHead !== null && (typeof coveredHead !== 'string' || coveredHead.length === 0)) {
    throw new CrdtError('AllocationFloor coveredHead must be a commit sha or null', {
      code: 'E_CRDT_INVALID_FLOOR_HEAD',
      context: { writerId, coveredHead },
    });
  }
  return coveredHead;
}
