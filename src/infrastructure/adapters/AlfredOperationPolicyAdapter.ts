import {
  retry,
  timeout,
  RetryExhaustedError,
  TimeoutError,
} from '@git-stunts/alfred';
import OperationPolicyExhaustedError from '../../domain/errors/OperationPolicyExhaustedError.ts';
import OperationPolicyTimeoutError from '../../domain/errors/OperationPolicyTimeoutError.ts';
import OperationPolicyPort, {
  type OperationPolicyExecuteOptions,
} from '../../ports/OperationPolicyPort.ts';

type AlfredOperationPolicyAdapterOptions = {
  readonly retryOptions?: OperationPolicyExecuteOptions;
};

export default class AlfredOperationPolicyAdapter extends OperationPolicyPort {
  private readonly _retryOptions: OperationPolicyExecuteOptions;

  constructor(options: AlfredOperationPolicyAdapterOptions = {}) {
    super();
    this._retryOptions = options.retryOptions ?? {};
  }

  override async execute<T>(
    operation: (signal?: AbortSignal) => Promise<T>,
    options: OperationPolicyExecuteOptions = {},
  ): Promise<T> {
    const resolvedOptions = { ...this._retryOptions, ...options };
    return await this._mapErrors(async () => {
      if (resolvedOptions.retries !== undefined) {
        return await retry(
          (retrySignal?: AbortSignal) => this._executeAttempt(operation, resolvedOptions, retrySignal),
          resolvedOptions,
        );
      }
      return await this._executeAttempt(operation, resolvedOptions, resolvedOptions.signal);
    });
  }

  override async stream<T>(
    operation: (signal?: AbortSignal) => Promise<AsyncIterable<T>>,
    options: OperationPolicyExecuteOptions = {},
  ): Promise<AsyncIterable<T>> {
    return await this.execute(operation, options);
  }

  private async _executeAttempt<T>(
    operation: (signal?: AbortSignal) => Promise<T>,
    options: OperationPolicyExecuteOptions,
    retrySignal: AbortSignal | undefined,
  ): Promise<T> {
    if (options.timeoutMs !== undefined) {
      return await timeout(options.timeoutMs, async (timeoutSignal: AbortSignal) =>
        await operation(combineAbortSignals(retrySignal, timeoutSignal)));
    }
    return await operation(retrySignal);
  }

  private async _mapErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (err) {
      if (err instanceof RetryExhaustedError) {
        throw new OperationPolicyExhaustedError(err.attempts, err.cause);
      }
      if (err instanceof TimeoutError) {
        throw new OperationPolicyTimeoutError(err.timeout, err.elapsed);
      }
      throw err;
    }
  }
}

function combineAbortSignals(
  first: AbortSignal | undefined,
  second: AbortSignal | undefined,
): AbortSignal | undefined {
  if (first === undefined) {
    return second;
  }
  if (second === undefined) {
    return first;
  }
  return AbortSignal.any([first, second]);
}
