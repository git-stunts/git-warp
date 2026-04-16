/**
 * Frontier — tracks the last-seen patch SHA per writer.
 *
 * A Frontier is the convergence boundary: it tells you which
 * patches from each writer have been incorporated into the
 * materialized state.
 *
 * @module domain/services/Frontier
 */

import type CodecPort from '../../ports/CodecPort.ts';
import defaultCodec from '../utils/defaultCodec.ts';

class Frontier {
  private readonly _entries: Map<string, string>;

  constructor(entries?: Iterable<[string, string]>) {
    this._entries = entries ? new Map<string, string>(entries) : new Map<string, string>();
  }

  /** Updates the frontier with a new writer→patchSha mapping. */
  set(writerId: string, patchSha: string): void {
    this._entries.set(writerId, patchSha);
  }

  /** Gets the last-seen patch SHA for a writer. */
  get(writerId: string): string | undefined {
    return this._entries.get(writerId);
  }

  /** Whether the frontier contains an entry for this writer. */
  has(writerId: string): boolean {
    return this._entries.has(writerId);
  }

  /** Number of writers in the frontier. */
  get size(): number {
    return this._entries.size;
  }

  /** Sorted list of writer IDs. */
  writers(): string[] {
    return Array.from(this._entries.keys()).sort();
  }

  /** Iterate over [writerId, patchSha] entries. */
  entries(): IterableIterator<[string, string]> {
    return this._entries.entries();
  }

  /** Iterate over writer IDs. */
  keys(): IterableIterator<string> {
    return this._entries.keys();
  }

  /** Creates a shallow copy. */
  clone(): Frontier {
    return new Frontier(this._entries);
  }

  /**
   * Deterministic fingerprint for snapshot isolation checks.
   * Two frontiers produce the same fingerprint iff they have
   * identical writer→SHA mappings.
   */
  fingerprint(): string {
    const sorted = [...this._entries.entries()].sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
    );
    return JSON.stringify(sorted);
  }

  /**
   * Merges another frontier into this one.
   * Entries from `other` overwrite entries in `this`.
   * Returns a new Frontier (does not mutate).
   */
  merge(other: Frontier): Frontier {
    const merged = this.clone();
    for (const [writerId, patchSha] of other.entries()) {
      merged.set(writerId, patchSha);
    }
    return merged;
  }

  /**
   * Serializes to canonical CBOR bytes.
   * Keys are sorted for determinism.
   *
   * NOTE: CBOR encoding in domain code is a known boundary violation.
   * Kept here because frontier serialization is tightly coupled to
   * CheckpointService. Will move to adapter when CheckpointService
   * converts (Wave 4).
   */
  serialize(codec?: CodecPort): Uint8Array {
    const c = codec ?? defaultCodec;
    const obj: Record<string, string> = {};
    for (const key of this.writers()) {
      const val = this._entries.get(key);
      if (val !== undefined) {
        obj[key] = val;
      }
    }
    return c.encode(obj);
  }

  /**
   * Deserializes from CBOR bytes.
   * Same boundary violation note as serialize().
   */
  static deserialize(buffer: Uint8Array, codec?: CodecPort): Frontier {
    const c = codec ?? defaultCodec;
    const obj = c.decode<Record<string, string>>(buffer);
    const frontier = new Frontier();
    for (const [writerId, patchSha] of Object.entries(obj)) {
      frontier.set(writerId, patchSha);
    }
    return frontier;
  }
}

// -- Backward-compatible free function exports --------------------------------
// These wrap the class for existing callers. Remove when callers migrate.

function createFrontier(): Map<string, string> {
  return new Map();
}

function updateFrontier(frontier: Map<string, string>, writerId: string, patchSha: string): void {
  frontier.set(writerId, patchSha);
}

function getFrontierEntry(frontier: Map<string, string>, writerId: string): string | undefined {
  return frontier.get(writerId);
}

function getWriters(frontier: Map<string, string>): string[] {
  return Array.from(frontier.keys()).sort();
}

function serializeFrontier(
  frontier: Map<string, string>,
  opts: { codec?: CodecPort } = {},
): Uint8Array {
  return new Frontier(frontier).serialize(opts.codec);
}

function deserializeFrontier(
  buffer: Uint8Array,
  opts: { codec?: CodecPort } = {},
): Map<string, string> {
  const f = Frontier.deserialize(buffer, opts.codec);
  const map = new Map<string, string>();
  for (const [k, v] of f.entries()) {
    map.set(k, v);
  }
  return map;
}

function cloneFrontier(frontier: Map<string, string>): Map<string, string> {
  return new Map(frontier);
}

function frontierFingerprint(frontier: Map<string, string>): string {
  return new Frontier(frontier).fingerprint();
}

function mergeFrontiers(a: Map<string, string>, b: Map<string, string>): Map<string, string> {
  const merged = new Map(a);
  for (const [writerId, patchSha] of b) {
    merged.set(writerId, patchSha);
  }
  return merged;
}

export {
  Frontier,
  createFrontier,
  updateFrontier,
  getFrontierEntry,
  getWriters,
  serializeFrontier,
  deserializeFrontier,
  cloneFrontier,
  frontierFingerprint,
  mergeFrontiers,
};
