import ConeRecordError from '../errors/ConeRecordError.ts';
import ConeRecordKey, { type ConeDotSet } from '../services/cone/ConeRecordKey.ts';
import { LIVENESS_INDEX, type SelectionIndexName } from './OrdinalBitmapBlock.ts';
import SelectionDirectoryEntry from './SelectionDirectoryEntry.ts';

/** Entries one directory page lists at most (#816 D3). */
export const SELECTION_DIRECTORY_PAGE_SIZE = 256;

const INDEXES: ReadonlySet<string> = new Set([LIVENESS_INDEX]);
const DOT_SETS: ReadonlySet<string> = new Set(['node', 'edge']);

/** Constructor fields of a selection directory page. */
export type SelectionDirectoryPageFields = {
  readonly index: SelectionIndexName;
  readonly set: ConeDotSet;
  readonly pageIndex: number;
  /** The entries this page lists, strictly ascending by writer, segment and chunk index. */
  readonly entries: readonly SelectionDirectoryEntry[];
};

/**
 * One page of the directory of a selection index and OR-Set (#816 D3, P1):
 * a cone record of the `selection` family.
 *
 * The directory lists exactly the chunks with at least one dot that an add
 * tagged (E1), each with the mask of its blocks that have a live member.
 * Its entries are sorted by writer, segment and chunk index and packed
 * densely, 256 to a page, so the pages are a function of the folded state.
 * A reader opens pages 0, 1, 2 and on until one is absent. Records are never
 * removed, so the entries only grow; a mask changes in place.
 */
export default class SelectionDirectoryPage {
  readonly index: SelectionIndexName;
  readonly set: ConeDotSet;
  readonly pageIndex: number;
  readonly #entries: readonly SelectionDirectoryEntry[];

  constructor(fields: SelectionDirectoryPageFields) {
    if (!INDEXES.has(fields.index) || !DOT_SETS.has(fields.set) || !Number.isSafeInteger(fields.pageIndex) || fields.pageIndex < 0) {
      throw new ConeRecordError('A selection directory page needs a known index, an OR-Set and a page index', {
        context: { index: String(fields.index), set: String(fields.set), pageIndex: String(fields.pageIndex) },
      });
    }
    this.index = fields.index;
    this.set = fields.set;
    this.pageIndex = fields.pageIndex;
    this.#entries = Object.freeze(requireEntries(fields.entries, fields.set));
    Object.freeze(this);
  }

  /** A detached copy of the listed entries, ascending. */
  get entries(): readonly SelectionDirectoryEntry[] {
    return Object.freeze([...this.#entries]);
  }

  key(): ConeRecordKey {
    return ConeRecordKey.forSelectionDirectoryPage({ index: this.index, set: this.set, pageIndex: this.pageIndex });
  }

  /** True when the page lists the most entries a page can hold. */
  isFull(): boolean {
    return this.#entries.length === SELECTION_DIRECTORY_PAGE_SIZE;
  }

  equals(other: SelectionDirectoryPage): boolean {
    return other.index === this.index && other.set === this.set && other.pageIndex === this.pageIndex
      && other.#entries.length === this.#entries.length
      && other.#entries.every((entry, position) => this.#entries[position]?.equals(entry) === true);
  }
}

function requireEntries(entries: readonly SelectionDirectoryEntry[], set: ConeDotSet): readonly SelectionDirectoryEntry[] {
  if (!(entries instanceof Array) || entries.length === 0 || entries.length > SELECTION_DIRECTORY_PAGE_SIZE) {
    throw new ConeRecordError(`A selection directory page lists 1 to ${String(SELECTION_DIRECTORY_PAGE_SIZE)} entries`);
  }
  entries.reduce<SelectionDirectoryEntry | null>((previous, entry) => requireNextEntry(entry, previous, set), null);
  return [...entries];
}

function requireNextEntry(entry: SelectionDirectoryEntry, previous: SelectionDirectoryEntry | null, set: ConeDotSet): SelectionDirectoryEntry {
  if (!(entry instanceof SelectionDirectoryEntry) || !follows(entry, previous, set)) {
    throw new ConeRecordError('Selection directory entries must be chunks of the page OR-Set in strictly ascending order', {
      context: { set, chunk: entry instanceof SelectionDirectoryEntry ? entry.chunk.toString() : typeof entry },
    });
  }
  return entry;
}

function follows(entry: SelectionDirectoryEntry, previous: SelectionDirectoryEntry | null, set: ConeDotSet): boolean {
  return entry.chunk.segment.kind === set && (previous === null || previous.chunk.compare(entry.chunk) < 0);
}
