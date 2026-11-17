import RetainedGraphError from '../errors/RetainedGraphError.ts';
import { CONE_DOT_PAGE_SPAN } from '../services/cone/ConeDotPage.ts';
import OrdinalGeometry from './OrdinalGeometry.ts';

/** Local ordinals one selection shard covers in version 1: exactly one Roaring container (#816 D2). */
export const SELECTION_CHUNK_SPAN = 2 ** 16;

/** Constructor fields of a selection geometry. */
export type SelectionGeometryFields = {
  readonly version: number;
  readonly chunkSpan: number;
};

/**
 * How the selection plane (#816) cuts one 32-bit ordinal segment of the
 * stored ordinal geometry, version 1, into shards.
 *
 * A chunk is `chunkSpan` consecutive local ordinals of one segment. A cone
 * dot page (256 counters) lies inside exactly one chunk, because the span is
 * a power of two of at least one page; and one chunk is at most one Roaring
 * container, because the span is at most 2^16. Version 1 is the geometry
 * that the layout-5 record trie stores; another span exists only to prove
 * that selection does not depend on the shard size.
 */
export default class SelectionGeometry {
  readonly version: number;
  readonly chunkSpan: number;
  readonly ordinals: OrdinalGeometry;

  private constructor(fields: SelectionGeometryFields) {
    this.version = requireVersion(fields.version);
    this.chunkSpan = requireChunkSpan(fields.chunkSpan);
    this.ordinals = OrdinalGeometry.dotPages();
    Object.freeze(this);
  }

  /** Selection geometry version 1: chunks of 65,536 local ordinals over ordinal geometry version 1. */
  static chunks(): SelectionGeometry {
    return new SelectionGeometry({ version: 1, chunkSpan: SELECTION_CHUNK_SPAN });
  }

  /** Any valid selection geometry; the store keeps only {@link SelectionGeometry.chunks}. */
  static of(fields: SelectionGeometryFields): SelectionGeometry {
    return new SelectionGeometry(fields);
  }

  /** Chunks in one ordinal segment. */
  chunksPerSegment(): number {
    return this.ordinals.segmentCapacity / this.chunkSpan;
  }

  /** The stable text form, as the record layout names it. */
  identity(): string {
    return `selection geometry v${String(this.version)}: chunk ${String(this.chunkSpan)}`;
  }

  equals(other: SelectionGeometry): boolean {
    return other.identity() === this.identity();
  }
}

function requireVersion(version: number): number {
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw invalid('Selection geometry version must be a positive integer', { version });
  }
  return version;
}

function requireChunkSpan(chunkSpan: number): number {
  const fits = Number.isSafeInteger(chunkSpan) && chunkSpan >= CONE_DOT_PAGE_SPAN && chunkSpan <= SELECTION_CHUNK_SPAN;
  if (!fits || !Number.isInteger(Math.log2(chunkSpan))) {
    throw invalid('Selection chunk span must be a power of two from one dot page to one Roaring container', { chunkSpan });
  }
  return chunkSpan;
}

function invalid(message: string, context: Readonly<Record<string, number>>): RetainedGraphError {
  return new RetainedGraphError(message, 'E_RETAINED_GEOMETRY_INVALID', { context });
}
