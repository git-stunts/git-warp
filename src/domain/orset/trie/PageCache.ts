import PageCacheError from "../../errors/PageCacheError.ts";

import TrieBranch from "./TrieBranch.ts";
import TrieLeaf from "./TrieLeaf.ts";
import PageCacheStats from "./PageCacheStats.ts";

export interface PageCacheInit {
  readonly maxResident: number;
}

type TriePage = TrieLeaf | TrieBranch;

/**
 * Count-bounded in-memory LRU over persisted trie pages keyed by OID.
 */
export default class PageCache {
  readonly #maxResident: number;
  readonly #pages = new Map<string, TriePage>();
  #hits = 0;
  #misses = 0;
  #evictions = 0;

  constructor(init: PageCacheInit) {
    this.#maxResident = validateMaxResident(init.maxResident);
    Object.freeze(this);
  }

  get(oid: string): TriePage | null {
    const existing = this.#pages.get(oid);
    if (existing === undefined) {
      this.#misses += 1;
      return null;
    }
    this.#hits += 1;
    this.#pages.delete(oid);
    this.#pages.set(oid, existing);
    return existing;
  }

  put(oid: string, page: TriePage): void {
    validateOid(oid);
    validatePage(page);
    if (isPendingOid(oid)) {
      throw new PageCacheError(
        `PageCache cannot store pending oid ${oid}`,
        { code: "E_PAGE_CACHE_PENDING", context: { oid } },
      );
    }
    this.#pages.delete(oid);
    this.#pages.set(oid, page);
    this.#evictOverflow();
  }

  stats(): PageCacheStats {
    return new PageCacheStats({
      hits: this.#hits,
      misses: this.#misses,
      evictions: this.#evictions,
      resident: this.#pages.size,
      maxResident: this.#maxResident,
    });
  }

  #evictOverflow(): void {
    while (this.#pages.size > this.#maxResident) {
      const eldestKey = this.#pages.keys().next().value;
      if (eldestKey === undefined) {
        return;
      }
      this.#pages.delete(eldestKey);
      this.#evictions += 1;
    }
  }
}

function validateMaxResident(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new PageCacheError(
      `PageCache maxResident must be a positive integer; received ${String(value)}`,
      {
        code: "E_PAGE_CACHE_INPUT",
        context: { maxResident: value },
      },
    );
  }
  return value;
}

function validateOid(oid: string): void {
  if (typeof oid !== "string" || oid.length === 0) {
    throw new PageCacheError(
      `PageCache oid must be a non-empty string; received ${String(oid)}`,
      {
        code: "E_PAGE_CACHE_INPUT",
        context: { oid },
      },
    );
  }
}

function validatePage(page: TriePage): void {
  if (!(page instanceof TrieLeaf) && !(page instanceof TrieBranch)) {
    throw new PageCacheError(
      "PageCache page must be a TrieLeaf or TrieBranch instance",
      { code: "E_PAGE_CACHE_INPUT" },
    );
  }
}

function isPendingOid(oid: string): boolean {
  return oid.startsWith("pending:");
}
