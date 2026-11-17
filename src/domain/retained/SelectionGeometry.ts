import RetainedGraphError from '../errors/RetainedGraphError.ts';
import { CONE_DOT_PAGE_SPAN } from '../services/cone/ConeDotPage.ts';
import OrdinalGeometry from './OrdinalGeometry.ts';

/** Local ordinals one directory chunk covers in version 1: one Roaring container's range (#816 D2). */
export const SELECTION_CHUNK_SPAN = 2 ** 16;
/** Local ordinals one stored block covers in version 1: a 128-byte bitset (#816 F1 decision). */
export const SELECTION_BLOCK_SPAN = 2 ** 10;
/** The most blocks one chunk holds: a directory entry marks them in a 64-bit mask. */
export const SELECTION_MAX_BLOCKS = 64;

/** Constructor fields of a selection geometry. */
export type SelectionGeometryFields = {
  readonly version: number;
  readonly chunkSpan: number;
  readonly blockSpan: number;
};

/**
 * How the selection plane (#816) cuts one 32-bit ordinal segment of the
 * stored ordinal geometry, version 1.
 *
 * A chunk is `chunkSpan` consecutive local ordinals of one segment: the unit
 * the directory lists. A chunk stores its members in blocks of `blockSpan`
 * ordinals, one record each, so a fold rewrites only the blocks it changes.
 * A cone dot page (256 counters) lies inside exactly one block, because the
 * spans are powers of two of at least one page; a chunk has at most 64
 * blocks, so a 64-bit mask can mark them. Version 1 is the geometry the
 * layout-5 record trie stores; another geometry exists only to prove that
 * selection does not depend on the record sizes.
 */
export default class SelectionGeometry {
  readonly version: number;
  readonly chunkSpan: number;
  readonly blockSpan: number;
  readonly ordinals: OrdinalGeometry;

  private constructor(fields: SelectionGeometryFields) {
    this.version = requireVersion(fields.version);
    this.chunkSpan = requireSpan(fields.chunkSpan, 'chunkSpan', SELECTION_CHUNK_SPAN);
    this.blockSpan = requireBlockSpan(fields.blockSpan, this.chunkSpan);
    this.ordinals = OrdinalGeometry.dotPages();
    Object.freeze(this);
  }

  /** Selection geometry version 1: chunks of 65,536 local ordinals in blocks of 1,024. */
  static chunks(): SelectionGeometry {
    return new SelectionGeometry({ version: 1, chunkSpan: SELECTION_CHUNK_SPAN, blockSpan: SELECTION_BLOCK_SPAN });
  }

  /** Any valid selection geometry; the store keeps only {@link SelectionGeometry.chunks}. */
  static of(fields: SelectionGeometryFields): SelectionGeometry {
    return new SelectionGeometry(fields);
  }

  /** Chunks in one ordinal segment. */
  chunksPerSegment(): number {
    return this.ordinals.segmentCapacity / this.chunkSpan;
  }

  /** Blocks in one chunk. */
  blocksPerChunk(): number {
    return this.chunkSpan / this.blockSpan;
  }

  /** The stable text form, as the record layout names it. */
  identity(): string {
    return `selection geometry v${String(this.version)}: chunk ${String(this.chunkSpan)}, block ${String(this.blockSpan)}`;
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

/** A power of two from one dot page up to `largest`. */
function requireSpan(span: number, field: string, largest: number): number {
  const fits = Number.isSafeInteger(span) && span >= CONE_DOT_PAGE_SPAN && span <= largest;
  if (!fits || !Number.isInteger(Math.log2(span))) {
    throw invalid(`Selection ${field} must be a power of two from one dot page to ${String(largest)} ordinals`, { [field]: span });
  }
  return span;
}

function requireBlockSpan(blockSpan: number, chunkSpan: number): number {
  const span = requireSpan(blockSpan, 'blockSpan', chunkSpan);
  if (chunkSpan / span > SELECTION_MAX_BLOCKS) {
    throw invalid('A selection chunk holds at most 64 blocks', { chunkSpan, blockSpan });
  }
  return span;
}

function invalid(message: string, context: Readonly<Record<string, number>>): RetainedGraphError {
  return new RetainedGraphError(message, 'E_RETAINED_GEOMETRY_INVALID', { context });
}
