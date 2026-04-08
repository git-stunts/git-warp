/**
 * Port interface for seek materialization cache operations.
 *
 * Defines the contract for caching and retrieving serialized WarpStateV5
 * snapshots keyed by (ceiling, frontier) tuples. Used by the seek time-travel
 * feature to avoid full re-materialization for previously-visited ticks.
 *
 * Concrete adapters (e.g., CasSeekCacheAdapter) implement this interface
 * to store cached states in different backends (git-cas, filesystem, etc.).
 */

export interface SeekCacheEntry {
  buffer: Uint8Array;
  indexTreeOid?: string;
}

export interface SeekCacheSetOptions {
  indexTreeOid?: string;
}

/** Port for seek materialization cache operations. */
export default abstract class SeekCachePort {
  /** Retrieves a cached state buffer by key, or null on miss. */
  abstract get(_key: string): Promise<SeekCacheEntry | null>;

  /** Stores a state buffer under the given key. */
  abstract set(_key: string, _buffer: Uint8Array, _options?: SeekCacheSetOptions): Promise<void>;

  /** Checks whether a key exists in the cache. */
  abstract has(_key: string): Promise<boolean>;

  /**
   * Lists all keys currently in the cache index.
   * Note: keys may reference GC'd blobs; callers should handle miss on get().
   */
  abstract keys(): Promise<string[]>;

  /** Removes a single entry from the cache. Returns true if the entry existed. */
  abstract delete(_key: string): Promise<boolean>;

  /** Removes all entries from the cache. */
  abstract clear(): Promise<void>;
}
