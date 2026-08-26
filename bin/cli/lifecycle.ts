type CloseResource = () => Promise<void>;

type InstallShutdown = (closeCommand: CloseResource) => CloseResource;

interface EmitWithCommandShutdownOptions {
  readonly closeCommand: CloseResource | undefined;
  readonly emit: () => Promise<void>;
  readonly installShutdown: InstallShutdown;
}

/** Installs command cleanup before output consumption can fail or be interrupted. */
export async function emitWithCommandShutdown(
  options: EmitWithCommandShutdownOptions,
): Promise<CloseResource | undefined> {
  const { closeCommand, emit, installShutdown } = options;
  if (closeCommand === undefined) {
    await emit();
    return undefined;
  }

  const shutdown = installShutdown(closeCommand);
  try {
    await emit();
  } catch (operationFailure) {
    return await failAfterShutdown(operationFailure, shutdown);
  }
  return shutdown;
}

async function failAfterShutdown(
  operationFailure: unknown,
  shutdown: CloseResource,
): Promise<never> {
  try {
    await shutdown();
  } catch (cleanupFailure) {
    throw new AggregateError(
      [operationFailure, cleanupFailure],
      'CLI output and shutdown both failed',
    );
  }
  throw operationFailure;
}

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
