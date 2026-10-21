import CrdtError from '../errors/CrdtError.ts';
import AllocationFloor from './AllocationFloor.ts';

/** An allocation floor as read from storage, with the revision a replace must expect. */
export default class StoredAllocationFloor {
  readonly floor: AllocationFloor;
  readonly revision: string;

  constructor(floor: AllocationFloor, revision: string) {
    if (!(floor instanceof AllocationFloor)) {
      throw new CrdtError('StoredAllocationFloor requires an AllocationFloor', {
        code: 'E_CRDT_INVALID_FLOOR',
      });
    }
    if (typeof revision !== 'string' || revision.length === 0) {
      throw new CrdtError('StoredAllocationFloor revision must be a non-empty string', {
        code: 'E_CRDT_INVALID_FLOOR',
        context: { writerId: floor.writerId },
      });
    }
    this.floor = floor;
    this.revision = revision;
    Object.freeze(this);
  }
}
