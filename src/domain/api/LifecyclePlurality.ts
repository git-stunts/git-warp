import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import type { PluralityCausality } from './PluralityCausality.ts';

/** The node or edge a lifecycle plurality is about. */
export type LifecycleElement =
  | Readonly<{ kind: 'node'; subject: string }>
  | Readonly<{ kind: 'edge'; from: string; to: string; label: string }>;

type LifecyclePluralityFields = Readonly<{
  element: LifecycleElement;
  removedBy: readonly string[];
  editedBy: readonly string[];
  overflow: number;
  causality: PluralityCausality;
}>;

/**
 * A delete that raced an edit (#1039): writers in `removedBy` removed the
 * element while writers in `editedBy` added or edited it, and neither side
 * observed the other. The Reading still reports what the CRDT join decided
 * (an observed remove hides a concurrent edit; a concurrent add survives a
 * remove); this says which side was lost.
 */
export default class LifecyclePlurality {
  readonly kind: 'lifecycle' = 'lifecycle';
  readonly element: LifecycleElement;
  readonly removedBy: readonly string[];
  readonly editedBy: readonly string[];
  readonly overflow: number;
  readonly causality: PluralityCausality;

  constructor(fields: LifecyclePluralityFields) {
    if (fields.removedBy.length === 0 || fields.editedBy.length === 0) {
      throw new WarpError('Lifecycle plurality needs both a remove and an edit', 'E_PLURALITY');
    }
    for (const writer of [...fields.removedBy, ...fields.editedBy]) {
      requireNonEmptyString(writer, 'lifecyclePlurality.writer');
    }
    this.element = Object.freeze({ ...fields.element });
    this.removedBy = Object.freeze([...fields.removedBy]);
    this.editedBy = Object.freeze([...fields.editedBy]);
    this.overflow = fields.overflow;
    this.causality = fields.causality;
    Object.freeze(this);
  }
}
