import { createObserver, reading } from '../../advanced.ts';
import type { Lane, ReadingValue } from '../../index.ts';
import { COMMENT_LABEL, THREAD_LABEL, commentNode, documentNode, threadNode } from './MarginCorpus.ts';
import { Margins, MarginsUnavailable, type MarginsRead } from './Margins.ts';

const PAGE_LIMIT = 100;
const PAGE_COUNT_LIMIT = 100;

/** One bounded page of neighbour ids, with the node prefix removed. */
class NeighborPage {
  readonly ids: readonly string[];
  readonly cursor: string | null;

  constructor(ids: readonly string[], cursor: string | null) {
    this.ids = Object.freeze([...ids]);
    this.cursor = cursor;
    Object.freeze(this);
  }
}

class MarginReadError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'MarginReadError';
  }
}

function neighborId(edge: ReadingValue, prefix: string): string {
  if (typeof edge === 'object' && edge !== null && 'neighborId' in edge && typeof edge.neighborId === 'string'
    && edge.neighborId.startsWith(prefix)) {
    return edge.neighborId.slice(prefix.length);
  }
  throw new MarginReadError(`a margins neighbour must be a ${prefix} node`);
}

function decodePage(value: ReadingValue, prefix: string): NeighborPage {
  if (typeof value !== 'object' || value === null || !('edges' in value) || !Array.isArray(value.edges) || !('cursor' in value)) {
    throw new MarginReadError('a margins Observer expected a neighbourhood page');
  }
  const edges: readonly ReadingValue[] = value.edges;
  if (value.cursor !== null && (typeof value.cursor !== 'string' || value.cursor.length === 0)) {
    throw new MarginReadError('a margins cursor must be null or a nonempty string');
  }
  return new NeighborPage(edges.map((edge) => neighborId(edge, prefix)), value.cursor);
}

/**
 * Reads one document's margins through `Lane.observe`: one neighbourhood page of
 * the document's threads, then one per thread for its comments. This read path
 * survives #1054; #1052 ports it to the Optic read when it deletes `Lane.observe`.
 */
export default class MarginReader {
  readonly #lane: Lane;

  constructor(lane: Lane) {
    this.#lane = lane;
  }

  async margins(documentId: string): Promise<MarginsRead> {
    const threads = await this.#neighbors('cone-showcase.document-threads', documentNode(documentId), THREAD_LABEL, 'thread:');
    if (threads instanceof MarginsUnavailable) {
      return threads;
    }
    const comments = new Map<string, readonly string[]>();
    for (const threadId of threads) {
      const page = await this.#neighbors('cone-showcase.thread-comments', threadNode(threadId), COMMENT_LABEL, commentNode(''));
      if (page instanceof MarginsUnavailable) {
        return page;
      }
      comments.set(threadId, page);
    }
    return new Margins(documentId, comments);
  }

  async #neighbors(id: string, subject: string, label: string, prefix: string): Promise<readonly string[] | MarginsUnavailable> {
    const ids: string[] = [];
    const seenIds = new Set<string>();
    const seenCursors = new Set<string>();
    let pages = 0;
    let cursor: string | null = null;
    do {
      if (++pages > PAGE_COUNT_LIMIT) {
        throw new MarginReadError('the bounded margins page reserve is exhausted');
      }
      const page = await this.#page(id, subject, label, prefix, cursor);
      if (page instanceof MarginsUnavailable) {
        return page;
      }
      for (const id of page.ids) {
        if (seenIds.has(id)) {
          throw new MarginReadError('a margins read repeated a neighbour identity');
        }
        seenIds.add(id);
        ids.push(id);
      }
      cursor = page.cursor;
      if (cursor !== null) {
        if (seenCursors.has(cursor)) {
          throw new MarginReadError('a margins read repeated its pagination cursor');
        }
        seenCursors.add(cursor);
      }
    } while (cursor !== null);
    return ids;
  }

  async #page(id: string, subject: string, label: string, prefix: string, cursor: string | null): Promise<NeighborPage | MarginsUnavailable> {
    const plan = reading.neighborhood({ subject, direction: 'out', labels: [label], limit: PAGE_LIMIT, ...(cursor === null ? {} : { cursor }) });
    const observation = this.#lane.observe(createObserver(id, plan, (value) => value));
    const pages: NeighborPage[] = [];
    for await (const entry of observation) {
      pages.push(decodePage(entry.value, prefix));
    }
    const receipt = await observation.receipt;
    const [page] = pages;
    if (receipt.status !== 'completed' || page === undefined || pages.length !== 1) {
      return new MarginsUnavailable(id, receipt.status, receipt.reason ?? 'expected exactly one neighbourhood page');
    }
    return page;
  }
}
