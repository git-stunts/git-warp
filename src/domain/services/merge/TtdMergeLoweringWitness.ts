/**
 * TtdMergeLoweringWitness — TTD-renderable merge surface summary.
 *
 * @module domain/services/merge/TtdMergeLoweringWitness
 */

import WarpError from '../../errors/WarpError.ts';
import {
  TTD_MERGE_LOWERING_SURFACES,
  type TtdMergeLoweringSurface,
} from './TtdMergeLoweringSurface.ts';
import {
  freezeSortedTexts,
  requireNonNegativeInteger,
} from './TtdMergeValidation.ts';

export type TtdMergeLoweringWitnessFields = {
  readonly surface: TtdMergeLoweringSurface;
  readonly basisKeyCount: number;
  readonly conflictKeyCount: number;
  readonly keyOrder: readonly string[];
};

function requireSurface(surface: TtdMergeLoweringSurface): TtdMergeLoweringSurface {
  if (!TTD_MERGE_LOWERING_SURFACES.includes(surface)) {
    throw new WarpError('merge lowering surface is invalid', 'E_TTD_MERGE_INSPECTION_INVALID');
  }
  return surface;
}

export default class TtdMergeLoweringWitness {
  readonly surface: TtdMergeLoweringSurface;
  readonly basisKeyCount: number;
  readonly conflictKeyCount: number;
  readonly keyOrder: readonly string[];

  constructor(fields: TtdMergeLoweringWitnessFields) {
    this.surface = requireSurface(fields.surface);
    this.basisKeyCount = requireNonNegativeInteger(fields.basisKeyCount, 'basisKeyCount');
    this.conflictKeyCount = requireNonNegativeInteger(fields.conflictKeyCount, 'conflictKeyCount');
    this.keyOrder = freezeSortedTexts(fields.keyOrder, 'keyOrder');
    Object.freeze(this);
  }
}
