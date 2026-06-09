/**
 * PatchBuilderValidation — shared validation and content metadata helpers
 * for the PatchBuilder family.
 *
 * @module domain/services/PatchBuilderValidation
 */

import { FIELD_SEPARATOR, EDGE_PROP_PREFIX } from './KeyCodec.ts';
import PatchError from '../errors/PatchError.ts';
import type { WarpState } from './JoinReducer.ts';
import WarpStateClass from './state/WarpState.ts';

/**
 * Inspects materialized state for edges and properties attached to a node.
 * Used by `removeNode` to detect attached data before deletion.
 */
export function findAttachedData(
  state: WarpState,
  nodeId: string,
): { edges: string[]; props: string[]; hasData: boolean } {
  const edges: string[] = [];
  const props: string[] = [];

  const srcPrefix = `${nodeId}\0`;
  const tgtInfix = `\0${nodeId}\0`;
  for (const key of state.edgeAlive.elements()) {
    if (key.startsWith(srcPrefix) || key.includes(tgtInfix)) {
      edges.push(key);
    }
  }

  const propPrefix = `${nodeId}\0`;
  for (const [key] of WarpStateClass.allPropEntriesFromState(state)) {
    if (key.startsWith(propPrefix)) {
      props.push(key);
    }
  }

  return { edges, props, hasData: edges.length > 0 || props.length > 0 };
}

/**
 * Validates that an identifier does not contain reserved bytes that would
 * make the legacy edge-property encoding ambiguous.
 */
export function assertNoReservedBytes(value: string, label: string): void {
  if (typeof value !== 'string') {
    throw new PatchError(
      `${label} must be a string, got ${typeof value}`,
      { code: 'E_PATCH_IDENTIFIER_TYPE', context: { label, actual: typeof value } },
    );
  }
  if (value.includes(FIELD_SEPARATOR)) {
    throw new PatchError(
      `${label} must not contain null bytes (\\0): ${JSON.stringify(value)}`, // nosemgrep: ts-no-json-stringify-in-core -- 0025B
      { code: 'E_PATCH_IDENTIFIER_NULL_BYTE', context: { label } },
    );
  }
  if (value.length > 0 && value[0] === EDGE_PROP_PREFIX) {
    throw new PatchError(
      `${label} must not start with reserved prefix \\x01: ${JSON.stringify(value)}`, // nosemgrep: ts-no-json-stringify-in-core -- 0025B
      { code: 'E_PATCH_IDENTIFIER_RESERVED_PREFIX', context: { label } },
    );
  }
}

export function assertObservedDotsForRemove(
  observedDots: readonly string[],
  targetKind: 'node' | 'edge',
  context: { readonly nodeId?: string; readonly edgeKey?: string },
): void {
  if (observedDots.length > 0) { return; }
  const target = targetKind === 'node' ? context.nodeId : context.edgeKey;
  throw new PatchError(
    `Cannot remove missing ${targetKind} '${target ?? 'unresolved'}': entity is not alive in current state`,
    { code: 'E_PATCH_ENTITY_NOT_FOUND', context: { targetKind, ...context } },
  );
}

/**
 * Calculates the persisted byte length of attached content.
 */
export function byteSizeOfContent(content: Uint8Array | string): number {
  return typeof content === 'string'
    ? new TextEncoder().encode(content).byteLength
    : content.byteLength;
}

/**
 * Validates and normalizes optional content metadata for attachment APIs.
 */
export function normalizeContentMetadata(
  content: Uint8Array | string,
  metadata: { mime?: string | null; size?: number | null } | undefined,
): { mime: string | null; size: number } {
  if (metadata !== undefined && (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata))) {
    throw new PatchError(
      'content metadata must be an object when provided',
      { code: 'E_PATCH_CONTENT_METADATA_TYPE' },
    );
  }

  const actualSize = byteSizeOfContent(content);
  const providedSize = metadata?.size;
  if (providedSize !== undefined && providedSize !== null) {
    if (!Number.isInteger(providedSize) || providedSize < 0) {
      throw new PatchError(
        'content metadata size must be a non-negative integer',
        { code: 'E_PATCH_CONTENT_SIZE_TYPE', context: { providedSize } },
      );
    }
    if (providedSize !== actualSize) {
      throw new PatchError(
        `content metadata size ${providedSize} does not match actual byte size ${actualSize}`,
        { code: 'E_PATCH_CONTENT_SIZE_MISMATCH', context: { providedSize, actualSize } },
      );
    }
  }

  const providedMime = metadata?.mime;
  if (providedMime !== undefined && providedMime !== null) {
    if (typeof providedMime !== 'string' || providedMime.trim() === '') {
      throw new PatchError(
        'content metadata mime must be a non-empty string when provided',
        { code: 'E_PATCH_CONTENT_MIME_TYPE' },
      );
    }
  }

  return {
    mime: typeof providedMime === 'string' ? providedMime : null,
    size: actualSize,
  };
}
