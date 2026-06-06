import MemoryBudgetError from '../../errors/MemoryBudgetError.ts';
import WarpMemoryPool from '../../memory/WarpMemoryPool.ts';
import BoundedSyncPatchBatch, { type BoundedSyncPatchDescriptor } from './BoundedSyncPatchBatch.ts';

export type BoundedSyncPatchSourceFactory = () => AsyncIterable<BoundedSyncPatchDescriptor>;

export type BoundedSyncPatchBatchReaderFields = {
  readonly openSource: BoundedSyncPatchSourceFactory;
  readonly pool: WarpMemoryPool;
};

export type BoundedSyncPatchBatchRequest = {
  readonly limit: number;
  readonly cursor?: string | null;
};

/** Cursorized bounded reader for sync patch descriptor streams. */
export default class BoundedSyncPatchBatchReader {
  private readonly _openSource: BoundedSyncPatchSourceFactory;
  private readonly _pool: WarpMemoryPool;

  constructor(fields: BoundedSyncPatchBatchReaderFields) {
    this._openSource = fields.openSource;
    this._pool = requireWarpMemoryPool(fields.pool);
    Object.freeze(this);
  }

  async readBatch(request: BoundedSyncPatchBatchRequest): Promise<BoundedSyncPatchBatch> {
    const limit = requirePositiveInteger(request.limit, 'limit');
    const start = cursorOffset(request.cursor ?? null);
    return await collectBatch({
      source: this._openSource(),
      pool: this._pool,
      start,
      limit,
    });
  }
}

type CollectBatchOptions = {
  readonly source: AsyncIterable<BoundedSyncPatchDescriptor>;
  readonly pool: WarpMemoryPool;
  readonly start: number;
  readonly limit: number;
};

async function collectBatch(options: CollectBatchOptions): Promise<BoundedSyncPatchBatch> {
  const patches: BoundedSyncPatchDescriptor[] = [];
  let index = 0;
  let cursor: string | null = null;
  for await (const patch of options.source) {
    const lease = options.pool.acquire({ scope: 'sync.patch.batch', amount: 1 });
    try {
      const control = appendPatch({ patches, patch, index, start: options.start, limit: options.limit });
      index = control.nextIndex;
      cursor = control.cursor;
    } finally {
      lease.release();
    }
    if (cursor !== null) {
      break;
    }
  }
  return new BoundedSyncPatchBatch({ patches, cursor });
}

type AppendPatchOptions = {
  readonly patches: BoundedSyncPatchDescriptor[];
  readonly patch: BoundedSyncPatchDescriptor;
  readonly index: number;
  readonly start: number;
  readonly limit: number;
};

function appendPatch(options: AppendPatchOptions): { readonly nextIndex: number; readonly cursor: string | null } {
  if (options.index < options.start) {
    return { nextIndex: options.index + 1, cursor: null };
  }
  if (options.patches.length >= options.limit) {
    return { nextIndex: options.index, cursor: options.index.toString() };
  }
  options.patches.push(options.patch);
  return { nextIndex: options.index + 1, cursor: null };
}

function cursorOffset(cursor: string | null): number {
  if (cursor === null) {
    return 0;
  }
  const parsed = Number.parseInt(cursor, 10);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed.toString() === cursor) {
    return parsed;
  }
  throw new MemoryBudgetError('Bounded sync patch batch cursor must be a non-negative integer string', {
    code: 'E_BOUNDED_SYNC_BATCH_INVALID',
    context: { field: 'cursor', value: cursor },
  });
}

function requirePositiveInteger(value: number, field: string): number {
  if (Number.isInteger(value) && value > 0) {
    return value;
  }
  throw new MemoryBudgetError('Bounded sync patch batch limit must be a positive integer', {
    code: 'E_BOUNDED_SYNC_BATCH_INVALID',
    context: { field, value },
  });
}

function requireWarpMemoryPool(value: WarpMemoryPool): WarpMemoryPool {
  if (value instanceof WarpMemoryPool) {
    return value;
  }
  throw new MemoryBudgetError('BoundedSyncPatchBatchReader requires a WarpMemoryPool', {
    code: 'E_MEMORY_BUDGET_INVALID',
    context: { field: 'pool' },
  });
}
