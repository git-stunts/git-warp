import OwnershipPosition, { requireIdentity } from './OwnershipPosition.ts';
import type StructuralAttachmentState from './StructuralAttachmentState.ts';

/** One attachment-only candidate with a captured, occurrence-qualified path. */
export default class AttachmentUpdate {
  readonly id: string;
  readonly position: OwnershipPosition;
  readonly value: string;

  constructor(id: string, position: OwnershipPosition, value: string) {
    requireIdentity(id);
    if (!(position instanceof OwnershipPosition) || typeof value !== 'string') throw new Error('Invalid update');
    this.id = id;
    this.position = position;
    this.value = value;
    Object.freeze(this);
  }

  uses(state: StructuralAttachmentState): readonly string[] { return state.path(this.position); }
  deletes(): readonly string[] { return []; }
  writes(): readonly string[] { return [this.position.key]; }
  apply(state: StructuralAttachmentState) { return state.edit(this.position, this.value); }
}
