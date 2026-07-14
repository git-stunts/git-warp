import type WarpStateCachePort from '../../../../src/ports/WarpStateCachePort.ts';
import type WarpStateCacheRetentionPort from '../../../../src/ports/WarpStateCacheRetentionPort.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import type RuntimeStorageProviderPort from '../../../../src/ports/RuntimeStorageProviderPort.ts';
import type { DoctorFinding } from './types.ts';
import {
  stateCacheRepairFailureFinding,
  stateCacheRepairFinding,
} from './checksStateCache.ts';

export type DoctorStateCache = WarpStateCachePort & WarpStateCacheRetentionPort;

export async function resolveStateCache(
  runtimeStorage: RuntimeStorageProviderPort,
  graphName: string,
): Promise<DoctorStateCache | null> {
  const services = await runtimeStorage.createRuntimeStorageServices({
    timelineName: graphName,
    codec: defaultCodec,
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
  });
  return services.stateSnapshots ?? null;
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
