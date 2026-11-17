import ConeRecordError from '../../errors/ConeRecordError.ts';
import OrdinalBitmapShard, { LIVENESS_INDEX } from '../../retained/OrdinalBitmapShard.ts';
import OrdinalChunk from '../../retained/OrdinalChunk.ts';
import SelectionDirectoryPage, { SELECTION_DIRECTORY_PAGE_SIZE } from '../../retained/SelectionDirectoryPage.ts';
import type ConeDotPage from './ConeDotPage.ts';
import type ConeFoldSession from './ConeFoldSession.ts';
import ConeRecordKey, { type ConeDotSet } from './ConeRecordKey.ts';

type ChunkPages = { readonly chunk: OrdinalChunk; readonly pages: ConeDotPage[] };
type IndexedRecord = OrdinalBitmapShard | SelectionDirectoryPage;

/**
 * Keeps the liveness selection plane current for one folded patch (#816 S1).
 *
 * It reads only the shards of the chunks whose dot pages the patch changed,
 * and replaces each changed page's range with that page's live dots. A
 * chunk gets its shard when its first dot with an owner is folded, and it
 * keeps it, possibly empty, because owners only grow (E1). Only a new shard
 * changes the directory: the directory of its OR-Set is read, the new chunks
 * are merged in order, and the pages from the first change onward are
 * rewritten (P1). A patch that changes no dot page reads and writes nothing.
 */
export default class ConeSelectionIndexer {
  /** The shards and directory pages to stage for the dot pages one fold changed. */
  static async index(session: ConeFoldSession, dots: readonly ConeDotPage[]): Promise<readonly IndexedRecord[]> {
    const groups = [...chunkPages(dots, session).values()];
    if (groups.length === 0) {
      return [];
    }
    const stored = await session.read(groups.map(({ chunk }) => OrdinalBitmapShard.empty(LIVENESS_INDEX, chunk).key()));
    const changes = groups.map(({ chunk, pages }) => shardChange(stored.selectionShard(LIVENESS_INDEX, chunk), chunk, pages));
    const shards = changes.flatMap((change) => (change.write === null ? [] : [change.write]));
    const created = changes.flatMap((change) => (change.created ? [change.chunk] : []));
    return [...shards, ...await directoryPages(session, created)];
  }
}

/** Changed dot pages by the chunk that holds them, in the order the fold met them. */
function chunkPages(dots: readonly ConeDotPage[], session: ConeFoldSession): Map<string, ChunkPages> {
  const groups = new Map<string, ChunkPages>();
  for (const page of dots) {
    const chunk = OrdinalChunk.ofDotPage(page, session.selection);
    const group = groups.get(chunk.toString()) ?? { chunk, pages: [] };
    group.pages.push(page);
    groups.set(chunk.toString(), group);
  }
  return groups;
}

/** What one chunk's changed pages do: the shard to write, if any, and whether the chunk is new. */
type ShardChange = { readonly chunk: OrdinalChunk; readonly write: OrdinalBitmapShard | null; readonly created: boolean };

function shardChange(before: OrdinalBitmapShard | null, chunk: OrdinalChunk, pages: readonly ConeDotPage[]): ShardChange {
  const after = shardAfter(before, chunk, pages);
  if (after === null) {
    return { chunk, write: null, created: false };
  }
  if (before === null) {
    return { chunk, write: after, created: true };
  }
  return { chunk, write: after.equals(before) ? null : after, created: false };
}

/** The shard after `pages`, or null while the chunk has no dot with an owner. */
function shardAfter(before: OrdinalBitmapShard | null, chunk: OrdinalChunk, pages: readonly ConeDotPage[]): OrdinalBitmapShard | null {
  if (before === null && !pages.some((page) => page.hasOwnedDot())) {
    return null;
  }
  return pages.reduce((shard, page) => shard.withPage(page), before ?? OrdinalBitmapShard.empty(LIVENESS_INDEX, chunk));
}

/** The directory pages that change when `created` chunks get their first shard. */
async function directoryPages(session: ConeFoldSession, created: readonly OrdinalChunk[]): Promise<SelectionDirectoryPage[]> {
  const pages: SelectionDirectoryPage[] = [];
  for (const set of ['edge', 'node'] as const) {
    const added = created.filter((chunk) => chunk.segment.kind === set);
    if (added.length > 0) {
      const stored = await readDirectory(session, set);
      pages.push(...changedPages(stored, mergeChunks(stored, added), set));
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
    && ascending(pages.flatMap((page) => [...page.chunks]));
  if (!dense) {
    throw new ConeRecordError('Selection directory pages are not densely packed in ascending order', {
      code: 'E_CONE_RECORD_CORRUPT', context: { set, pages: pages.length },
    });
  }
  return [...pages];
}

/** True when each chunk sorts after the one before it. */
function ascending(chunks: readonly OrdinalChunk[]): boolean {
  let previous: OrdinalChunk | null = null;
  for (const chunk of chunks) {
    if (previous !== null && previous.compare(chunk) >= 0) {
      return false;
    }
    previous = chunk;
  }
  return true;
}

/** The listed chunks with `added` merged in order; a chunk already listed has lost its shard. */
function mergeChunks(pages: readonly SelectionDirectoryPage[], added: readonly OrdinalChunk[]): OrdinalChunk[] {
  const listed = pages.flatMap((page) => [...page.chunks]);
  const missing = added.find((chunk) => listed.some((entry) => entry.equals(chunk)));
  if (missing !== undefined) {
    throw new ConeRecordError('Selection directory lists a chunk whose shard is absent', {
      code: 'E_CONE_RECORD_CORRUPT', context: { chunk: missing.toString() },
    });
  }
  return [...listed, ...added].sort((left, right) => left.compare(right));
}

/** The pages of `chunks`, 256 to a page, that differ from the stored pages. */
function changedPages(stored: readonly SelectionDirectoryPage[], chunks: readonly OrdinalChunk[], set: ConeDotSet): SelectionDirectoryPage[] {
  const pages: SelectionDirectoryPage[] = [];
  for (let start = 0; start < chunks.length; start += SELECTION_DIRECTORY_PAGE_SIZE) {
    const pageIndex = start / SELECTION_DIRECTORY_PAGE_SIZE;
    const page = new SelectionDirectoryPage({
      index: LIVENESS_INDEX, set, pageIndex, chunks: chunks.slice(start, start + SELECTION_DIRECTORY_PAGE_SIZE),
    });
    if (stored[pageIndex]?.equals(page) !== true) {
      pages.push(page);
    }
  }
  return pages;
}
