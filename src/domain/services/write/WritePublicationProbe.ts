import type { NodeInfo } from '../../../ports/CommitPort.ts';
import type CommitMessageCodecPort from '../../../ports/CommitMessageCodecPort.ts';
import MessageCodecError from '../../errors/MessageCodecError.ts';
import { buildWriterRef } from '../../utils/RefLayout.ts';
import type WriteAttemptRecord from './WriteAttemptRecord.ts';
import type WriteReadBudget from './WriteReadBudget.ts';

/** First-parent commits back from a writer's tip that one probe may search for an attempt's predecessor. */
export const PUBLICATION_PROBE_WINDOW = 4096;
/** The most commits one probe lists: its window, and one more that shows the predecessor lies beyond it. */
export const PUBLICATION_PROBE_READS = PUBLICATION_PROBE_WINDOW + 1;

/** The history surface a probe reads. */
export type WritePublicationHistory = {
  readRef(ref: string): Promise<string | null>;
  getNodeInfo(sha: string): Promise<NodeInfo>;
  /**
   * In one read, up to `limit` commits of `stopAt..tip` along first parents, newest first.
   * A null `stopAt` lists back to the root.
   */
  firstParentsSince(range: { readonly tip: string; readonly stopAt: string | null; readonly limit: number }): Promise<readonly string[]>;
};

/**
 * What the writer's chain says about one attempt: its commit, another patch in its place,
 * nothing yet, or a predecessor further back than one probe reads. The chain only grows,
 * so an `exhausted` attempt can never come back into reach.
 */
export type WritePublicationFinding =
  | { readonly kind: 'own'; readonly commit: string }
  | { readonly kind: 'other' }
  | { readonly kind: 'none' }
  | { readonly kind: 'exhausted' };

const OTHER: WritePublicationFinding = Object.freeze({ kind: 'other' });
const NONE: WritePublicationFinding = Object.freeze({ kind: 'none' });
const EXHAUSTED: WritePublicationFinding = Object.freeze({ kind: 'exhausted' });

/**
 * Reads the writer's chain, the only thing that can prove an attempt's publication.
 * A patch commit names the attempt that published it, and at most one commit can
 * follow a predecessor on a compare-and-swapped chain: if that commit names this
 * attempt it published, and if it names anything else this attempt never can.
 * One probe costs three Git reads however deep the chain is (#1075).
 */
export default class WritePublicationProbe {
  readonly #graph: string;
  readonly #history: WritePublicationHistory;
  readonly #messages: CommitMessageCodecPort;
  readonly #budget: WriteReadBudget | null;

  constructor(fields: {
    readonly graph: string;
    readonly history: WritePublicationHistory;
    readonly messages: CommitMessageCodecPort;
    readonly budget?: WriteReadBudget;
  }) {
    this.#graph = fields.graph;
    this.#history = fields.history;
    this.#messages = fields.messages;
    this.#budget = fields.budget ?? null;
    Object.freeze(this);
  }

  /** This probe, charging every commit it lists to `budget`. */
  within(budget: WriteReadBudget): WritePublicationProbe {
    return new WritePublicationProbe({ graph: this.#graph, history: this.#history, messages: this.#messages, budget });
  }

  /** Whether `commit` is the attempt's own: its writer, its attempt and its predecessor as parent. */
  async proves(commit: string, record: WriteAttemptRecord): Promise<boolean> {
    return this.#isOwn(await this.#history.getNodeInfo(commit), record);
  }

  /** Finds the commit that followed the attempt's predecessor on its writer's chain. */
  async locate(record: WriteAttemptRecord): Promise<WritePublicationFinding> {
    const { writerId, predecessor } = record.premise;
    const tip = await this.#history.readRef(buildWriterRef(this.#graph, writerId));
    return tip === null || tip === predecessor ? NONE : await this.#successor(tip, record);
  }

  /** The oldest commit listed is the predecessor's successor, if the chain holds the predecessor at all. */
  async #successor(tip: string, record: WriteAttemptRecord): Promise<WritePublicationFinding> {
    const listed = await this.#history.firstParentsSince({ tip, stopAt: record.premise.predecessor, limit: PUBLICATION_PROBE_READS });
    this.#budget?.spend(listed.length);
    const oldest = listed.at(-1);
    if (oldest === undefined) {
      return NONE;
    }
    return listed.length > PUBLICATION_PROBE_WINDOW ? EXHAUSTED : await this.#findingAt(oldest, record);
  }

  async #findingAt(commit: string, record: WriteAttemptRecord): Promise<WritePublicationFinding> {
    const info = await this.#history.getNodeInfo(commit);
    if (firstParent(info) !== record.premise.predecessor) {
      return NONE;
    }
    return this.#isOwn(info, record) ? { kind: 'own', commit } : OTHER;
  }

  #isOwn(info: NodeInfo, record: WriteAttemptRecord): boolean {
    const { writerId, predecessor } = record.premise;
    const parentMatches = firstParent(info) === predecessor && info.parents.length <= 1;
    return parentMatches && this.#namesAttempt(info.message, { writerId, attemptId: record.attemptId.value });
  }

  #namesAttempt(message: string, expected: { readonly writerId: string; readonly attemptId: string }): boolean {
    try {
      const decoded = this.#messages.decodePatch(message);
      return decoded.graph === this.#graph && decoded.writer === expected.writerId && decoded.publicationAttempt === expected.attemptId;
    } catch (error) {
      if (error instanceof MessageCodecError) {
        return false;
      }
      throw error;
    }
  }
}

function firstParent(info: NodeInfo): string | null {
  return info.parents[0] ?? null;
}
