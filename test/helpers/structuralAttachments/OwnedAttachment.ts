import OwnershipPosition, { requireIdentity } from './OwnershipPosition.ts';

/** Test-only owned occurrence link, distinct from shared immutable storage. */
export default class OwnedAttachment {
  readonly owner: OwnershipPosition;
  readonly child: string;

  constructor(owner: OwnershipPosition, child: string) {
    if (!(owner instanceof OwnershipPosition)) throw new Error('Invalid ownership position');
    requireIdentity(child);
    this.owner = owner;
    this.child = child;
    Object.freeze(this);
  }
}
