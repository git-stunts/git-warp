import OwnershipPosition from './OwnershipPosition.ts';

/** Opaque value binding: equal values confer neither shared lineage nor ownership. */
export default class AttachmentAtom {
  readonly owner: OwnershipPosition;
  readonly value: string;

  constructor(owner: OwnershipPosition, value: string) {
    if (!(owner instanceof OwnershipPosition) || typeof value !== 'string') {
      throw new Error('Invalid atomic attachment');
    }
    this.owner = owner;
    this.value = value;
    Object.freeze(this);
  }
}
