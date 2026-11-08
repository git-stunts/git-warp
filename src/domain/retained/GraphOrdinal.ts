import { Dot } from '../crdt/Dot.ts';
import type { ConeDotSet } from '../services/cone/ConeRecordKey.ts';
import type OrdinalGeometry from './OrdinalGeometry.ts';
import { requireChain, requireOrdinalKind } from './OrdinalValidation.ts';
import OrdinalSegment from './OrdinalSegment.ts';

/** Constructor fields of a graph ordinal. */
export type GraphOrdinalFields = {
  readonly kind: ConeDotSet;
  readonly writerId: string;
  readonly counter: number;
};

/**
 * A graph-local ordinal (#815): one dot `(writer, counter)` of the node or
 * edge OR-Set. A writer mints its counters in its own chain order, so an
 * ordinal depends only on that chain, never on fold or arrival order, and it
 * stays stable across every successor manifest. A selection plane keys to the
 * ordinal; a reference that must name one basis keys to a
 * {@link ManifestOrdinal} pin instead, which only its own manifest resolves.
 * An ordinal is meaningful only with a manifest that folds its writer chain.
 */
export default class GraphOrdinal {
  readonly kind: ConeDotSet;
  readonly writerId: string;
  readonly counter: number;

  constructor(fields: GraphOrdinalFields) {
    this.kind = requireOrdinalKind(fields.kind);
    this.writerId = requireChain(fields.writerId);
    // A dot counter is a positive safe integer; `Dot` owns that rule, so it validates here.
    this.counter = new Dot(this.writerId, fields.counter).counter;
    Object.freeze(this);
  }

  static fromDot(kind: ConeDotSet, dot: Dot): GraphOrdinal {
    return new GraphOrdinal({ kind, writerId: dot.writerId, counter: dot.counter });
  }

  dot(): Dot {
    return new Dot(this.writerId, this.counter);
  }

  segment(geometry: OrdinalGeometry): OrdinalSegment {
    return new OrdinalSegment({ kind: this.kind, writerId: this.writerId, index: geometry.segmentIndexOf(this.counter) });
  }

  /** The 32-bit local ordinal inside {@link segment}. */
  local(geometry: OrdinalGeometry): number {
    return geometry.localOf(this.counter);
  }

  equals(other: GraphOrdinal): boolean {
    return other.kind === this.kind && other.writerId === this.writerId && other.counter === this.counter;
  }

  toString(): string {
    return `${this.kind}/${Dot.encode(this.dot())}`;
  }
}
