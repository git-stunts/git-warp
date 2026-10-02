/**
 * Attempts every cleanup in order and preserves work and cleanup failures.
 * @param {() => Promise<void>} operation
 * @param {readonly (() => Promise<void>)[]} cleanups
 */
export async function runAttachmentMemoryWitnessWithCleanup(operation, cleanups) {
  /** @type {Error[]} */
  const failures = [];
  await collectWitnessFailure(operation, failures);
  for (const cleanup of cleanups) await collectWitnessFailure(cleanup, failures);
  if (failures.length > 1) {
    throw new AggregateError(failures, 'Attachment witness and resource cleanup failures');
  }
  const [failure] = failures;
  if (failure !== undefined) throw failure;
}

/**
 * @param {() => Promise<void>} operation
 * @param {Error[]} failures
 */
async function collectWitnessFailure(operation, failures) {
  try {
    await operation();
  } catch (error) {
    failures.push(error instanceof Error ? error : new Error('Witness operation rejected', { cause: error }));
  }
}
