/**
 * Internal helpers and constants shared by checkpoint creation and loading.
 *
 * @module domain/services/state/checkpointHelpers
 */

import { CONTENT_PROPERTY_KEY, decodePropKey, isEdgePropKey, decodeEdgePropKey } from '../KeyCodec.ts';
import WarpError from '../../errors/WarpError.ts';
import type BlobPort from '../../../ports/BlobPort.ts';
import type TreePort from '../../../ports/TreePort.ts';

// ============================================================================
// Checkpoint Schema Constants
// ============================================================================

/** Legacy full-state checkpoint schema without index tree. */
export const CHECKPOINT_SCHEMA_LEGACY_STANDARD = 2;

/** Legacy intermediate V5 checkpoint schema without index tree. */
export const CHECKPOINT_SCHEMA_LEGACY_V5_INTERMEDIATE = 3;

/** Legacy index-tree checkpoint schema. */
export const CHECKPOINT_SCHEMA_LEGACY_INDEX_TREE = 4;

/** Current shipped v17 checkpoint schema: envelope tree with state subtree. */
export const CURRENT_CHECKPOINT_SCHEMA = 5;

/** Supported shipped runtime checkpoint schemas. */
export const SUPPORTED_CHECKPOINT_SCHEMAS = [CURRENT_CHECKPOINT_SCHEMA] as const;

/** Legacy checkpoint schemas accepted by migration tooling, not shipped runtime. */
export const REJECTED_LEGACY_CHECKPOINT_SCHEMAS = [
  CHECKPOINT_SCHEMA_LEGACY_STANDARD,
  CHECKPOINT_SCHEMA_LEGACY_V5_INTERMEDIATE,
  CHECKPOINT_SCHEMA_LEGACY_INDEX_TREE,
] as const;

/**
 * Compatibility export for older call sites. In shipped v17, the standard
 * checkpoint schema is the current envelope-tree schema.
 */
export const CHECKPOINT_SCHEMA_STANDARD = CURRENT_CHECKPOINT_SCHEMA;

/**
 * Compatibility export for older call sites. Index-bearing checkpoints still
 * use the same schema-5 envelope; the index subtree is a layout entry.
 */
export const CHECKPOINT_SCHEMA_INDEX_TREE = CURRENT_CHECKPOINT_SCHEMA;

/**
 * Returns true if the schema number identifies a valid V5 checkpoint.
 */
export function isV5CheckpointSchema(schema: number | undefined | null): boolean {
  return schema === CURRENT_CHECKPOINT_SCHEMA;
}

export function isRejectedLegacyCheckpointSchema(schema: number | undefined | null): boolean {
  return REJECTED_LEGACY_CHECKPOINT_SCHEMAS.some((legacySchema) => legacySchema === schema);
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

  const anchorEntries: string[] = [];
  for (const oid of sortedOids) {
    anchorEntries.push(`040000 tree ${oid}\t_content_${oid}`);
  }

  return anchorEntries;
}
