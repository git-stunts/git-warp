import ConeRecordError from '../../domain/errors/ConeRecordError.ts';
import type GitFastImportTreeScript from './GitFastImportTreeScript.ts';
import type { GitTreeObjectEntry } from './GitTreeObjectEntry.ts';

/** Records a bucket directory holds before it splits into 16 digit directories. */
export const CONE_TRIE_BUCKET_RECORDS = 32;
const ROUTE_PATTERN = /^[0-9a-f]{64}$/u;
const DIGIT_PATTERN = /^[0-9a-f]$/u;

/** Reads one tree object's entries; the record store reads them through a cached object session. */
export type GitTreeReader = (treeOid: string) => Promise<readonly GitTreeObjectEntry[]>;

/** A record to place: new content, or an existing blob moved by a split. */
type Placement = { readonly content: Uint8Array } | { readonly blobOid: string };

/**
 * One record family of the cone trie (layout 2): an adaptive 16-way trie on
 * the record route's hex digits.
 *
 * A directory at depth `d` is a **bucket** of record blobs named by their
 * full route while at most `CONE_TRIE_BUCKET_RECORDS` records share its
 * route prefix, and otherwise a **branch** of subdirectories named by the
 * route's digit `d`. Records are only added or replaced, never removed, so
 * the shape is a function of the set of routes, not of insertion order.
 * Every directory stays at most 32 entries, so placing a record rewrites a
 * few small trees instead of two 256-entry levels.
 */
export default class GitConeRecordTrie {
  readonly #readTree: GitTreeReader;

  constructor(readTree: GitTreeReader) {
    this.#readTree = readTree;
  }

  /** The blob holding `route` under the family directory `treeOid`, or null. */
  async locate(treeOid: string, route: string): Promise<string | null> {
    let directory = treeOid;
    // A route has 64 digits, so the walk ends by depth 64 at the latest: no entry is named ''.
    for (let depth = 0; ; depth += 1) {
      const entries = await this.#readTree(directory);
      const record = entries.find((entry) => entry.name === route);
      if (record !== undefined) {
        return requireType(record, 'blob');
      }
      const child = entries.find((entry) => entry.name === route.charAt(depth));
      if (child === undefined) {
        return null;
      }
      directory = requireType(child, 'tree');
    }
  }

  /**
   * Adds commands to `script` that place `records` (route → encoded record)
   * in the family directory at `path`, whose current tree is `treeOid`
   * (null: the family is empty). Untouched directories stay shared.
   */
  async place(
    script: GitFastImportTreeScript,
    directory: { readonly path: string; readonly treeOid: string | null },
    records: ReadonlyMap<string, Uint8Array>,
  ): Promise<void> {
    for (const route of records.keys()) {
      if (!ROUTE_PATTERN.test(route)) {
        throw new ConeRecordError('Cone trie route must be 64 lowercase hex characters', { context: { route } });
      }
    }
    await this.#update(script, { ...directory, depth: 0 }, records);
  }

  async #update(
    script: GitFastImportTreeScript,
    directory: { readonly path: string; readonly treeOid: string | null; readonly depth: number },
    records: ReadonlyMap<string, Uint8Array>,
  ): Promise<void> {
    const entries = directory.treeOid === null ? [] : await this.#readTree(directory.treeOid);
    if (entries.some((entry) => entry.type === 'tree')) {
      await this.#updateBranch(script, { path: directory.path, depth: directory.depth, entries }, records);
    } else {
      updateBucket(script, { ...directory, stored: bucketBlobs(entries) }, records);
    }
  }

  async #updateBranch(
    script: GitFastImportTreeScript,
    directory: { readonly path: string; readonly depth: number; readonly entries: readonly GitTreeObjectEntry[] },
    records: ReadonlyMap<string, Uint8Array>,
  ): Promise<void> {
    const children = branchChildren(directory.entries);
    for (const [digit, group] of groupByDigit(records, directory.depth)) {
      const childDirectory = { path: `${directory.path}/${digit}`, treeOid: children.get(digit) ?? null, depth: directory.depth + 1 };
      await this.#update(script, childDirectory, group);
    }
  }
}

/** Writes into a bucket that has room, or splits it into digit directories when it overflows. */
function updateBucket(
  script: GitFastImportTreeScript,
  bucket: { readonly path: string; readonly treeOid: string | null; readonly depth: number; readonly stored: ReadonlyMap<string, string> },
  records: ReadonlyMap<string, Uint8Array>,
): void {
  const routes = new Set([...bucket.stored.keys(), ...records.keys()]);
  if (routes.size <= CONE_TRIE_BUCKET_RECORDS) {
    for (const [route, content] of records) {
      script.write(`${bucket.path}/${route}`, content);
    }
    return;
  }
  if (bucket.treeOid !== null) {
    script.remove(bucket.path);
  }
  const placements = new Map<string, Placement>([...bucket.stored].map(([route, blobOid]) => [route, { blobOid }]));
  for (const [route, content] of records) {
    placements.set(route, { content });
  }
  placeSplit(script, { path: bucket.path, depth: bucket.depth }, placements);
}

/** The digit subdirectories of a branch directory, refusing anything else in it. */
function branchChildren(entries: readonly GitTreeObjectEntry[]): Map<string, string> {
  const children = new Map<string, string>();
  for (const entry of entries) {
    if (!DIGIT_PATTERN.test(entry.name)) {
      throw corrupt('Cone trie branch holds an entry that is not a digit directory', { name: entry.name });
    }
    children.set(entry.name, requireType(entry, 'tree'));
  }
  return children;
}

/** Places records into fresh directories, splitting every group larger than a bucket. */
function placeSplit(
  script: GitFastImportTreeScript,
  directory: { readonly path: string; readonly depth: number },
  placements: ReadonlyMap<string, Placement>,
): void {
  for (const [digit, group] of groupByDigit(placements, directory.depth)) {
    const path = `${directory.path}/${digit}`;
    if (group.size > CONE_TRIE_BUCKET_RECORDS) {
      placeSplit(script, { path, depth: directory.depth + 1 }, group);
      continue;
    }
    for (const [route, placement] of group) {
      if ('content' in placement) {
        script.write(`${path}/${route}`, placement.content);
      } else {
        script.link(`${path}/${route}`, placement.blobOid);
      }
    }
  }
}

function groupByDigit<TValue>(values: ReadonlyMap<string, TValue>, depth: number): Map<string, Map<string, TValue>> {
  const groups = new Map<string, Map<string, TValue>>();
  for (const [route, value] of values) {
    const digit = route.charAt(depth);
    const group = groups.get(digit) ?? new Map<string, TValue>();
    group.set(route, value);
    groups.set(digit, group);
  }
  return groups;
}

/** The record blobs of a bucket directory, by route. */
function bucketBlobs(entries: readonly GitTreeObjectEntry[]): Map<string, string> {
  const blobs = new Map<string, string>();
  for (const entry of entries) {
    if (!ROUTE_PATTERN.test(entry.name)) {
      throw corrupt('Cone trie bucket holds an entry that is not a record route', { name: entry.name });
    }
    blobs.set(entry.name, requireType(entry, 'blob'));
  }
  return blobs;
}

function requireType(entry: GitTreeObjectEntry, type: 'blob' | 'tree'): string {
  if (entry.type !== type) {
    throw corrupt(`Cone trie entry ${entry.name} is a ${entry.type}, not a ${type}`, { name: entry.name });
  }
  return entry.oid;
}

function corrupt(message: string, context: Readonly<Record<string, string>>): ConeRecordError {
  return new ConeRecordError(message, { code: 'E_CONE_RECORD_CORRUPT', context });
}
