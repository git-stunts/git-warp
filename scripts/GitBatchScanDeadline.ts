const DEFAULT_GIT_BATCH_SCAN_DEADLINE_MILLISECONDS = 120_000;

export class GitBatchScanDeadline {
  readonly milliseconds: number;

  constructor(milliseconds: number) {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 1) {
      throw new RangeError('Git batch scan deadline must be a positive safe integer');
    }
    this.milliseconds = milliseconds;
    Object.freeze(this);
  }

  static standard(): GitBatchScanDeadline {
    return new GitBatchScanDeadline(DEFAULT_GIT_BATCH_SCAN_DEADLINE_MILLISECONDS);
  }
}
