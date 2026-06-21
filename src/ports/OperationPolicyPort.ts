export type OperationPolicyBackoff = 'constant' | 'linear' | 'exponential';
export type OperationPolicyJitter = 'none' | 'full' | 'equal' | 'decorrelated';
export type OperationRetryDecision = (error: Error) => boolean;
export type OperationRetryObserver = (error: Error, attempt: number, delayMs: number) => void;

export type OperationPolicyExecuteOptions = {
  readonly retries?: number;
  readonly delay?: number;
  readonly maxDelay?: number;
  readonly backoff?: OperationPolicyBackoff;
  readonly jitter?: OperationPolicyJitter;
  readonly shouldRetry?: OperationRetryDecision;
  readonly onRetry?: OperationRetryObserver;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
};

export default abstract class OperationPolicyPort {
  abstract execute<T>(
    _operation: (signal?: AbortSignal) => Promise<T>,
    _options?: OperationPolicyExecuteOptions,
  ): Promise<T>;

  abstract stream<T>(
    _operation: (signal?: AbortSignal) => Promise<AsyncIterable<T>>,
    _options?: OperationPolicyExecuteOptions,
  ): Promise<AsyncIterable<T>>;
}
