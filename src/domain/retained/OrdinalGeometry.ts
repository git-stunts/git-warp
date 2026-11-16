import RetainedGraphError from '../errors/RetainedGraphError.ts';
import { CONE_DOT_PAGE_SPAN } from '../services/cone/ConeDotPage.ts';

/** Local ordinals per segment: the 32-bit namespace a Roaring bitmap selects over. */
export const ORDINAL_SEGMENT_CAPACITY = 2 ** 32;

/** Constructor fields of an ordinal geometry. */
export type OrdinalGeometryFields = {
  readonly version: number;
  readonly segmentCapacity: number;
  readonly pageSpan: number;
};

/**
 * How a dot counter becomes a selectable ordinal (#815).
 *
 * A graph-local ordinal is one dot `(writer, counter)` of one OR-Set. Its
 * segment is `floor(counter / segmentCapacity)` and its local ordinal the
 * remainder, so a Roaring bitmap per segment selects 32-bit integers and a
 * writer that exhausts one segment continues in the next one instead of
 * widening any global limit. Its address page is
 * `floor(counter / pageSpan)`, the cone dot page that names the element the
 * dot added. Version 1 is the only geometry the layout-4 record trie stores.
 *
 * Counters start at 1, so local ordinal 0 of segment 0 is never used and
 * segment 0 holds 2^32 − 1 ordinals. Segments exist per writer and per kind.
 * Node and edge ordinals share one writer's counter sequence (one counter per
 * operation), so each kind's segment has gaps.
 */
export default class OrdinalGeometry {
  readonly version: number;
  readonly segmentCapacity: number;
  readonly pageSpan: number;

  private constructor(fields: OrdinalGeometryFields) {
    this.version = requirePositive(fields.version, 'version');
    this.segmentCapacity = requireSegmentCapacity(fields.segmentCapacity);
    this.pageSpan = requirePageSpan(fields.pageSpan, this.segmentCapacity);
    Object.freeze(this);
  }

  /** Version 1: 32-bit local ordinals over 256-counter address pages. */
  static dotPages(): OrdinalGeometry {
    return new OrdinalGeometry({ version: 1, segmentCapacity: ORDINAL_SEGMENT_CAPACITY, pageSpan: CONE_DOT_PAGE_SPAN });
  }

  /**
   * Any geometry of a valid shape. Only {@link dotPages} is stored today; this
   * exists so a future layout can declare another and so refusals are testable.
   */
  static of(fields: OrdinalGeometryFields): OrdinalGeometry {
    return new OrdinalGeometry(fields);
  }

  segmentIndexOf(counter: number): number {
    return Math.floor(requireCounter(counter) / this.segmentCapacity);
  }

  localOf(counter: number): number {
    return requireCounter(counter) % this.segmentCapacity;
  }

  pageIndexOf(counter: number): number {
    return Math.floor(requireCounter(counter) / this.pageSpan);
  }

  /** The dot counter at `local` in segment `segmentIndex`. */
  counterAt(segmentIndex: number, local: number): number {
    if (!isIndex(segmentIndex) || !isIndex(local) || local >= this.segmentCapacity) {
      throw outOfRange({ segmentIndex, local });
    }
    return requireCounter(segmentIndex * this.segmentCapacity + local);
  }

  /** The stable text identity a manifest commitment binds. */
  identity(): string {
    return `ordinal geometry v${String(this.version)}: segment ${String(this.segmentCapacity)}, page ${String(this.pageSpan)}`;
  }

  equals(other: OrdinalGeometry): boolean {
    return other.identity() === this.identity();
  }
}

function requirePositive(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RetainedGraphError(`Ordinal geometry ${field} must be a positive integer`, 'E_RETAINED_GEOMETRY_INVALID', { context: { [field]: value } });
  }
  return value;
}

function requireSegmentCapacity(value: number): number {
  if (requirePositive(value, 'segmentCapacity') > ORDINAL_SEGMENT_CAPACITY || !isPowerOfTwo(value)) {
    throw new RetainedGraphError('Ordinal segment capacity must be a power of two of at most 2^32', 'E_RETAINED_GEOMETRY_INVALID', {
      context: { segmentCapacity: value },
    });
  }
  return value;
}

function requirePageSpan(value: number, segmentCapacity: number): number {
  if (requirePositive(value, 'pageSpan') > segmentCapacity || segmentCapacity % value !== 0) {
    throw new RetainedGraphError('Ordinal page span must divide the segment capacity', 'E_RETAINED_GEOMETRY_INVALID', {
      context: { pageSpan: value, segmentCapacity },
    });
  }
  return value;
}

function isIndex(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(Math.log2(value));
}

function requireCounter(counter: number): number {
  if (!Number.isSafeInteger(counter) || counter <= 0) {
    throw outOfRange({ counter });
  }
  return counter;
}

/** Where an ordinal fell outside the geometry. */
type OutOfRangeContext = { readonly counter?: number; readonly segmentIndex?: number; readonly local?: number };

function outOfRange(context: OutOfRangeContext): RetainedGraphError {
  return new RetainedGraphError('Ordinal lies outside the geometry', 'E_RETAINED_ORDINAL_OUT_OF_RANGE', { context });
}
