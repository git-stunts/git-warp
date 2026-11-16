import type ConeWriteLowering from './ConeWriteLowering.ts';
import type ConeWritePublisher from './ConeWritePublisher.ts';
import type ConeWriteRecovery from './ConeWriteRecovery.ts';

/**
 * What a granted write runs on: lowering over the lane's cone, publication through the
 * retention ledger, and recovery of unfinished attempts. Opening it marks the lane's
 * substrate and installs its retention policy, so it waits for a grant (#1078).
 */
export default class ConeWritePath {
  readonly lowering: ConeWriteLowering;
  readonly publisher: ConeWritePublisher;
  readonly recovery: ConeWriteRecovery;

  constructor(fields: {
    readonly lowering: ConeWriteLowering;
    readonly publisher: ConeWritePublisher;
    readonly recovery: ConeWriteRecovery;
  }) {
    this.lowering = fields.lowering;
    this.publisher = fields.publisher;
    this.recovery = fields.recovery;
    Object.freeze(this);
  }
}
