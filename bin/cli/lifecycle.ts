type CloseResource = () => Promise<void>;

/** Drains a long-running command before releasing the storage it may still use. */
export async function closeCommandResources(
  closeCommand: CloseResource,
  closeStorage: CloseResource,
): Promise<void> {
  const failures: unknown[] = [];
  for (const close of [closeCommand, closeStorage]) {
    try {
      await close();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) {
    throw failures[0];
  }
  if (failures.length > 1) {
    throw new AggregateError(failures, 'CLI command and storage failed to close cleanly');
  }
}
