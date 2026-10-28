import type { Intent, Lane, Observer, ObservationReceipt, RepairHint, WriteReceipt, WriteIntentInput } from '@git-stunts/git-warp';

import ReceiptLedger from './ReceiptLedger.ts';
import { annotations, type FieldValue, type NeighborPage } from './sdk/annotations.generated.ts';

/**
 * Margin notes on top of one git-warp Lane: write intents, observe bounded
 * readings, keep receipts.
 *
 * - Every user action is one generated Intent array, one `lane.write`, one
 *   patch, one WriteReceipt.
 * - Every screen is a few generated Observers that name exactly the entities
 *   they need: a document, its threads, their comments. Nothing reads the
 *   whole graph, so there is nothing to materialize or repair first.
 * - Every receipt is kept in a ReceiptLedger.
 */

export type Comment = Readonly<{
  id: string; author: string; body: string; createdAt: string; inReplyTo: string | null; editedAt: string | null;
}>;

export type Thread = Readonly<{
  id: string; document: string; quote: string; start: number; end: number;
  status: string; resolvedBy: string | null; comments: readonly Comment[];
}>;

export type Margins = Readonly<{ documentId: string; threads: readonly Thread[] }>;

/** An expected failure: the runtime could not answer a bounded question and said why. */
export class MarginsUnavailable {
  readonly observer: string;
  readonly status: string;
  readonly reason: string;
  readonly repairHints: readonly RepairHint[];

  constructor(observer: string, receipt: ObservationReceipt) {
    this.observer = observer;
    this.status = receipt.status;
    this.reason = receipt.reason ?? 'unspecified';
    this.repairHints = receipt.repairHints;
    Object.freeze(this);
  }
}

class MarginRecordError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'MarginRecordError';
  }
}

function text(value: FieldValue | undefined, field: string): string {
  if (typeof value !== 'string') {
    throw new MarginRecordError(`${field} must be a string`);
  }
  return value;
}

function optionalText(value: FieldValue | undefined, field: string): string | null {
  return value === null || value === undefined ? null : text(value, field);
}

function integer(value: FieldValue | undefined, field: string): number {
  if (typeof value !== 'number') {
    throw new MarginRecordError(`${field} must be a number`);
  }
  return value;
}

/** Splits subject-major readings into one key/value map per subject. */
function records(values: readonly FieldValue[], keys: readonly string[]): ReadonlyMap<string, FieldValue>[] {
  const out: ReadonlyMap<string, FieldValue>[] = [];
  for (let offset = 0; offset < values.length; offset += keys.length) {
    out.push(new Map(keys.map((key, index) => [key, values[offset + index] ?? null])));
  }
  return out;
}

function chunks(ids: readonly string[], size: number): readonly (readonly string[])[] {
  const out: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    out.push(ids.slice(index, index + size));
  }
  return out;
}

export default class MarginStore {
  readonly #lane: Lane;
  readonly ledger: ReceiptLedger;

  constructor(lane: Lane, ledger: ReceiptLedger) {
    this.#lane = lane;
    this.ledger = ledger;
  }

  /** Writes one user action as one patch and keeps its receipt. */
  async save(operation: string, intents: readonly Intent[]): Promise<WriteReceipt<WriteIntentInput>> {
    const receipt = await this.#lane.write(intents);
    this.ledger.recordWrite(operation, receipt);
    return receipt;
  }

  /** One document's threads and comments, read through four bounded Observers. */
  async margins(documentId: string): Promise<Margins | MarginsUnavailable> {
    const threadIds = await this.#pagedIds('documentThreads', (cursor) =>
      annotations.observers.documentThreads({ documentId, cursor }));
    if (threadIds instanceof MarginsUnavailable) {
      return threadIds;
    }
    const threads: Thread[] = [];
    for (const batch of chunks(threadIds, annotations.limits.threadFields)) {
      const loaded = await this.#threads(batch);
      if (loaded instanceof MarginsUnavailable) {
        return loaded;
      }
      threads.push(...loaded);
    }
    return Object.freeze({ documentId, threads: Object.freeze(threads) });
  }

  async #threads(threadIds: readonly string[]): Promise<readonly Thread[] | MarginsUnavailable> {
    const fields = await this.#collect('threadFields', annotations.observers.threadFields({ threadIds: [...threadIds] }));
    const pages = await this.#collect('threadComments', annotations.observers.threadComments({ threadIds: [...threadIds] }));
    if (fields instanceof MarginsUnavailable) {
      return fields;
    }
    if (pages instanceof MarginsUnavailable) {
      return pages;
    }
    const commentIds: string[][] = [];
    for (const [index, page] of pages.entries()) {
      const ids = await this.#remainingComments(threadIds[index] ?? '', page);
      if (ids instanceof MarginsUnavailable) {
        return ids;
      }
      commentIds.push(ids);
    }
    const comments = await this.#comments(commentIds.flat());
    if (comments instanceof MarginsUnavailable) {
      return comments;
    }
    return records(fields, annotations.fields.threadFields).map((record, index) => Object.freeze({
      id: threadIds[index] ?? '',
      document: text(record.get('document'), 'thread.document'),
      quote: text(record.get('quote'), 'thread.quote'),
      start: integer(record.get('start'), 'thread.start'),
      end: integer(record.get('end'), 'thread.end'),
      status: text(record.get('status'), 'thread.status'),
      resolvedBy: optionalText(record.get('resolvedBy'), 'thread.resolvedBy'),
      comments: Object.freeze((commentIds[index] ?? []).flatMap((id) => comments.get(id) ?? [])
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))),
    }));
  }

  async #remainingComments(threadId: string, first: NeighborPage): Promise<string[] | MarginsUnavailable> {
    const ids = [...first.ids];
    if (first.complete) {
      return ids;
    }
    const rest = await this.#pagedIds('threadCommentPage', (cursor) =>
      annotations.observers.threadCommentPage({ threadId, cursor }), first.cursor);
    return rest instanceof MarginsUnavailable ? rest : [...ids, ...rest];
  }

  async #comments(commentIds: readonly string[]): Promise<ReadonlyMap<string, Comment> | MarginsUnavailable> {
    const out = new Map<string, Comment>();
    for (const batch of chunks(commentIds, annotations.limits.commentFields)) {
      const values = await this.#collect('commentFields', annotations.observers.commentFields({ commentIds: [...batch] }));
      if (values instanceof MarginsUnavailable) {
        return values;
      }
      for (const [index, record] of records(values, annotations.fields.commentFields).entries()) {
        const id = batch[index] ?? '';
        out.set(id, Object.freeze({
          id,
          author: text(record.get('author'), 'comment.author'),
          body: text(record.get('body'), 'comment.body'),
          createdAt: text(record.get('createdAt'), 'comment.createdAt'),
          inReplyTo: optionalText(record.get('inReplyTo'), 'comment.inReplyTo'),
          editedAt: optionalText(record.get('editedAt'), 'comment.editedAt'),
        }));
      }
    }
    return out;
  }

  async #pagedIds(name: string, page: (cursor: string | null) => Observer<NeighborPage>, start: string | null = null): Promise<string[] | MarginsUnavailable> {
    const ids: string[] = [];
    let cursor = start;
    do {
      const pages = await this.#collect(name, page(cursor));
      if (pages instanceof MarginsUnavailable) {
        return pages;
      }
      const [current] = pages;
      if (current === undefined) {
        throw new MarginRecordError(`${name} returned no page`);
      }
      ids.push(...current.ids);
      cursor = current.complete ? null : current.cursor;
    } while (cursor !== null);
    return ids;
  }

  /** Runs one Observation to its receipt; an unsettled receipt is a value, not an exception. */
  async #collect<TValue extends FieldValue | NeighborPage>(name: string, observer: Observer<TValue>): Promise<readonly TValue[] | MarginsUnavailable> {
    const observation = this.#lane.observe(observer);
    const values: TValue[] = [];
    for await (const reading of observation) {
      values.push(reading.value);
    }
    const receipt = await observation.receipt;
    this.ledger.recordObservation(name, receipt);
    return receipt.status === 'completed' ? values : new MarginsUnavailable(name, receipt);
  }
}
