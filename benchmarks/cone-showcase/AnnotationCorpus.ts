import type { Intent } from '@git-stunts/git-warp';

import { annotations } from '../../examples/annotations/sdk/annotations.generated.ts';

/**
 * A deterministic Reader-shaped annotation history and its expected shape.
 *
 * Every document carries THREADS_PER_DOCUMENT threads, so one document's
 * margins are the same size at every scale; only the rest of the graph grows.
 * Each thread is opened by one writer and answered by the other two.
 */

export const WRITERS = Object.freeze(['alice', 'bob', 'carol']);
export const THREADS_PER_DOCUMENT = 10;
const EPOCH_MS = Date.UTC(2026, 9, 28);

export type Action = Readonly<{ operation: string; intents: readonly Intent[] }>;

export class SeededRandom {
  #state: number;

  constructor(seed: number) {
    this.#state = seed >>> 0;
  }

  /** mulberry32 */
  next(): number {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let value = this.#state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  pick<TValue>(items: readonly TValue[]): TValue {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) {
      throw new RangeError('cannot pick from an empty list');
    }
    return item;
  }
}

export default class AnnotationCorpus {
  readonly documents: readonly string[];
  readonly threadsByDocument = new Map<string, string[]>();
  readonly commentsByThread = new Map<string, string[]>();
  readonly #threadOwner = new Map<string, number>();
  readonly #threadDocument = new Map<string, string>();
  #threads = 0;
  #comments = 0;
  #clock = 0;

  constructor(threads: number) {
    const count = Math.max(1, Math.ceil(threads / THREADS_PER_DOCUMENT));
    this.documents = Object.freeze(Array.from({ length: count }, (_unused, index) => `d${index}`));
    for (let index = 0; index < threads; index += 1) {
      this.#open(this.documents[Math.floor(index / THREADS_PER_DOCUMENT)] ?? 'd0', index % WRITERS.length);
    }
  }

  /** The openThread action of every thread `writer` owns, in id order. */
  openings(writer: number): Action[] {
    return [...this.#threadOwner].filter(([, owner]) => owner === writer).map(([threadId]) => this.#openAction(threadId));
  }

  /** One reply by `writer` on every thread another writer owns. */
  replies(writer: number): Action[] {
    const actions: Action[] = [];
    for (const [threadId, owner] of this.#threadOwner) {
      if (owner !== writer) {
        actions.push(this.reply(threadId, WRITERS[writer] ?? 'alice'));
      }
    }
    return actions;
  }

  reply(threadId: string, author: string): Action {
    const comments = this.commentsByThread.get(threadId) ?? [];
    const commentId = `c${this.#comments++}`;
    const inReplyTo = comments[comments.length - 1] ?? null;
    comments.push(commentId);
    return Object.freeze({
      operation: 'reply',
      intents: annotations.intents.reply({ threadId, commentId, inReplyTo, author, body: `reply ${commentId}`, createdAt: this.#tick() }),
    });
  }

  edit(commentId: string): Action {
    return Object.freeze({
      operation: 'editComment',
      intents: annotations.intents.editComment({ commentId, body: `edited ${commentId}`, editedAt: this.#tick() }),
    });
  }

  openOn(documentId: string, writer: number): Action {
    return this.#openAction(this.#open(documentId, writer));
  }

  /** A measured one-patch save: a reply, an edit, or a new thread, drawn from `random`. */
  nextSave(random: SeededRandom, writer: number): Action {
    const roll = random.next();
    const documentId = random.pick(this.documents);
    const threadId = random.pick(this.threadsByDocument.get(documentId) ?? []);
    if (roll < 0.5) {
      return this.reply(threadId, WRITERS[writer] ?? 'alice');
    }
    if (roll < 0.8) {
      return this.edit(random.pick(this.commentsByThread.get(threadId) ?? []));
    }
    return this.openOn(documentId, writer);
  }

  #open(documentId: string, writer: number): string {
    const threadId = `t${this.#threads++}`;
    const threads = this.threadsByDocument.get(documentId) ?? [];
    threads.push(threadId);
    this.threadsByDocument.set(documentId, threads);
    this.#threadOwner.set(threadId, writer);
    this.#threadDocument.set(threadId, documentId);
    this.commentsByThread.set(threadId, [`c${this.#comments++}`]);
    return threadId;
  }

  #openAction(threadId: string): Action {
    const documentId = this.#threadDocument.get(threadId) ?? 'd0';
    const [commentId = 'c0'] = this.commentsByThread.get(threadId) ?? [];
    return Object.freeze({
      operation: 'openThread',
      intents: annotations.intents.openThread({
        documentId, threadId, quote: `passage ${threadId}`, start: 0, end: 12,
        commentId, author: WRITERS[this.#threadOwner.get(threadId) ?? 0] ?? 'alice', body: `note ${threadId}`, createdAt: this.#tick(),
      }),
    });
  }

  #tick(): string {
    return new Date(EPOCH_MS + (this.#clock++ * 1000)).toISOString();
  }
}
