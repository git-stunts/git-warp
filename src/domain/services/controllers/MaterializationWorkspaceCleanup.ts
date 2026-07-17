import type LoggerPort from '../../../ports/LoggerPort.ts';
import type { MaterializationAcquisition } from '../../../ports/MaterializationStorePort.ts';
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

/** Release a retained materialization without replacing an active failure. */
export async function releaseAcquisitionAfterFailure(
  acquisition: Pick<MaterializationAcquisition, 'release'> | null,
  logger?: LoggerPort,
): Promise<void> {
  try {
    await acquisition?.release();
  } catch (cleanupFailure) {
    reportCleanupFailure(logger, cleanupFailure, 'acquisition');
  }
}

function reportCleanupFailure<Failure>(
  logger: LoggerPort | undefined,
  failure: Failure,
  scope = 'workspace',
): void {
  try {
    logger?.warn(`[warp] materialization ${scope} release failed during error cleanup`, {
      error: failure instanceof Error ? failure.message : String(failure),
    });
  } catch {
    // Diagnostics are best-effort while preserving the active operation failure.
  }
}
