import WarpError from '../errors/WarpError.ts';

type CleanupStep = () => Promise<void>;
type OperationOutcome<T> =
  | readonly [value: T, failure: null]
  | readonly [value: null, failure: Error];

/** Runs cleanup after an operation while preserving every failure. */
export async function completeWithCleanup<T>(
  operation: () => Promise<T>,
  cleanup: CleanupStep,
  aggregateMessage: string,
): Promise<T> {
  const outcome = await operationOutcome(operation);
  const cleanupFailure = await cleanupStepFailure(cleanup);
  if (outcome[1] !== null && cleanupFailure !== null) {
    throw new AggregateError([outcome[1], cleanupFailure], aggregateMessage);
  }
  if (outcome[1] !== null) {
    throw outcome[1];
  }
  if (cleanupFailure !== null) {
    throw cleanupFailure;
  }
  return outcome[0];
}

/** Attempts every cleanup step in declaration order and preserves failure order. */
export async function completeCleanupSteps(
  steps: readonly CleanupStep[],
  aggregateMessage: string,
): Promise<void> {
  const failures = await cleanupFailures(steps);
  const first = failures[0];
  if (first === undefined) {
    return;
  }
  if (failures.length === 1) {
    throw first;
  }
  throw new AggregateError(failures, aggregateMessage);
}

/** Attempts ordered cleanup before rejecting with the primary failure first. */
export async function failWithCleanupSteps(
  primaryFailure: Error,
  steps: readonly CleanupStep[],
  aggregateMessage: string,
): Promise<never> {
  const cleanup = await cleanupFailures(steps);
  if (cleanup.length > 0) {
    throw new AggregateError(
      [primaryFailure, ...cleanup],
      aggregateMessage,
    );
  }
  throw primaryFailure;
}

async function operationOutcome<T>(
  operation: () => Promise<T>,
): Promise<OperationOutcome<T>> {
  try {
    return Object.freeze([await operation(), null]);
  } catch (failure) {
    const normalized = failure instanceof Error
      ? failure
      : nonErrorRejection('operation');
    return Object.freeze([null, normalized]);
  }
}

async function cleanupFailures(
  steps: readonly CleanupStep[],
): Promise<Error[]> {
  const failures: Error[] = [];
  for (const step of steps) {
    const failure = await cleanupStepFailure(step);
    if (failure !== null) {
      failures.push(failure);
    }
  }
  return failures;
}

async function cleanupStepFailure(step: CleanupStep): Promise<Error | null> {
  try {
    await step();
    return null;
  } catch (failure) {
    return failure instanceof Error
      ? failure
      : nonErrorRejection('cleanup');
  }
}

function nonErrorRejection(
  phase: 'operation' | 'cleanup',
): WarpError {
  return new WarpError(
    `${phase} rejected with a non-Error value`,
    phase === 'cleanup'
      ? 'E_OPERATION_CLEANUP_REJECTION'
      : 'E_OPERATION_REJECTION',
  );
}
