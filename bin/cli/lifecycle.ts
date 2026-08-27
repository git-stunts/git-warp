type CloseResource = () => Promise<void>;

type InstallShutdown = (closeCommand: CloseResource) => CloseResource;

type EmitWithCommandShutdownOptions = Readonly<{
  readonly closeCommand: CloseResource | undefined;
  readonly emit: () => Promise<void>;
  readonly installShutdown: InstallShutdown;
}>;

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

async function failAfterShutdown<Failure>(
  operationFailure: Failure,
  shutdown: CloseResource,
): Promise<never> {
  const [cleanup] = await Promise.allSettled([shutdown()]);
  if (cleanup.status === 'rejected') {
    throw new AggregateError(
      [operationFailure, cleanup.reason],
      'CLI output and shutdown both failed',
    );
  }
  return await Promise.reject(operationFailure);
}

/** Drains a long-running command before releasing the storage it may still use. */
export async function closeCommandResources(
  closeCommand: CloseResource,
  closeStorage: CloseResource,
): Promise<void> {
  const [command] = await Promise.allSettled([closeCommand()]);
  const [storage] = await Promise.allSettled([closeStorage()]);
  if (command.status === 'rejected' && storage.status === 'rejected') {
    throw new AggregateError(
      [command.reason, storage.reason],
      'CLI command and storage failed to close cleanly',
    );
  }
  if (command.status === 'rejected') {
    return await Promise.reject(command.reason);
  }
  if (storage.status === 'rejected') {
    return await Promise.reject(storage.reason);
  }
  return undefined;
}
