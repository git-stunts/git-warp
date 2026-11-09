import { intent } from '../../advanced.ts';
import type { Intent } from '../../index.ts';
import MarginAction from './MarginAction.ts';
import type SeededRandom from './SeededRandom.ts';

export const MARGINS_LANE = 'margins';
export const WRITERS = Object.freeze(['alice', 'bob', 'carol']);
export const THREADS_PER_DOCUMENT = 10;
export const THREAD_LABEL = 'has_thread';
export const COMMENT_LABEL = 'has_comment';

export const documentNode = (id: string): string => `document:${id}`;
export const threadNode = (id: string): string => `thread:${id}`;
export const commentNode = (id: string): string => `comment:${id}`;

const OPEN_SHARE = 0.2;
const REPLY_SHARE = 0.5;

/**
 * A deterministic annotation history and the margins it should read back.
 *
 * Documents hold threads; threads hold comments. Every document carries
 * THREADS_PER_DOCUMENT threads at load, so one document's margins are the same
 * size at every scale and only the rest of the graph grows. Each thread is
 * opened by one writer and answered once by each other writer. The corpus is
 * local to the witness on purpose: `examples/annotations/` belongs to #1055.
 */
export default class MarginCorpus {
  readonly documents: readonly string[];
  readonly #threadsByDocument = new Map<string, string[]>();
  readonly #commentsByThread = new Map<string, string[]>();
  readonly #threadOwner = new Map<string, number>();
  readonly #threadDocument = new Map<string, string>();
  #threads = 0;
  #comments = 0;

  constructor(threads: number) {
    if (!Number.isSafeInteger(threads) || threads < 1) {
      throw new RangeError('a margin corpus needs a positive whole number of threads');
    }
    const count = Math.ceil(threads / THREADS_PER_DOCUMENT);
    this.documents = Object.freeze(Array.from({ length: count }, (_unused, index) => `d${String(index)}`));
    for (let index = 0; index < threads; index += 1) {
      this.#open(this.#document(Math.floor(index / THREADS_PER_DOCUMENT)), index % WRITERS.length);
    }
  }

  /** The thread ids one document's margins should list. */
  threadsOf(documentId: string): readonly string[] {
    return Object.freeze([...(this.#threadsByDocument.get(documentId) ?? [])]);
  }

  /** The comment ids one thread should list. */
  commentsOf(threadId: string): readonly string[] {
    return Object.freeze([...(this.#commentsByThread.get(threadId) ?? [])]);
  }

  /** The intents that create every document node. */
  documentIntents(): readonly Intent[] {
    return Object.freeze(this.documents.map((id) => intent.node.add({ subject: documentNode(id) })));
  }

  /** The openThread action of every thread `writer` owns, in id order. */
  openings(writer: number): readonly MarginAction[] {
    return Object.freeze([...this.#threadOwner]
      .filter(([, owner]) => owner === writer)
      .map(([threadId]) => this.#openAction(threadId)));
  }

  /** One reply by `writer` on every thread another writer owns. */
  replies(writer: number): readonly MarginAction[] {
    const threads = [...this.#threadOwner].filter(([, owner]) => owner !== writer).map(([threadId]) => threadId);
    return Object.freeze(threads.map((threadId) => this.#reply(threadId, writer)));
  }

  /** A measured one-patch save drawn from `random`: a reply, an edit, or a new thread. */
  nextSave(random: SeededRandom, writer: number): MarginAction {
    const roll = random.next();
    const documentId = random.pick(this.documents);
    const threadId = random.pick(this.threadsOf(documentId));
    if (roll < REPLY_SHARE) {
      return this.#reply(threadId, writer);
    }
    if (roll < 1 - OPEN_SHARE) {
      return this.#edit(random.pick(this.commentsOf(threadId)), documentId);
    }
    return this.#openAction(this.#open(documentId, writer));
  }

  #document(index: number): string {
    const id = this.documents[index];
    if (id === undefined) {
      throw new RangeError(`no document at ${String(index)}`);
    }
    return id;
  }

  #open(documentId: string, writer: number): string {
    const threadId = `t${String(this.#threads++)}`;
    this.#threadsByDocument.set(documentId, [...(this.#threadsByDocument.get(documentId) ?? []), threadId]);
    this.#threadOwner.set(threadId, writer);
    this.#threadDocument.set(threadId, documentId);
    this.#commentsByThread.set(threadId, [`c${String(this.#comments++)}`]);
    return threadId;
  }

  #openAction(threadId: string): MarginAction {
    const documentId = this.#threadDocument.get(threadId);
    const [commentId] = this.commentsOf(threadId);
    const owner = this.#threadOwner.get(threadId);
    if (documentId === undefined || commentId === undefined || owner === undefined) {
      throw new RangeError(`thread ${threadId} is not in the corpus`);
    }
    return new MarginAction('openThread', documentId, threadId, [
      intent.node.add({ subject: threadNode(threadId) }),
      intent.property.set({ subject: threadNode(threadId), key: 'quote', value: `passage ${threadId}` }),
      intent.edge.add({ from: documentNode(documentId), to: threadNode(threadId), label: THREAD_LABEL }),
      ...this.#commentIntents(threadId, commentId, owner),
    ]);
  }

  #reply(threadId: string, writer: number): MarginAction {
    const documentId = this.#threadDocument.get(threadId);
    if (documentId === undefined) {
      throw new RangeError('a reply needs a corpus thread');
    }
    const commentId = `c${String(this.#comments++)}`;
    this.#commentsByThread.set(threadId, [...this.commentsOf(threadId), commentId]);
    return new MarginAction('reply', documentId, commentId, this.#commentIntents(threadId, commentId, writer));
  }

  #edit(commentId: string, documentId: string): MarginAction {
    return new MarginAction('editComment', documentId, commentId, [
      intent.property.set({ subject: commentNode(commentId), key: 'body', value: `edited ${commentId}` }),
    ]);
  }

  #commentIntents(threadId: string, commentId: string, writer: number): readonly Intent[] {
    return [
      intent.node.add({ subject: commentNode(commentId) }),
      intent.property.set({ subject: commentNode(commentId), key: 'author', value: WRITERS[writer] ?? 'alice' }),
      intent.property.set({ subject: commentNode(commentId), key: 'body', value: `note ${commentId}` }),
      intent.edge.add({ from: threadNode(threadId), to: commentNode(commentId), label: COMMENT_LABEL }),
    ];
  }
}
