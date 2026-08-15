const DEFAULT_GIT_BATCH_READ_WINDOW_BYTES = 64 * 1024;

export class GitBatchReadWindow {
  readonly bytes: number;

  constructor(bytes: number) {
    if (!Number.isSafeInteger(bytes) || bytes < 1) {
      throw new RangeError('Git batch read window must be a positive safe integer');
    }
    this.bytes = bytes;
    Object.freeze(this);
  }

  static standard(): GitBatchReadWindow {
    return new GitBatchReadWindow(DEFAULT_GIT_BATCH_READ_WINDOW_BYTES);
  }
}
