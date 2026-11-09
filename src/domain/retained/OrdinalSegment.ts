import RetainedGraphError from '../errors/RetainedGraphError.ts';
import type { ConeDotSet } from '../services/cone/ConeRecordKey.ts';
import GraphOrdinal from './GraphOrdinal.ts';
import type OrdinalGeometry from './OrdinalGeometry.ts';
import { requireChain, requireOrdinalKind } from './OrdinalValidation.ts';

/** Constructor fields of an ordinal segment. */
export type OrdinalSegmentFields = {
  readonly kind: ConeDotSet;
  readonly writerId: string;
  readonly index: number;
};

/**
 * One 32-bit ordinal namespace (#815): a writer chain's dots of one kind
 * whose counters share a segment index. A selection bitmap holds local
 * ordinals of exactly one segment; a writer that exhausts a segment
 * continues in the next. A whole-graph selection is the union over every
 * writer × kind × segment. Local ordinal 0 of segment 0 is never used.
 */
export default class OrdinalSegment {
  readonly kind: ConeDotSet;
  readonly writerId: string;
  readonly index: number;

  constructor(fields: OrdinalSegmentFields) {
    this.kind = requireOrdinalKind(fields.kind);
    this.writerId = requireChain(fields.writerId);
    if (!Number.isSafeInteger(fields.index) || fields.index < 0) {
      throw new RetainedGraphError('Ordinal segment index must be a non-negative integer', 'E_RETAINED_ORDINAL_INVALID', {
        context: { index: fields.index },
      });
    }
    this.index = fields.index;
    Object.freeze(this);
  }

  /** The ordinal at 32-bit `local` in this segment. */
  ordinalAt(local: number, geometry: OrdinalGeometry): GraphOrdinal {
    return new GraphOrdinal({ kind: this.kind, writerId: this.writerId, counter: geometry.counterAt(this.index, local) });
  }

  equals(other: OrdinalSegment): boolean {
    return other.kind === this.kind && other.writerId === this.writerId && other.index === this.index;
  }

  /** Stable text form, used as a bitmap-family key. */
  toString(): string {
    return `${this.kind}/${this.writerId}/${String(this.index)}`;
  }
}
