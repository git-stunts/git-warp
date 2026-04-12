/**
 * Internal helpers and constants shared by checkpoint creation and loading.
 *
 * @module domain/services/state/checkpointHelpers
 */

import { CONTENT_PROPERTY_KEY, decodePropKey, isEdgePropKey, decodeEdgePropKey } from '../KeyCodec.ts';
import type BlobPort from '../../../ports/BlobPort.ts';
import type TreePort from '../../../ports/TreePort.ts';

// ============================================================================
// Checkpoint Schema Constants
// ============================================================================

/**
 * Standard checkpoint schema — full V5 state without index tree.
 * Distinct from the patch schema namespace (PATCH_SCHEMA_V2/V3).
 */
export const CHECKPOINT_SCHEMA_STANDARD = 2;

/**
 * Intermediate V5 checkpoint schema — full state, no index tree.
 * Produced by older builds that incremented past STANDARD but
 * predated the index-tree layout.
 */
export const CHECKPOINT_SCHEMA_V5_INTERMEDIATE = 3;

/**
 * Index-tree checkpoint schema — full V5 state with bitmap index tree.
 * Distinct from the patch schema namespace (PATCH_SCHEMA_V2/V3).
 */
export const CHECKPOINT_SCHEMA_INDEX_TREE = 4;

/**
 * Returns true if the schema number identifies a valid V5 checkpoint.
 */
export function isV5CheckpointSchema(schema: number | undefined | null): boolean {
  return schema === CHECKPOINT_SCHEMA_STANDARD
    || schema === CHECKPOINT_SCHEMA_V5_INTERMEDIATE
    || schema === CHECKPOINT_SCHEMA_INDEX_TREE;
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
    paths.map((p) => persistence.writeBlob(indexTree[p] as Uint8Array))
  );

  const entries = paths.map(
    (path, i) => `100644 blob ${oids[i]}\t${path}`
  );
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
  propMap: Map<string, { eventId: unknown; value: unknown }>,
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

  for (let i = 0; i < sortedOids.length; i++) {
    const oid = sortedOids[i];
    sortedOids[i] = `040000 tree ${oid}\t_content_${oid}`;
  }

  return sortedOids;
}
