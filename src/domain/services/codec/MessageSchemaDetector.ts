/**
 * Schema version detection and compatibility validation for WARP messages.
 */

import { EDGE_PROP_PREFIX } from '../KeyCodec.ts';
import SchemaUnsupportedError from '../../errors/SchemaUnsupportedError.ts';
import { getCodec, TRAILER_KEYS } from './MessageCodecInternal.ts';

// ── Constants ───────────────────────────────────────────────────────

/** Patch schema v2 — classic node-only patches. */
export const SCHEMA_V2 = 2;

/** Patch schema v3 — edge-property-aware patches. */
export const SCHEMA_V3 = 3;

export const PATCH_SCHEMA_V2 = SCHEMA_V2;
export const PATCH_SCHEMA_V3 = SCHEMA_V3;

// ── Schema version detection ────────────────────────────────────────

type OpLike = { type: string; node?: string }; // nosemgrep: ts-no-like-types -- 0025C

function isEdgePropOp(op: OpLike): boolean { // nosemgrep: ts-no-like-types -- 0025C
  if (op.type === 'EdgePropSet') { return true; }
  return op.type === 'PropSet' && typeof op.node === 'string' && op.node.startsWith(EDGE_PROP_PREFIX);
}

/** Detects the schema version required for a set of ops. */
export function detectSchemaVersion(ops: OpLike[]): number { // nosemgrep: ts-no-like-types -- 0025C
  if (!Array.isArray(ops)) { return SCHEMA_V2; }
  for (const op of ops) {
    if (op === null || op === undefined || typeof op !== 'object') { continue; }
    if (isEdgePropOp(op)) { return SCHEMA_V3; }
  }
  return SCHEMA_V2;
}

// ── Schema compatibility ────────────────────────────────────────────

/** Asserts ops are compatible with a max supported schema version. */
export function assertOpsCompatible(ops: OpLike[], maxSchema: number): void { // nosemgrep: ts-no-like-types -- 0025C
  if (maxSchema >= SCHEMA_V3) { return; }
  if (!Array.isArray(ops)) { return; }
  for (const op of ops) {
    if (op === null || op === undefined || typeof op !== 'object') { continue; }
    if (isEdgePropOp(op)) {
      throw new SchemaUnsupportedError('Upgrade to >=7.3.0 (WEIGHTED) to sync edge properties.', {
        context: { requiredSchema: SCHEMA_V3, maxSupportedSchema: maxSchema },
      });
    }
  }
}

// ── Message kind detection ──────────────────────────────────────────

type MessageKind = 'patch' | 'checkpoint' | 'anchor' | 'audit';

const VALID_KINDS = new Set<string>(['patch', 'checkpoint', 'anchor', 'audit']);

/** Detects the WARP message kind from a raw commit message. */
export function detectMessageKind(message: string): MessageKind | null {
  if (typeof message !== 'string') { return null; }
  try {
    const decoded = getCodec().decode(message);
    const kind = decoded.trailers[TRAILER_KEYS['kind'] ?? 'eg-kind'];
    if (typeof kind === 'string' && VALID_KINDS.has(kind)) {
      return kind as MessageKind;
    }
    return null;
  } catch {
    return null;
  }
}
