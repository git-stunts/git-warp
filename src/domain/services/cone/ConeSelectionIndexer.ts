import ConeRecordError from '../../errors/ConeRecordError.ts';
import OrdinalBitmapBlock, { LIVENESS_INDEX } from '../../retained/OrdinalBitmapBlock.ts';
import SelectionDirectoryEntry from '../../retained/SelectionDirectoryEntry.ts';
import SelectionDirectoryPage, { SELECTION_DIRECTORY_PAGE_SIZE } from '../../retained/SelectionDirectoryPage.ts';
import type ConeDotPage from './ConeDotPage.ts';
import type ConeFoldSession from './ConeFoldSession.ts';
import type ConeRecordSnapshot from './ConeRecordSnapshot.ts';
import ConeRecordKey, { type ConeDotSet } from './ConeRecordKey.ts';

type BlockPages = { readonly empty: OrdinalBitmapBlock; readonly pages: ConeDotPage[] };
type IndexedRecord = OrdinalBitmapBlock | SelectionDirectoryPage;

/** What one block's changed pages do. `after` is null while the block has no dot with an owner. */
type BlockChange = {
  readonly empty: OrdinalBitmapBlock;
  readonly before: OrdinalBitmapBlock | null;
  readonly after: OrdinalBitmapBlock | null;
};

/**
 * Keeps the liveness selection plane current for one folded patch (#816 S1,
 * F1 decision).
 *
 * It reads only the blocks whose dot pages the patch changed, and replaces
 * each changed page's range with that page's live dots, so a fold rewrites
 * one 1,024-ordinal block, not a whole chunk. A block gets its record when
 * its first dot with an owner is folded and keeps it, possibly empty, because
 * owners only grow (E1). The directory changes only when a chunk gets its
 * first block (a new entry, P1) or a block gains or loses its last live
 * member (the entry's mask, in place). A patch that changes no dot page reads
 * and writes nothing.
 */
export default class ConeSelectionIndexer {
  /** The blocks and directory pages to stage for the dot pages one fold changed. */
  static async index(session: ConeFoldSession, dots: readonly ConeDotPage[]): Promise<readonly IndexedRecord[]> {
    const groups = [...blockPages(dots, session).values()];
    if (groups.length === 0) {
      return [];
    }
    const stored = await session.read(groups.map(({ empty }) => empty.key()));
    const changes = groups.map(({ empty, pages }) => blockChange(stored, empty, pages));
    const blocks = changes.flatMap(({ before, after }) => (after === null || (before !== null && after.equals(before)) ? [] : [after]));
    return [...blocks, ...await directoryPages(session, changes)];
  }
}

/** Changed dot pages by the block that holds them, in the order the fold met them. */
function blockPages(dots: readonly ConeDotPage[], session: ConeFoldSession): Map<string, BlockPages> {
  const groups = new Map<string, BlockPages>();
  for (const page of dots) {
    const empty = OrdinalBitmapBlock.emptyOfDotPage(LIVENESS_INDEX, page, session.selection);
    const key = empty.key().toString();
    const group = groups.get(key) ?? { empty, pages: [] };
    group.pages.push(page);
    groups.set(key, group);
  }
  return groups;
}

function blockChange(stored: ConeRecordSnapshot, empty: OrdinalBitmapBlock, pages: readonly ConeDotPage[]): BlockChange {
  const before = stored.selectionBlock(LIVENESS_INDEX, empty.chunk, empty.block);
  if (before === null && !pages.some((page) => page.hasOwnedDot())) {
    return { empty, before, after: null };
  }
  return { empty, before, after: pages.reduce((block, page) => block.withPage(page), before ?? empty) };
}

/** A change that writes a block record and so may move the directory. */
type WritingChange = BlockChange & { readonly after: OrdinalBitmapBlock };

const isLive = (block: OrdinalBitmapBlock): boolean => block.cardinality > 0;

/** True when the change creates the block's record or flips whether it has a live member. */
function movesDirectory(change: BlockChange): change is WritingChange {
  return change.after !== null && (change.before === null || isLive(change.before) !== isLive(change.after));
}

/** The directory pages that change with `changes`, for each OR-Set whose directory moves. */
async function directoryPages(session: ConeFoldSession, changes: readonly BlockChange[]): Promise<SelectionDirectoryPage[]> {
  const pages: SelectionDirectoryPage[] = [];
  for (const set of ['edge', 'node'] as const) {
    const moving = changes.filter(movesDirectory).filter((change) => change.empty.chunk.segment.kind === set);
    if (moving.length > 0) {
      const stored = await readDirectory(session, set);
      pages.push(...changedPages(stored, applyChanges(stored, moving), set));
    }
  }
  return pages;
}

/** Every page of one OR-Set's liveness directory, refusing pages that are not densely packed in order. */
async function readDirectory(session: ConeFoldSession, set: ConeDotSet): Promise<SelectionDirectoryPage[]> {
  const pages: SelectionDirectoryPage[] = [];
  for (let pageIndex = 0; ; pageIndex += 1) {
    const key = ConeRecordKey.forSelectionDirectoryPage({ index: LIVENESS_INDEX, set, pageIndex });
    const page = (await session.read([key])).get(key);
    if (!(page instanceof SelectionDirectoryPage)) {
      return requireDense(pages, set);
    }
    pages.push(page);
  }
}

function requireDense(pages: readonly SelectionDirectoryPage[], set: ConeDotSet): SelectionDirectoryPage[] {
  const dense = pages.every((page, position) => position === pages.length - 1 || page.isFull())
    && ascending(pages.flatMap((page) => [...page.entries]));
  if (!dense) {
    throw corrupt('Selection directory pages are not densely packed in ascending order', { set, pages: pages.length });
  }
  return [...pages];
}

/** True when each entry's chunk sorts after the one before it. */
function ascending(entries: readonly SelectionDirectoryEntry[]): boolean {
  let previous: SelectionDirectoryEntry | null = null;
  for (const entry of entries) {
    if (previous !== null && previous.chunk.compare(entry.chunk) >= 0) {
      return false;
    }
    previous = entry;
  }
  return true;
}

/** The listed entries with each change applied: a new entry for a new chunk, and every block's live mark. */
function applyChanges(pages: readonly SelectionDirectoryPage[], changes: readonly WritingChange[]): SelectionDirectoryEntry[] {
  const entries = new Map(pages.flatMap((page) => [...page.entries]).map((entry) => [entry.chunk.toString(), entry]));
  for (const change of changes) {
    const listed = entries.get(change.empty.chunk.toString()) ?? null;
    entries.set(change.empty.chunk.toString(), markBlock(requireConsistent(listed, change), change));
  }
  return [...entries.values()].sort((left, right) => left.chunk.compare(right.chunk));
}

/**
 * The entry a change updates. A chunk without an entry may only gain its
 * first block; an entry that marks a block live whose record is absent has
 * lost that record.
 */
function requireConsistent(listed: SelectionDirectoryEntry | null, change: BlockChange): SelectionDirectoryEntry {
  const { chunk, block } = change.empty;
  if (listed === null) {
    return requireNewChunk(change);
  }
  if (change.before === null && listed.hasLiveBlock(block)) {
    throw corrupt('Selection directory marks a block live whose record is absent', { chunk: chunk.toString(), block });
  }
  return listed;
}

/** The empty entry of a chunk the directory does not list yet; only its first block may be folding. */
function requireNewChunk(change: BlockChange): SelectionDirectoryEntry {
  const { chunk, block } = change.empty;
  if (change.before !== null) {
    throw corrupt('Selection block exists but the directory does not list its chunk', { chunk: chunk.toString(), block });
  }
  return new SelectionDirectoryEntry({ chunk, liveBlocks: 0n });
}

function markBlock(entry: SelectionDirectoryEntry, change: WritingChange): SelectionDirectoryEntry {
  return isLive(change.after) ? entry.withLiveBlock(change.empty.block) : entry.withoutLiveBlock(change.empty.block);
}

/** The pages of `entries`, 256 to a page, that differ from the stored pages. */
function changedPages(stored: readonly SelectionDirectoryPage[], entries: readonly SelectionDirectoryEntry[], set: ConeDotSet): SelectionDirectoryPage[] {
  const pages: SelectionDirectoryPage[] = [];
  for (let start = 0; start < entries.length; start += SELECTION_DIRECTORY_PAGE_SIZE) {
    const pageIndex = start / SELECTION_DIRECTORY_PAGE_SIZE;
    const page = new SelectionDirectoryPage({
      index: LIVENESS_INDEX, set, pageIndex, entries: entries.slice(start, start + SELECTION_DIRECTORY_PAGE_SIZE),
    });
    if (stored[pageIndex]?.equals(page) !== true) {
      pages.push(page);
    }
  }
  return pages;
}

function corrupt(message: string, context: Readonly<Record<string, string | number>>): ConeRecordError {
  return new ConeRecordError(message, { code: 'E_CONE_RECORD_CORRUPT', context });
}
