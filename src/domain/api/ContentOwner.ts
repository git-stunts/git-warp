import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import { assertNoReservedBytes } from '../services/PatchBuilderValidation.ts';

export type ContentOwnerDescriptor =
  | Readonly<{ kind: 'node'; subject: string }>
  | Readonly<{ kind: 'edge'; from: string; to: string; label: string }>;

/** Validated, immutable node or edge identity for an attachment observation. */
export default class ContentOwner {
  readonly descriptor: ContentOwnerDescriptor;

  constructor(descriptor: ContentOwnerDescriptor | null | undefined) {
    if (descriptor === null || descriptor === undefined) {
      throw new WarpError('Content owner is required', 'E_CONTENT_OWNER');
    }
    this.descriptor = normalizeOwner(descriptor);
    Object.freeze(this);
  }
}

function normalizeOwner(descriptor: ContentOwnerDescriptor): ContentOwnerDescriptor {
  if (descriptor.kind === 'node') {
    const { subject } = descriptor;
    requireIdentity(subject, 'subject');
    return Object.freeze({ kind: 'node', subject });
  }
  if (descriptor.kind !== 'edge') {
    throw new WarpError('Content owner must identify a node or edge', 'E_CONTENT_OWNER');
  }
  const { from, to, label } = descriptor;
  requireIdentity(from, 'from');
  requireIdentity(to, 'to');
  requireIdentity(label, 'label');
  return Object.freeze({ kind: 'edge', from, to, label });
}

function requireIdentity(value: string, field: string): void {
  requireNonEmptyString(value, `content.owner.${field}`);
  assertNoReservedBytes(value, field);
}
