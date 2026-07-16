import type LoggerPort from '../../../ports/LoggerPort.ts';
import type MaterializationWorkspacePort from '../../../ports/MaterializationWorkspacePort.ts';

/** Release a workspace without allowing cleanup to replace an existing failure. */
export async function releaseWorkspaceAfterFailure(
  workspace: MaterializationWorkspacePort | undefined,
  logger?: LoggerPort
): Promise<void> {
  try {
    await workspace?.release();
  } catch (cleanupFailure) {
    reportCleanupFailure(logger, cleanupFailure);
  }
}

function reportCleanupFailure<Failure>(logger: LoggerPort | undefined, failure: Failure): void {
  try {
    logger?.warn('[warp] materialization workspace release failed during error cleanup', {
      error: failure instanceof Error ? failure.message : String(failure),
    });
  } catch {
    // Diagnostics are best-effort while preserving the active operation failure.
  }
}
