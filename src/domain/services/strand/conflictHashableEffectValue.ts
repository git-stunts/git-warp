/**
 * conflictHashableEffectValue — normalizes op property values for
 * conflict-effect hashing.
 *
 * @module domain/services/strand/conflictHashableEffectValue
 */

import type { HashablePayload } from '../../types/conflict/HashablePayload.ts';
import type NodePropSet from '../../types/ops/NodePropSet.ts';

function normalizeHashablePrimitiveEffectValue(value: NodePropSet['value']): HashablePayload | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return value;
  }
  return null;
}

function normalizeHashableObjectEffectValue(value: NodePropSet['value']): HashablePayload | null {
  if (value === null) {
    return null;
  }
  return typeof value === 'object' ? value : null;
}

export function normalizeHashableEffectValue(value: NodePropSet['value']): HashablePayload {
  return normalizeHashablePrimitiveEffectValue(value)
    ?? normalizeHashableObjectEffectValue(value)
    ?? null;
}
