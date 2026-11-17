import RetainedGraphError from '../errors/RetainedGraphError.ts';
import { compareStrings } from '../utils/StringComparison.ts';
import type GraphOrdinal from './GraphOrdinal.ts';
import OrdinalSegment from './OrdinalSegment.ts';
import SelectionGeometry from './SelectionGeometry.ts';

/** Constructor fields of an ordinal chunk. */
export type OrdinalChunkFields = {
  readonly segment: OrdinalSegment;
  readonly index: number;
  readonly geometry: SelectionGeometry;
};

/**
 * One selection shard's range (#816): `geometry.chunkSpan` consecutive local
 * ordinals of one writer, kind and segment. A member is stored as its offset
 * from the chunk's first local ordinal, so one chunk is one Roaring container
 * whose key is the chunk index.
 */
export default class OrdinalChunk {
  readonly segment: OrdinalSegment;
  readonly index: number;
  readonly geometry: SelectionGeometry;

  constructor(fields: OrdinalChunkFields) {
    if (!(fields.segment instanceof OrdinalSegment) || !(fields.geometry instanceof SelectionGeometry)) {
      throw new RetainedGraphError('An ordinal chunk needs a segment and a selection geometry', 'E_RETAINED_ORDINAL_INVALID');
    }
    this.segment = fields.segment;
    this.geometry = fields.geometry;
    this.index = requireIndex(fields.index, fields.geometry);
    Object.freeze(this);
  }

  /** The chunk that holds `ordinal`. */
  static of(ordinal: GraphOrdinal, geometry: SelectionGeometry): OrdinalChunk {
    const index = Math.floor(ordinal.local(geometry.ordinals) / geometry.chunkSpan);
    return new OrdinalChunk({ segment: ordinal.segment(geometry.ordinals), index, geometry });
  }

  /** The segment-local ordinal of offset 0. */
  firstLocal(): number {
    return this.index * this.geometry.chunkSpan;
  }

  /** True when `ordinal` lies in this chunk. */
  holds(ordinal: GraphOrdinal): boolean {
    return OrdinalChunk.of(ordinal, this.geometry).equals(this);
  }

  /** The offset of `ordinal` in this chunk; an ordinal of another chunk is refused. */
  offsetOf(ordinal: GraphOrdinal): number {
    if (!this.holds(ordinal)) {
      throw new RetainedGraphError('Ordinal lies outside this chunk', 'E_RETAINED_ORDINAL_INVALID', {
        context: { ordinal: ordinal.toString(), chunk: this.toString() },
      });
    }
    return ordinal.local(this.geometry.ordinals) - this.firstLocal();
  }

  /** The ordinal at `offset`; a counter outside the geometry is refused. */
  ordinalAt(offset: number): GraphOrdinal {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= this.geometry.chunkSpan) {
      throw new RetainedGraphError('Offset lies outside the chunk', 'E_RETAINED_ORDINAL_OUT_OF_RANGE', {
        context: { offset, chunk: this.toString() },
      });
    }
    return this.segment.ordinalAt(this.firstLocal() + offset, this.geometry.ordinals);
  }

  /** Orders chunks by kind, writer, segment and chunk index. */
  compare(other: OrdinalChunk): number {
    return compareStrings(this.segment.kind, other.segment.kind)
      || compareStrings(this.segment.writerId, other.segment.writerId)
      || this.segment.index - other.segment.index
      || this.index - other.index;
  }

  equals(other: OrdinalChunk): boolean {
    return other.segment.equals(this.segment) && other.index === this.index && other.geometry.equals(this.geometry);
  }

  toString(): string {
    return `${this.segment.toString()}/${String(this.index)}`;
  }
}

function requireIndex(index: number, geometry: SelectionGeometry): number {
  if (!Number.isSafeInteger(index) || index < 0 || index >= geometry.chunksPerSegment()) {
    throw new RetainedGraphError('Ordinal chunk index lies outside its segment', 'E_RETAINED_ORDINAL_OUT_OF_RANGE', {
      context: { index, chunksPerSegment: geometry.chunksPerSegment() },
    });
  }
  return index;
}
