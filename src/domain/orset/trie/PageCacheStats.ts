import PageCacheError from "../../errors/PageCacheError.ts";

export interface PageCacheStatsInit {
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly resident: number;
  readonly maxResident: number;
}

/**
 * Immutable snapshot of page-cache counters.
 */
export default class PageCacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly resident: number;
  readonly maxResident: number;

  constructor(init: PageCacheStatsInit) {
    this.hits = validateCounter(init.hits, "hits");
    this.misses = validateCounter(init.misses, "misses");
    this.evictions = validateCounter(init.evictions, "evictions");
    this.resident = validateCounter(init.resident, "resident");
    this.maxResident = validatePositiveInteger(
      init.maxResident,
      "maxResident",
    );
    if (this.resident > this.maxResident) {
      throw new PageCacheError(
        `PageCacheStats resident=${String(this.resident)} exceeds maxResident=${String(this.maxResident)}`,
        {
          code: "E_PAGE_CACHE_STATS",
          context: {
            resident: this.resident,
            maxResident: this.maxResident,
          },
        },
      );
    }
    Object.freeze(this);
  }
}

function validateCounter(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new PageCacheError(
      `PageCacheStats ${label} must be a non-negative integer; received ${String(value)}`,
      {
        code: "E_PAGE_CACHE_STATS",
        context: { label, value },
      },
    );
  }
  return value;
}

function validatePositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new PageCacheError(
      `PageCacheStats ${label} must be a positive integer; received ${String(value)}`,
      {
        code: "E_PAGE_CACHE_STATS",
        context: { label, value },
      },
    );
  }
  return value;
}
