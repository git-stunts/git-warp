import MemoryBudgetError from '../../errors/MemoryBudgetError.ts';

export type BoundedSyncPatchDescriptor = {
  readonly writerId: string;
  readonly sha: string;
};

export type BoundedSyncPatchBatchFields = {
  readonly patches: readonly BoundedSyncPatchDescriptor[];
  readonly cursor: string | null;
};

/** Immutable sync patch page with a deterministic resume cursor. */
export default class BoundedSyncPatchBatch {
  readonly patches: readonly BoundedSyncPatchDescriptor[];
  readonly cursor: string | null;

  constructor(fields: BoundedSyncPatchBatchFields) {
    const validFields = requireBatchFields(fields);
    this.patches = freezePatches(validFields.patches);
    this.cursor = normalizeCursor(validFields.cursor);
    Object.freeze(this);
  }
}

function requireBatchFields(
  fields: BoundedSyncPatchBatchFields | null | undefined,
): BoundedSyncPatchBatchFields {
  if (fields !== null && typeof fields === 'object') {
    return fields;
  }
  throw new MemoryBudgetError('Bounded sync patch batch requires object fields', {
    code: 'E_BOUNDED_SYNC_BATCH_INVALID',
    context: { field: 'fields' },
  });
}

function freezePatches(values: readonly BoundedSyncPatchDescriptor[]): readonly BoundedSyncPatchDescriptor[] {
  if (!Array.isArray(values)) {
    throw new MemoryBudgetError('Bounded sync patch batch requires a patch array', {
      code: 'E_BOUNDED_SYNC_BATCH_INVALID',
      context: { field: 'patches' },
    });
  }
  const patches: BoundedSyncPatchDescriptor[] = [];
  let index = 0;
  for (const value of values) {
    const descriptor = requirePatchDescriptor(value, `patches.${index}`);
    patches.push(Object.freeze({
      writerId: requireNonEmptyString(descriptor.writerId, 'writerId'),
      sha: requireNonEmptyString(descriptor.sha, 'sha'),
    }));
    index += 1;
  }
  return Object.freeze(patches);
}

function requirePatchDescriptor(
  value: BoundedSyncPatchDescriptor,
  field: string,
): BoundedSyncPatchDescriptor {
  if (value !== null && typeof value === 'object') {
    return value;
  }
  throw new MemoryBudgetError('Bounded sync patch descriptors must be objects', {
    code: 'E_BOUNDED_SYNC_BATCH_INVALID',
    context: { field },
  });
}

function normalizeCursor(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  throw new MemoryBudgetError('Bounded sync patch batch cursor must be non-empty or null', {
    code: 'E_BOUNDED_SYNC_BATCH_INVALID',
    context: { field: 'cursor' },
  });
}

function requireNonEmptyString(value: string, field: string): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  throw new MemoryBudgetError('Bounded sync patch descriptor fields must be non-empty', {
    code: 'E_BOUNDED_SYNC_BATCH_INVALID',
    context: { field },
  });
}
