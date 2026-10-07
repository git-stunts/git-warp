import InvalidWriteObservationError from '../errors/InvalidWriteObservationError.ts';
import type PatchEntry from '../artifacts/PatchEntry.ts';

/** Identity and clock of one specifically inspected immutable writer patch. */
export default class ObservedWriterHead {
  readonly writerId: string;
  readonly patchSha: string;
  readonly lamport: number;

  constructor(writerId: string, patchSha: string, lamport: number) {
    validateIdentity(writerId, patchSha);
    validateClock(lamport);
    this.writerId = writerId;
    this.patchSha = patchSha;
    this.lamport = lamport;
    Object.freeze(this);
  }

  static fromEntry(writerId: string, patchSha: string, entry: PatchEntry): ObservedWriterHead {
    if (entry.sha !== patchSha || entry.patch.writer !== writerId) {
      throw new InvalidWriteObservationError('Inspected patch does not match its captured writer head');
    }
    return new ObservedWriterHead(writerId, patchSha, entry.patch.lamport);
  }
}

function validateIdentity(writerId: string, patchSha: string): void {
  if (typeof writerId !== 'string' || writerId.length === 0
    || typeof patchSha !== 'string' || patchSha.length === 0) {
    throw new InvalidWriteObservationError('Observed writer and patch identities must be non-empty');
  }
}

function validateClock(lamport: number): void {
  if (!Number.isSafeInteger(lamport) || lamport < 0 || lamport >= Number.MAX_SAFE_INTEGER) {
    throw new InvalidWriteObservationError('Observed patch clock cannot be safely advanced');
  }
}
