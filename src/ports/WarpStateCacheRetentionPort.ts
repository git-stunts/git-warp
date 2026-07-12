import type WarpStateCacheRetentionReport from '../domain/services/state/WarpStateCacheRetentionReport.ts';
import type WarpStateCacheRepairResult from '../domain/services/state/WarpStateCacheRepairResult.ts';

/**
 * Operational retention capability for state caches backed by reclaimable
 * content-addressed storage.
 */
export default interface WarpStateCacheRetentionPort {
  inspectRetention(): Promise<WarpStateCacheRetentionReport>;
  repairRetention(): Promise<WarpStateCacheRepairResult>;
}
