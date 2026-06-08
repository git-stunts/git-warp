import MemoryBudgetError from '../../errors/MemoryBudgetError.ts';
import type MemoryBudgetLease from '../../memory/MemoryBudgetLease.ts';
import WarpMemoryPool from '../../memory/WarpMemoryPool.ts';
import BoundedSyncPatchBatch, { type BoundedSyncPatchDescriptor } from './BoundedSyncPatchBatch.ts';

const SYNC_PATCH_BATCH_LEASE_SCOPE = 'sync.patch.batch';
const SYNC_PATCH_BATCH_LEASE_AMOUNT = 1;
const SYNC_PATCH_BATCH_READ_AHEAD_INCREMENT = 1;

export type BoundedSyncPatchSourceRequest = {
  readonly cursor: string | null;
  readonly limit: number;
};

export type BoundedSyncPatchSourceFactory = (
  request: BoundedSyncPatchSourceRequest,
) => AsyncIterable<BoundedSyncPatchDescriptor>;

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
    const validFields = requireReaderFields(fields);
    this._openSource = requireOpenSource(validFields.openSource);
    this._pool = requireWarpMemoryPool(validFields.pool);
    Object.freeze(this);
  }

  async readBatch(request: BoundedSyncPatchBatchRequest): Promise<BoundedSyncPatchBatch> {
    const validRequest = requireBatchRequest(request);
    const limit = requirePositiveInteger(validRequest.limit, 'limit');
    const cursor = normalizeCursor(validRequest.cursor ?? null);
    return await collectBatch({
      source: this._openSource({ cursor, limit: readAheadLimit(limit) }),
      pool: this._pool,
      start: cursorOffset(cursor),
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
  const leases: MemoryBudgetLease[] = [];
  let index = options.start;
  let cursor: string | null = null;
  try {
    for await (const patch of options.source) {
      if (patches.length >= options.limit) {
        cursor = index.toString();
        break;
      }
      leases.push(options.pool.acquire({
        scope: SYNC_PATCH_BATCH_LEASE_SCOPE,
        amount: SYNC_PATCH_BATCH_LEASE_AMOUNT,
      }));
      const control = appendPatch({ patches, patch, index, limit: options.limit });
      index = control.nextIndex;
      cursor = control.cursor;
      if (cursor !== null) {
        break;
      }
    }
    return new BoundedSyncPatchBatch({ patches, cursor });
  } finally {
    for (const lease of leases) {
      lease.release();
    }
  }
}

type AppendPatchOptions = {
  readonly patches: BoundedSyncPatchDescriptor[];
  readonly patch: BoundedSyncPatchDescriptor;
  readonly index: number;
  readonly limit: number;
};

function appendPatch(options: AppendPatchOptions): { readonly nextIndex: number; readonly cursor: string | null } {
  if (options.patches.length >= options.limit) {
    return { nextIndex: options.index, cursor: options.index.toString() };
  }
  options.patches.push(options.patch);
  return { nextIndex: options.index + 1, cursor: null };
}

function normalizeCursor(cursor: string | null): string | null {
  cursorOffset(cursor);
  return cursor;
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

function readAheadLimit(limit: number): number {
  return limit + SYNC_PATCH_BATCH_READ_AHEAD_INCREMENT;
}

function requireReaderFields(
  fields: BoundedSyncPatchBatchReaderFields | null | undefined,
): BoundedSyncPatchBatchReaderFields {
  if (fields !== null && typeof fields === 'object') {
    return fields;
  }
  throw new MemoryBudgetError('BoundedSyncPatchBatchReader requires object fields', {
    code: 'E_BOUNDED_SYNC_BATCH_INVALID',
    context: { field: 'fields' },
  });
}

function requireBatchRequest(
  request: BoundedSyncPatchBatchRequest | null | undefined,
): BoundedSyncPatchBatchRequest {
  if (request !== null && typeof request === 'object') {
    return request;
  }
  throw new MemoryBudgetError('Bounded sync patch batch request must be an object', {
    code: 'E_BOUNDED_SYNC_BATCH_INVALID',
    context: { field: 'request' },
  });
}

function requireOpenSource(value: BoundedSyncPatchSourceFactory): BoundedSyncPatchSourceFactory {
  if (typeof value === 'function') {
    return value;
  }
  throw new MemoryBudgetError('BoundedSyncPatchBatchReader requires an openSource function', {
    code: 'E_BOUNDED_SYNC_BATCH_INVALID',
    context: { field: 'openSource' },
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
