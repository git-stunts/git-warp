/**
 * Schema version detection and compatibility validation for WARP messages.
 */

import { EDGE_PROP_PREFIX } from '../KeyCodec.ts';
import SchemaUnsupportedError from '../../errors/SchemaUnsupportedError.ts';
import EdgePropSet from '../../types/ops/EdgePropSet.ts';
import PropSet from '../../types/ops/PropSet.ts';
import type { PatchOp } from '../../types/ops/unions.ts';
import { decodeTrailerTextMessage, TRAILER_KEYS } from './MessageCodecInternal.ts';

// ── Constants ───────────────────────────────────────────────────────

/** Patch schema v2 — classic node-only patches. */
export const CLASSIC_PATCH_SCHEMA_VERSION = 2;

/** Patch schema v3 — edge-property-aware patches. */
export const EDGE_PROPERTY_PATCH_SCHEMA_VERSION = 3;

export const PATCH_SCHEMA_CLASSIC = CLASSIC_PATCH_SCHEMA_VERSION;
export const PATCH_SCHEMA_EDGE_PROPERTIES = EDGE_PROPERTY_PATCH_SCHEMA_VERSION;

// ── Schema version detection ────────────────────────────────────────

function isEdgePropOp(op: PatchOp): boolean {
  if (op instanceof EdgePropSet) { return true; }
  return op instanceof PropSet && op.node.startsWith(EDGE_PROP_PREFIX);
}

/** Detects the schema version required for a set of ops. */
export function detectSchemaVersion(ops: readonly PatchOp[] | null | undefined): number {
  if (!Array.isArray(ops)) { return CLASSIC_PATCH_SCHEMA_VERSION; }
  for (const op of ops) {
    if (op === null || op === undefined || typeof op !== 'object') { continue; }
    if (isEdgePropOp(op)) { return EDGE_PROPERTY_PATCH_SCHEMA_VERSION; }
  }
  return CLASSIC_PATCH_SCHEMA_VERSION;
}

// ── Schema compatibility ────────────────────────────────────────────

/** Asserts ops are compatible with a max supported schema version. */
export function assertOpsCompatible(ops: readonly PatchOp[] | null | undefined, maxSchema: number): void {
  if (maxSchema >= EDGE_PROPERTY_PATCH_SCHEMA_VERSION) { return; }
  if (!Array.isArray(ops)) { return; }
  for (const op of ops) {
    if (op === null || op === undefined || typeof op !== 'object') { continue; }
    if (isEdgePropOp(op)) {
      throw new SchemaUnsupportedError('Upgrade to >=7.3.0 (WEIGHTED) to sync edge properties.', {
        context: { requiredSchema: EDGE_PROPERTY_PATCH_SCHEMA_VERSION, maxSupportedSchema: maxSchema },
      });
    }
  }
}

// ── Message kind detection ──────────────────────────────────────────

type MessageKind = 'patch' | 'checkpoint' | 'anchor' | 'audit';
const MESSAGE_KINDS: readonly MessageKind[] = Object.freeze(['patch', 'checkpoint', 'anchor', 'audit']);

function isMessageKind(kind: string | undefined): kind is MessageKind {
  return MESSAGE_KINDS.some((candidate) => candidate === kind);
}

/** Detects the WARP message kind from a raw commit message. */
export function detectMessageKind(message: string): MessageKind | null {
  if (typeof message !== 'string') { return null; }
  try {
    const decoded = decodeTrailerTextMessage(message);
    const kind = decoded.trailers[TRAILER_KEYS.kind];
    if (isMessageKind(kind)) {
      return kind;
    }
    return null;
  } catch {
    return null;
  }
}
