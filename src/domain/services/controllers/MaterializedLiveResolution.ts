import LiveMaterializationResolution from '../../materialization/LiveMaterializationResolution.ts';
import type MaterializationHandle from '../../materialization/MaterializationHandle.ts';
import WarpError from '../../errors/WarpError.ts';
import type { MaterializationAcquisition } from '../../../ports/MaterializationStorePort.ts';
import type { MaterializeResult } from './MaterializeController.ts';

export function materializedResolution(
  result: MaterializeResult,
  acquired: MaterializationAcquisition,
): LiveMaterializationResolution {
  if (result.materialization === undefined) {
    throw resolutionError('non-empty coordinate did not produce a retained handle');
  }
  requireSameHandle(result.materialization, acquired.materialization);
  return new LiveMaterializationResolution({
    materialization: acquired.materialization,
    source: 'materialized',
    replayedPatchCount: result.patchCount,
    release: async () => await acquired.release(),
  });
}

function requireSameHandle(
  expected: MaterializationHandle,
  acquired: MaterializationHandle,
): void {
  if (
    !acquired.coordinate.equals(expected.coordinate)
    || acquired.stateHash !== expected.stateHash
    || !acquired.bundle.equals(expected.bundle)
  ) {
    throw resolutionError('newly retained handle changed before it could be acquired');
  }
}

function resolutionError(message: string): WarpError {
  return new WarpError(
    `Materialization resolution ${message}`,
    'E_MATERIALIZATION_RESUME',
  );
}
