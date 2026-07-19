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
