/**
 * Internal helpers and constants shared by checkpoint creation and loading.
 *
 * @module domain/services/state/checkpointHelpers
 */

import { CONTENT_PROPERTY_KEY, decodePropKey, isEdgePropKey, decodeEdgePropKey } from '../KeyCodec.ts';
import WarpError from '../../errors/WarpError.ts';
import type BlobPort from '../../../ports/BlobPort.ts';
import type TreePort from '../../../ports/TreePort.ts';

/** Current shipped checkpoint schema: envelope tree with state subtree. */
export const CURRENT_CHECKPOINT_SCHEMA = 5;

/** Supported shipped runtime checkpoint schemas. */
export const SUPPORTED_CHECKPOINT_SCHEMAS = [CURRENT_CHECKPOINT_SCHEMA] as const;

/**
 * Returns true when the schema number identifies the current runtime
 * checkpoint envelope.
 */
export function isCurrentCheckpointSchema(schema: number | undefined | null): boolean {
  return schema === CURRENT_CHECKPOINT_SCHEMA;
}

/**
 * Number of unique content blob OIDs to hold before folding a batch into the
 * accumulated sorted anchor list. This keeps checkpoint creation from building
 * one monolithic Set of every content blob reference before tree serialization.
 */
const CONTENT_ANCHOR_BATCH_SIZE = 256;

// ============================================================================
// Internal Helpers
// ============================================================================

/** Minimal persistence surface needed by writeIndexSubtree. */
export type IndexSubtreePersistence = Pick<BlobPort, 'writeBlob'> & Pick<TreePort, 'writeTree'>;

/**
 * Writes index tree shards as blobs and creates a subtree.
 */
export async function writeIndexSubtree(
  indexTree: Record<string, Uint8Array>,
  persistence: IndexSubtreePersistence,
): Promise<string> {
  const paths = Object.keys(indexTree).sort();
  const oids = await Promise.all(
    paths.map((path) => {
      const blob = indexTree[path];
      if (blob === undefined) {
        throw new WarpError(
          `Missing index blob for path: ${path}`,
          'E_CHECKPOINT_MISSING_INDEX_BLOB',
          { context: { path } },
        );
      }
      return persistence.writeBlob(blob);
    }),
  );

  const entries = paths.map((path, i) => {
    const oid = oids[i];
    if (oid === undefined) {
      throw new WarpError(
        `Missing index blob OID for path: ${path}`,
        'E_CHECKPOINT_MISSING_INDEX_BLOB_OID',
        { context: { path } },
      );
    }
    return `100644 blob ${oid}\t${path}`;
  });
  return await persistence.writeTree(entries);
}

/**
 * Partitions readTreeOids output into core entries and index shard OIDs.
 *
 * Entries prefixed with `index/` are stripped and collected separately.
 */
export function partitionTreeOids(rawOids: Record<string, string>): {
  treeOids: Record<string, string>;
  indexShardOids: Record<string, string>;
} {
  const treeOids: Record<string, string> = {};
  const indexShardOids: Record<string, string> = {};

  for (const [path, oid] of Object.entries(rawOids)) {
    if (path.startsWith('index/')) {
      indexShardOids[path.slice(6)] = oid;
    } else {
      treeOids[path] = oid;
    }
  }
  return { treeOids, indexShardOids };
}

/**
 * Compares git tree entry lines by path segment (content after the tab).
 */
export function compareTreeEntriesByPath(left: string, right: string): number {
  const leftPath = left.slice(left.indexOf('\t') + 1);
  const rightPath = right.slice(right.indexOf('\t') + 1);
  return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
}

/**
 * Merges two sorted string arrays into one sorted unique array.
 */
export function mergeSortedUniqueStrings(existing: string[], incoming: string[]): string[] {
  const merged: string[] = [];
  let i = 0;
  let j = 0;

  while (i < existing.length && j < incoming.length) {
    const left = existing[i] as string;
    const right = incoming[j] as string;
    if (left === right) {
      merged.push(left);
      i++;
      j++;
      continue;
    }
    if (left < right) {
      merged.push(left);
      i++;
      continue;
    }
    merged.push(right);
    j++;
  }

  while (i < existing.length) {
    merged.push(existing[i++] as string);
  }
  while (j < incoming.length) {
    merged.push(incoming[j++] as string);
  }

  return merged;
}

/**
 * Collects sorted, de-duplicated content blob anchor entries for a checkpoint
 * tree without holding all content OIDs in one monolithic Set at once.
 */
export function collectContentAnchorEntries(
  propMap: Map<string, { eventId: unknown; value: unknown }>, // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
): string[] {
  let sortedOids: string[] = [];
  let batch: Set<string> = new Set();

  const flushBatch = (): void => {
    if (batch.size === 0) {
      return;
    }
    const sortedBatch = Array.from(batch).sort();
    batch = new Set();
    sortedOids = mergeSortedUniqueStrings(sortedOids, sortedBatch);
  };

  for (const [propKey, register] of propMap) {
    const { propKey: decodedKey } = isEdgePropKey(propKey)
      ? decodeEdgePropKey(propKey)
      : decodePropKey(propKey);
    if (decodedKey !== CONTENT_PROPERTY_KEY || typeof register.value !== 'string') {
      continue;
    }
    batch.add(register.value);
    if (batch.size >= CONTENT_ANCHOR_BATCH_SIZE) {
      flushBatch();
    }
  }

  flushBatch();

  const anchorEntries: string[] = [];
  for (const oid of sortedOids) {
    anchorEntries.push(`100644 blob ${oid}\t_content_${oid}`);
  }

  return anchorEntries;
}
