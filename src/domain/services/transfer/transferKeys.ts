/**
 * transferKeys — key encoding, comparators, and collectors shared across transfer planning.
 *
 * @module domain/services/transfer/transferKeys
 */

import {
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
} from '../KeyCodec.ts';
import { canonicalStringify } from '../../utils/canonicalStringify.ts';
import type { ContentMeta } from '../../types/ContentMeta.ts';
import type { VisibleStateReader } from '../../types/VisibleStateReader.ts';

export type { ContentMeta, VisibleStateReader };

export type EdgeRef = { from: string; to: string; label: string };

const ATTACHMENT_PROPERTY_KEYS = new Set([
  CONTENT_PROPERTY_KEY,
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
]);

/**
 * Lexicographic comparison for deterministic ordering.
 */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Produce a canonical string key for an arbitrary property value.
 */
export function valueKey(value: unknown): string { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return canonicalStringify(value);
}

/**
 * Produce a canonical string key for optional content metadata.
 */
export function contentMetaKey(meta: ContentMeta | null | undefined): string {
  return canonicalStringify(meta ?? null);
}

/**
 * Build a composite key for an edge triple.
 */
export function edgeKey(edge: EdgeRef): string {
  return `${edge.from}\0${edge.to}\0${edge.label}`;
}

/**
 * Collect all edges from a reader into a Map keyed by composite edge key.
 */
export function collectEdgeRefs(reader: VisibleStateReader): Map<string, EdgeRef> {
  return new Map(
    reader
      .getEdges()
      .map((edge) => [{ from: edge.from, to: edge.to, label: edge.label }])
      .flat()
      .map((edge) => [edgeKey(edge), edge]),
  );
}

/**
 * Merge and deduplicate property keys from two property bags, excluding attachment keys.
 */
export function propertyKeys(
  sourceProps: Record<string, unknown>, // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  targetProps: Record<string, unknown>, // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
): string[] {
  return [...new Set([...Object.keys(sourceProps), ...Object.keys(targetProps)])]
    .filter((key) => !ATTACHMENT_PROPERTY_KEYS.has(key))
    .sort(compareStrings);
}
