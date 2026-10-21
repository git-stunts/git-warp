import type AllocationFloor from '../domain/crdt/AllocationFloor.ts';
import type StoredAllocationFloor from '../domain/crdt/StoredAllocationFloor.ts';

/**
 * Durable per-writer allocation floors for one lane (#1021).
 *
 * Floors are clone-local bookkeeping. Each clone derives its own from the
 * writer chains it holds, so floors are never synced.
 */
export default abstract class AllocationFloorStorePort {
  /** Reads the stored floor for `writerId`, or null when none was published. */
  abstract read(_writerId: string): Promise<StoredAllocationFloor | null>;

  /**
   * Replaces the stored floor if it is still `expected` (null: none stored).
   * Returns false, without writing, when another publisher got there first.
   */
  abstract publish(_floor: AllocationFloor, _expected: StoredAllocationFloor | null): Promise<boolean>;
}
