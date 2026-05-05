/**
 * Internal mutable working types for incremental index updates.
 *
 * These are inflated representations of the frozen IndexShard artifacts.
 * The orchestrator loads artifacts via codec, inflates them into these
 * mutable forms, delegates mutations to IndexNodeUpdater/IndexEdgeUpdater,
 * then deflates back to artifacts for storage.
 *
 * @module domain/services/index/types
 */

import type { RoaringBitmapSubset } from '../../utils/roaring.ts';

/**
 * Mutable working representation of a meta shard.
 *
 * Inflated from the frozen MetaShard artifact with deserialized
 * bitmap and O(1) lookup maps built from the nodeToGlobal array.
 */
export type WorkingMetaShard = {
  readonly nodeToGlobal: Array<[string, number]>;
  nextLocalId: number;
  readonly aliveBitmap: RoaringBitmapSubset;
  readonly globalToNode: Map<number, string>;
  readonly nodeToGlobalMap: Map<string, number>;
};

/**
 * Mutable edge shard data keyed by bucket then globalId string.
 *
 * Bucket keys are either `"all"` (union of all labels) or a
 * numeric label ID as a string. Values are serialized roaring
 * bitmaps (Uint8Array) — roaring handles the wire format, not us.
 */
export type EdgeShardData = Record<string, Record<string, Uint8Array>>;
