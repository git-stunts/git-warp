/**
 * CanonicalConflictOp — runtime-backed conflict op normalization.
 *
 * Converts raw op records into the concrete op classes conflict analysis
 * understands, with a legacy anchor only for malformed records that still
 * deserve diagnostics.
 *
 * @module domain/services/strand/CanonicalConflictOp
 */

import { normalizeRawOp } from '../OpNormalizer.ts';
import BlobValue from '../../types/ops/BlobValue.ts';
import EdgeAdd from '../../types/ops/EdgeAdd.ts';
import EdgePropSet from '../../types/ops/EdgePropSet.ts';
import EdgeRemove from '../../types/ops/EdgeRemove.ts';
import NodeAdd from '../../types/ops/NodeAdd.ts';
import NodePropSet from '../../types/ops/NodePropSet.ts';
import NodeRemove from '../../types/ops/NodeRemove.ts';
import type { CanonicalPatchOp, PatchOp } from '../../types/ops/unions.ts';
import ConflictOpAnchor, { receiptNameForRawType } from './ConflictOpAnchor.ts';

export type CanonicalOpBlob = CanonicalPatchOp | ConflictOpAnchor;

type CanonicalConflictOpClass =
  | typeof NodeAdd
  | typeof NodeRemove
  | typeof EdgeAdd
  | typeof EdgeRemove
  | typeof NodePropSet
  | typeof EdgePropSet
  | typeof BlobValue;

const CANONICAL_CONFLICT_OP_CLASSES: readonly CanonicalConflictOpClass[] = Object.freeze([
  NodeAdd,
  NodeRemove,
  EdgeAdd,
  EdgeRemove,
  NodePropSet,
  EdgePropSet,
  BlobValue,
]);

function isCanonicalConflictOp(value: object): value is CanonicalOpBlob {
  return CANONICAL_CONFLICT_OP_CLASSES.some((OpClass) => value instanceof OpClass);
}

export function normalizeConflictOp(rawOp: PatchOp): CanonicalOpBlob | null {
  const normalizedOp = normalizeRawOp(rawOp);
  return isCanonicalConflictOp(normalizedOp) ? normalizedOp : ConflictOpAnchor.from(rawOp);
}

export function receiptNameForOp(canonOp: CanonicalOpBlob): string {
  return receiptNameForRawType(canonOp.type) ?? canonOp.receiptName;
}
