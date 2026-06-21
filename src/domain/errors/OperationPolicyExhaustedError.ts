import WarpError from './WarpError.ts';

export default class OperationPolicyExhaustedError extends WarpError {
  static CODE = 'E_OPERATION_POLICY_EXHAUSTED';

  readonly attempts: number;
  declare cause: Error;

  constructor(attempts: number, cause: Error) {
    super(
      `Operation policy exhausted after ${attempts} attempts`,
      OperationPolicyExhaustedError.CODE,
      { context: { attempts } },
    );
    this.attempts = attempts;
    this.cause = cause;
  }
}
