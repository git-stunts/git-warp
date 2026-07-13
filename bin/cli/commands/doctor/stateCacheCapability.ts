import type WarpStateCachePort from '../../../../src/ports/WarpStateCachePort.ts';
import type WarpStateCacheRetentionPort from '../../../../src/ports/WarpStateCacheRetentionPort.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import type { Persistence } from '../../types.ts';
import type { DoctorFinding } from './types.ts';
import {
  stateCacheRepairFailureFinding,
  stateCacheRepairFinding,
} from './checksStateCache.ts';

export type DoctorStateCache = WarpStateCachePort & WarpStateCacheRetentionPort;

export async function resolveStateCache(
  persistence: Persistence,
  graphName: string,
): Promise<DoctorStateCache | null> {
  if (typeof persistence.createRuntimeStateCache !== 'function') { return null; }
  return await persistence.createRuntimeStateCache({ graphName, codec: defaultCodec });
}

export async function repairStateCache(
  requested: boolean,
  stateCache: DoctorStateCache | null,
): Promise<DoctorFinding | null> {
  if (!requested || stateCache === null) { return null; }
  try {
    return stateCacheRepairFinding(await stateCache.repairRetention());
  } catch (error) {
    return stateCacheRepairFailureFinding(error);
  }
}
