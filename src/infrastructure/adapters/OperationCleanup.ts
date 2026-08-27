/** Runs cleanup after an operation while preserving every failure. */
export async function completeWithCleanup<T>(
  operation: () => Promise<T>,
  cleanup: () => Promise<void>,
  aggregateMessage: string,
): Promise<T> {
  const [result] = await Promise.allSettled([Promise.resolve().then(operation)]);
  const [cleanupResult] = await Promise.allSettled([Promise.resolve().then(cleanup)]);
  if (result.status === 'rejected' && cleanupResult.status === 'rejected') {
    throw new AggregateError([result.reason, cleanupResult.reason], aggregateMessage);
  }
  if (result.status === 'rejected') {
    throw result.reason;
  }
  if (cleanupResult.status === 'rejected') {
    throw cleanupResult.reason;
  }
  return result.value;
}

/** Attempts every cleanup step in declaration order and preserves failure order. */
export async function completeCleanupSteps(
  steps: readonly (() => Promise<void>)[],
  aggregateMessage: string,
): Promise<void> {
  const failures: PromiseRejectedResult[] = [];
  for (const step of steps) {
    const [result] = await Promise.allSettled([Promise.resolve().then(step)]);
    if (result?.status === 'rejected') {
      failures.push(result);
    }
  }
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
