import ConeRecordError from '../errors/ConeRecordError.ts';
import { CONE_DOT_PAGE_SPAN, type default as ConeDotPage } from '../services/cone/ConeDotPage.ts';
import ConeRecordKey from '../services/cone/ConeRecordKey.ts';
import type GraphOrdinal from './GraphOrdinal.ts';
import OrdinalChunk from './OrdinalChunk.ts';
import type SelectionGeometry from './SelectionGeometry.ts';

/** The liveness index: the live dots of the node or edge OR-Set (#816 S1). */
export const LIVENESS_INDEX = 'live';

/** The selection indexes the record trie stores. */
export type SelectionIndexName = typeof LIVENESS_INDEX;

const INDEXES: ReadonlySet<string> = new Set([LIVENESS_INDEX]);

/** Constructor fields of an ordinal bitmap block. */
export type OrdinalBitmapBlockFields = {
  readonly index: SelectionIndexName;
  readonly chunk: OrdinalChunk;
  /** The block's position in its chunk. */
  readonly block: number;
  /** Member offsets in the block, strictly ascending. */
  readonly offsets: readonly number[];
};

/**
 * The members of one selection index in one block of an ordinal chunk
 * (#816, F1 decision): a cone record of the `selection` family.
 *
 * A block covers `geometry.blockSpan` ordinals, 1,024 in version 1, and the
 * fold keeps it current from the dot pages it changes, so a fold rewrites
 * only the blocks it touches. A block exists once its block has a dot with
 * an owner, and its members are the live dots, which can be none (E1).
 * Members are offsets from the block's first ordinal; the record holds plain
 * integers, and the store encodes them as a fixed-size bitset.
 */
export default class OrdinalBitmapBlock {
  readonly index: SelectionIndexName;
  readonly chunk: OrdinalChunk;
  readonly block: number;
  readonly #offsets: Uint16Array;

  constructor(fields: OrdinalBitmapBlockFields) {
    if (!INDEXES.has(fields.index) || !(fields.chunk instanceof OrdinalChunk)) {
      throw new ConeRecordError('A selection block needs a known index and an ordinal chunk', { context: { index: String(fields.index) } });
    }
    this.index = fields.index;
    this.chunk = fields.chunk;
    this.block = requireBlock(fields.block, fields.chunk.geometry);
    this.#offsets = Uint16Array.from(requireOffsets(fields.offsets, this));
    Object.freeze(this);
  }

  /** The block of `chunk` at `block` with no members. */
  static empty(index: SelectionIndexName, chunk: OrdinalChunk, block: number): OrdinalBitmapBlock {
    return new OrdinalBitmapBlock({ index, chunk, block, offsets: [] });
  }

  /** The empty block that holds every counter of a cone dot page. */
  static emptyOfDotPage(index: SelectionIndexName, page: ConeDotPage, geometry: SelectionGeometry): OrdinalBitmapBlock {
    const chunk = OrdinalChunk.ofDotPage(page, geometry);
    return OrdinalBitmapBlock.empty(index, chunk, Math.floor(chunk.offsetOfDotPage(page) / geometry.blockSpan));
  }

  /** The number of members. */
  get cardinality(): number {
    return this.#offsets.length;
  }

  key(): ConeRecordKey {
    const { kind, writerId, index: segment } = this.chunk.segment;
    return ConeRecordKey.forSelectionBlock({ index: this.index, set: kind, writerId, segment, chunk: this.chunk.index, block: this.block });
  }

  /** The chunk offset of the block's first ordinal. */
  firstOffset(): number {
    return this.block * this.chunk.geometry.blockSpan;
  }

  /** A detached copy of the member offsets in the block, ascending. */
  offsets(): readonly number[] {
    return Object.freeze(Array.from(this.#offsets));
  }

  /** True when `ordinal` is a member. */
  has(ordinal: GraphOrdinal): boolean {
    return this.chunk.holds(ordinal) && this.#offsets.includes(this.chunk.offsetOf(ordinal) - this.firstOffset());
  }

  /** This block with the members of `page`'s counter range replaced by the page's live dots. */
  withPage(page: ConeDotPage): OrdinalBitmapBlock {
    const low = this.chunk.offsetOfDotPage(page) - this.firstOffset();
    if (low < 0 || low >= this.chunk.geometry.blockSpan) {
      throw new ConeRecordError('Dot page lies outside the selection block', {
        context: { chunk: this.chunk.toString(), block: this.block, page: page.key().toString() },
      });
    }
    const high = low + CONE_DOT_PAGE_SPAN;
    const kept = Array.from(this.#offsets).filter((offset) => offset < low || offset >= high);
    const live = page.liveCounters().map((counter) => low + (counter % CONE_DOT_PAGE_SPAN));
    const offsets = [...kept, ...live].sort((left, right) => left - right);
    return new OrdinalBitmapBlock({ index: this.index, chunk: this.chunk, block: this.block, offsets });
  }

  equals(other: OrdinalBitmapBlock): boolean {
    return other.index === this.index && other.chunk.equals(this.chunk) && other.block === this.block
      && other.#offsets.length === this.#offsets.length
      && other.#offsets.every((offset, position) => offset === this.#offsets[position]);
  }
}

function requireBlock(block: number, geometry: SelectionGeometry): number {
  if (!Number.isSafeInteger(block) || block < 0 || block >= geometry.blocksPerChunk()) {
    throw new ConeRecordError('Selection block lies outside its chunk', { context: { block: String(block), blocks: geometry.blocksPerChunk() } });
  }
  return block;
}

function requireOffsets(offsets: readonly number[], block: OrdinalBitmapBlock): readonly number[] {
  if (!(offsets instanceof Array)) {
    throw new ConeRecordError('Selection block offsets must be an array');
  }
  // Offset 0 of the first block of the first chunk of segment 0 is counter 0, which names no dot.
  const floor = block.chunk.segment.index === 0 && block.chunk.index === 0 && block.block === 0 ? 0 : -1;
  offsets.reduce((previous, offset) => requireNextOffset(offset, previous, block), floor);
  return offsets;
}

function requireNextOffset(offset: number, previous: number, block: OrdinalBitmapBlock): number {
  if (!Number.isSafeInteger(offset) || offset <= previous || offset >= block.chunk.geometry.blockSpan) {
    throw new ConeRecordError('Selection block offsets must ascend inside the block and name a dot', {
      context: { chunk: block.chunk.toString(), block: block.block, offset: String(offset) },
    });
  }
  return offset;
}
