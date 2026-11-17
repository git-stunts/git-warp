import ConeRecordError from '../errors/ConeRecordError.ts';
import { CONE_DOT_PAGE_SPAN, type default as ConeDotPage } from '../services/cone/ConeDotPage.ts';
import ConeRecordKey from '../services/cone/ConeRecordKey.ts';
import GraphOrdinal from './GraphOrdinal.ts';
import OrdinalChunk from './OrdinalChunk.ts';

/** The liveness index: the live dots of the node or edge OR-Set (#816 S1). */
export const LIVENESS_INDEX = 'live';

/** The selection indexes the record trie stores. */
export type SelectionIndexName = typeof LIVENESS_INDEX;

const INDEXES: ReadonlySet<string> = new Set([LIVENESS_INDEX]);

/** Constructor fields of an ordinal bitmap shard. */
export type OrdinalBitmapShardFields = {
  readonly index: SelectionIndexName;
  readonly chunk: OrdinalChunk;
  /** Member offsets in the chunk, strictly ascending. */
  readonly offsets: readonly number[];
};

/**
 * The members of one selection index in one ordinal chunk (#816): a cone
 * record of the `selection` family, stored as one Roaring container.
 *
 * The fold keeps a liveness shard current from the dot pages it changes, so
 * a shard holds exactly the live dots of its chunk. Members are offsets from
 * the chunk's first local ordinal; the shard holds plain integers, so it owns
 * no bitmap memory that a caller would have to release.
 */
export default class OrdinalBitmapShard {
  readonly index: SelectionIndexName;
  readonly chunk: OrdinalChunk;
  readonly #offsets: Uint16Array;

  constructor(fields: OrdinalBitmapShardFields) {
    if (!INDEXES.has(fields.index) || !(fields.chunk instanceof OrdinalChunk)) {
      throw new ConeRecordError('A selection shard needs a known index and an ordinal chunk', { context: { index: String(fields.index) } });
    }
    this.index = fields.index;
    this.chunk = fields.chunk;
    this.#offsets = Uint16Array.from(requireOffsets(fields.offsets, fields.chunk));
    Object.freeze(this);
  }

  /** The shard of `chunk` with no members. */
  static empty(index: SelectionIndexName, chunk: OrdinalChunk): OrdinalBitmapShard {
    return new OrdinalBitmapShard({ index, chunk, offsets: [] });
  }

  /** The number of members. */
  get cardinality(): number {
    return this.#offsets.length;
  }

  key(): ConeRecordKey {
    const { kind, writerId, index: segment } = this.chunk.segment;
    return ConeRecordKey.forSelectionShard({ index: this.index, set: kind, writerId, segment, chunk: this.chunk.index });
  }

  /** A detached copy of the member offsets, ascending. */
  offsets(): readonly number[] {
    return Object.freeze(Array.from(this.#offsets));
  }

  /** True when `ordinal` is a member. */
  has(ordinal: GraphOrdinal): boolean {
    return this.chunk.holds(ordinal) && binarySearch(this.#offsets, this.chunk.offsetOf(ordinal));
  }

  /** This shard with the members of `page`'s counter range replaced by the page's live dots. */
  withPage(page: ConeDotPage): OrdinalBitmapShard {
    const low = this.#pageOffset(page);
    const high = low + CONE_DOT_PAGE_SPAN;
    const kept = Array.from(this.#offsets).filter((offset) => offset < low || offset >= high);
    const live = page.liveCounters().map((counter) => low + (counter % CONE_DOT_PAGE_SPAN));
    return new OrdinalBitmapShard({ index: this.index, chunk: this.chunk, offsets: [...kept, ...live].sort((left, right) => left - right) });
  }

  equals(other: OrdinalBitmapShard): boolean {
    return other.index === this.index && other.chunk.equals(this.chunk)
      && other.#offsets.length === this.#offsets.length
      && other.#offsets.every((offset, position) => offset === this.#offsets[position]);
  }

  /** The offset of `page`'s first counter, refusing a page of another chunk. */
  #pageOffset(page: ConeDotPage): number {
    const first = page.pageIndex * CONE_DOT_PAGE_SPAN;
    const ordinal = new GraphOrdinal({ kind: page.set, writerId: page.writerId, counter: Math.max(first, 1) });
    if (!this.chunk.holds(ordinal)) {
      throw new ConeRecordError('Dot page lies outside the selection shard chunk', {
        context: { chunk: this.chunk.toString(), page: page.key().toString() },
      });
    }
    return (first % this.chunk.geometry.ordinals.segmentCapacity) - this.chunk.firstLocal();
  }
}

function requireOffsets(offsets: readonly number[], chunk: OrdinalChunk): readonly number[] {
  if (!(offsets instanceof Array)) {
    throw new ConeRecordError('Selection shard offsets must be an array');
  }
  // Offset 0 of the first chunk of segment 0 is counter 0, which names no dot.
  const floor = chunk.segment.index === 0 && chunk.index === 0 ? 0 : -1;
  offsets.reduce((previous, offset) => requireNextOffset(offset, previous, chunk), floor);
  return offsets;
}

function requireNextOffset(offset: number, previous: number, chunk: OrdinalChunk): number {
  if (!Number.isSafeInteger(offset) || offset <= previous || offset >= chunk.geometry.chunkSpan) {
    throw new ConeRecordError('Selection shard offsets must ascend inside the chunk and name a dot', {
      context: { chunk: chunk.toString(), offset: String(offset) },
    });
  }
  return offset;
}

function binarySearch(values: Uint16Array, target: number): boolean {
  let low = 0;
  let high = values.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const value = values[middle] ?? -1;
    if (value === target) {
      return true;
    }
    [low, high] = value < target ? [middle + 1, high] : [low, middle - 1];
  }
  return false;
}
