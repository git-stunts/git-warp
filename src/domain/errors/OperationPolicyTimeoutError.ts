import WarpError from './WarpError.ts';

export default class OperationPolicyTimeoutError extends WarpError {
  static CODE = 'E_OPERATION_POLICY_TIMEOUT';

  readonly timeoutMs: number;
  readonly elapsedMs: number;

  constructor(timeoutMs: number, elapsedMs: number) {
    super(
      `Operation exceeded timeout ${timeoutMs}ms after ${elapsedMs}ms`,
      OperationPolicyTimeoutError.CODE,
      { context: { timeoutMs, elapsedMs } },
    );
    this.timeoutMs = timeoutMs;
    this.elapsedMs = elapsedMs;
  }
}
