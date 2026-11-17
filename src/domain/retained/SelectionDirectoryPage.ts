import ConeRecordError from '../errors/ConeRecordError.ts';
import ConeRecordKey, { type ConeDotSet } from '../services/cone/ConeRecordKey.ts';
import { LIVENESS_INDEX, type SelectionIndexName } from './OrdinalBitmapShard.ts';
import OrdinalChunk from './OrdinalChunk.ts';

/** Chunks one directory page lists at most (#816 D3). */
export const SELECTION_DIRECTORY_PAGE_SIZE = 256;

const INDEXES: ReadonlySet<string> = new Set([LIVENESS_INDEX]);
const DOT_SETS: ReadonlySet<string> = new Set(['node', 'edge']);

/** Constructor fields of a selection directory page. */
export type SelectionDirectoryPageFields = {
  readonly index: SelectionIndexName;
  readonly set: ConeDotSet;
  readonly pageIndex: number;
  /** The chunks this page lists, strictly ascending by writer, segment and chunk index. */
  readonly chunks: readonly OrdinalChunk[];
};

/**
 * One page of the directory of a selection index and OR-Set (#816 D3, P1):
 * a cone record of the `selection` family.
 *
 * The directory lists exactly the chunks that have a shard, which are the
 * chunks with at least one dot that an add tagged (E1). Its entries are
 * sorted by writer, segment and chunk index and packed densely, 256 to a
 * page, so the pages are a function of the set of chunks. A reader opens
 * pages 0, 1, 2 and on until one is absent. Records are never removed, so
 * the pages only grow.
 */
export default class SelectionDirectoryPage {
  readonly index: SelectionIndexName;
  readonly set: ConeDotSet;
  readonly pageIndex: number;
  readonly #chunks: readonly OrdinalChunk[];

  constructor(fields: SelectionDirectoryPageFields) {
    if (!INDEXES.has(fields.index) || !DOT_SETS.has(fields.set) || !Number.isSafeInteger(fields.pageIndex) || fields.pageIndex < 0) {
      throw new ConeRecordError('A selection directory page needs a known index, an OR-Set and a page index', {
        context: { index: String(fields.index), set: String(fields.set), pageIndex: String(fields.pageIndex) },
      });
    }
    this.index = fields.index;
    this.set = fields.set;
    this.pageIndex = fields.pageIndex;
    this.#chunks = Object.freeze(requireChunks(fields.chunks, fields.set));
    Object.freeze(this);
  }

  /** A detached copy of the listed chunks, ascending. */
  get chunks(): readonly OrdinalChunk[] {
    return Object.freeze([...this.#chunks]);
  }

  key(): ConeRecordKey {
    return ConeRecordKey.forSelectionDirectoryPage({ index: this.index, set: this.set, pageIndex: this.pageIndex });
  }

  /** True when the page lists the most chunks a page can hold. */
  isFull(): boolean {
    return this.#chunks.length === SELECTION_DIRECTORY_PAGE_SIZE;
  }

  equals(other: SelectionDirectoryPage): boolean {
    return other.index === this.index && other.set === this.set && other.pageIndex === this.pageIndex
      && other.#chunks.length === this.#chunks.length
      && other.#chunks.every((chunk, position) => this.#chunks[position]?.equals(chunk) === true);
  }
}

function requireChunks(chunks: readonly OrdinalChunk[], set: ConeDotSet): readonly OrdinalChunk[] {
  if (!(chunks instanceof Array) || chunks.length === 0 || chunks.length > SELECTION_DIRECTORY_PAGE_SIZE) {
    throw new ConeRecordError(`A selection directory page lists 1 to ${String(SELECTION_DIRECTORY_PAGE_SIZE)} chunks`);
  }
  chunks.reduce<OrdinalChunk | null>((previous, chunk) => requireNextChunk(chunk, previous, set), null);
  return [...chunks];
}

function requireNextChunk(chunk: OrdinalChunk, previous: OrdinalChunk | null, set: ConeDotSet): OrdinalChunk {
  const ordered = chunk instanceof OrdinalChunk && chunk.segment.kind === set && (previous === null || previous.compare(chunk) < 0);
  if (!ordered) {
    throw new ConeRecordError('Selection directory chunks must be chunks of the page OR-Set in strictly ascending order', {
      context: { set, chunk: String(chunk) },
    });
  }
  return chunk;
}
