import CrdtError from '../errors/CrdtError.ts';

/** Historical checkpoint identity: only Lamport was recorded, or no identity. */
export default class LegacyEventId {
  readonly lamport: number;
  readonly writerId = '';
  readonly patchSha = '0000';
  readonly opIndex = 0;

  constructor(lamport: number) {
    if (!Number.isInteger(lamport) || lamport < 0) {
      throw new CrdtError('Legacy checkpoint Lamport must be a non-negative integer');
    }
    this.lamport = lamport;
    Object.freeze(this);
  }
}
