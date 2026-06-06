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
    this.patches = freezePatches(fields.patches);
    this.cursor = normalizeCursor(fields.cursor);
    Object.freeze(this);
  }
}

function freezePatches(values: readonly BoundedSyncPatchDescriptor[]): readonly BoundedSyncPatchDescriptor[] {
  const patches: BoundedSyncPatchDescriptor[] = [];
  for (const value of values) {
    patches.push(Object.freeze({
      writerId: requireNonEmptyString(value.writerId, 'writerId'),
      sha: requireNonEmptyString(value.sha, 'sha'),
    }));
  }
  return Object.freeze(patches);
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
