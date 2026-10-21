import type AllocationFloor from '../../src/domain/crdt/AllocationFloor.ts';
import StoredAllocationFloor from '../../src/domain/crdt/StoredAllocationFloor.ts';
import AllocationFloorStorePort from '../../src/ports/AllocationFloorStorePort.ts';

/** Map-backed allocation floors for tests whose persistence mocks do not model refs. */
export default class InMemoryAllocationFloorStore extends AllocationFloorStorePort {
  readonly #floors = new Map<string, StoredAllocationFloor>();
  #revisions = 0;

  async read(writerId: string): Promise<StoredAllocationFloor | null> {
    return this.#floors.get(writerId) ?? null;
  }

  async publish(floor: AllocationFloor, expected: StoredAllocationFloor | null): Promise<boolean> {
    if ((this.#floors.get(floor.writerId) ?? null) !== expected) { return false; }
    this.#revisions += 1;
    this.#floors.set(floor.writerId, new StoredAllocationFloor(floor, `memory-${this.#revisions}`));
    return true;
  }
}
