type CleanupStep = () => Promise<void>;

/** Runs cleanup after an operation while preserving every failure. */
export async function completeWithCleanup<T>(
  operation: () => Promise<T>,
  cleanup: CleanupStep,
  aggregateMessage: string,
): Promise<T> {
  const [result] = await Promise.allSettled([Promise.resolve().then(operation)]);
  const [cleanupResult] = await Promise.allSettled([Promise.resolve().then(cleanup)]);
  if (result.status === 'rejected' && cleanupResult.status === 'rejected') {
    throw new AggregateError([result.reason, cleanupResult.reason], aggregateMessage);
  }
  if (result.status === 'rejected') {
    return await Promise.reject(result.reason);
  }
  if (cleanupResult.status === 'rejected') {
    return await Promise.reject(cleanupResult.reason);
  }
  return result.value;
}

/** Attempts every cleanup step in declaration order and preserves failure order. */
export async function completeCleanupSteps(
  steps: readonly CleanupStep[],
  aggregateMessage: string,
): Promise<void> {
  const failures = await cleanupFailures(steps);
  const first = failures[0];
  if (failures.length === 1 && first !== undefined) {
    return await Promise.reject(first.reason);
  }
  if (failures.length > 1) {
    throw new AggregateError(
      failures.map(({ reason }) => reason),
      aggregateMessage,
    );
  }
}

/** Attempts ordered cleanup before rejecting with the primary failure first. */
export async function failWithCleanupSteps<Failure>(
  primaryFailure: Failure,
  steps: readonly CleanupStep[],
  aggregateMessage: string,
): Promise<never> {
  const cleanup = await cleanupFailures(steps);
  if (cleanup.length > 0) {
    throw new AggregateError(
      [primaryFailure, ...cleanup.map(({ reason }) => reason)],
      aggregateMessage,
    );
  }
  return await Promise.reject(primaryFailure);
}

async function cleanupFailures(
  steps: readonly CleanupStep[],
): Promise<PromiseRejectedResult[]> {
  const failures: PromiseRejectedResult[] = [];
  for (const step of steps) {
    const [result] = await Promise.allSettled([Promise.resolve().then(step)]);
    if (result.status === 'rejected') {
      failures.push(result);
    }
  }
  return failures;
}
