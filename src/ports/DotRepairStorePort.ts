import type DotCollision from '../domain/repair/DotCollision.ts';
import type DotRepairRecord from '../domain/repair/DotRepairRecord.ts';

/** Recorded dot collisions and the repairs that resolved them, for one lane (#1022). */
export default abstract class DotRepairStorePort {
  /** Collisions the v21 migration reported, in every scope. */
  abstract collisions(): Promise<readonly DotCollision[]>;

  abstract repairs(): Promise<readonly DotRepairRecord[]>;

  abstract readRepair(_repairId: string): Promise<DotRepairRecord | null>;

  abstract writeRepair(_record: DotRepairRecord): Promise<void>;
}
