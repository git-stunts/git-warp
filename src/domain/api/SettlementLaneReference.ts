import type { LaneReference } from './Lane.ts';
import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';

/** Validates and freezes a lane reference embedded in a settlement artifact. */
export function freezeSettlementLaneReference(
  reference: LaneReference,
  field: string
): LaneReference {
  if (
    reference === null ||
    typeof reference !== 'object' ||
    (reference.kind !== 'strand' && reference.kind !== 'worldline')
  ) {
    throw new WarpError('Settlement lane reference is invalid', 'E_SETTLEMENT_LANE_REFERENCE', {
      context: { field },
    });
  }
  requireNonEmptyString(reference.name, `${field}.name`);
  return Object.freeze({ kind: reference.kind, name: reference.name });
}
