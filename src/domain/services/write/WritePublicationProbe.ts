import type { NodeInfo } from '../../../ports/CommitPort.ts';
import type CommitMessageCodecPort from '../../../ports/CommitMessageCodecPort.ts';
import MessageCodecError from '../../errors/MessageCodecError.ts';
import { buildWriterRef } from '../../utils/RefLayout.ts';
import type WriteAttemptRecord from './WriteAttemptRecord.ts';

/** Commits walked back from a writer's tip before a crash recovery stops looking. */
const MAX_WALK = 4096;

/** The history surface a probe reads. */
export type WritePublicationHistory = {
  readRef(ref: string): Promise<string | null>;
  getNodeInfo(sha: string): Promise<NodeInfo>;
};

/** What the writer's chain says about one attempt: its commit, another patch in its place, or nothing yet. */
export type WritePublicationFinding =
  | { readonly kind: 'own'; readonly commit: string }
  | { readonly kind: 'other' }
  | { readonly kind: 'none' };

const OTHER: WritePublicationFinding = Object.freeze({ kind: 'other' });
const NONE: WritePublicationFinding = Object.freeze({ kind: 'none' });

/**
 * Reads the writer's chain, the only thing that can prove an attempt's publication.
 * A patch commit names the attempt that published it, and at most one commit can
 * follow a predecessor on a compare-and-swapped chain: if that commit names this
 * attempt it published, and if it names anything else this attempt never can.
 */
export default class WritePublicationProbe {
  readonly #graph: string;
  readonly #history: WritePublicationHistory;
  readonly #messages: CommitMessageCodecPort;

  constructor(fields: { readonly graph: string; readonly history: WritePublicationHistory; readonly messages: CommitMessageCodecPort }) {
    this.#graph = fields.graph;
    this.#history = fields.history;
    this.#messages = fields.messages;
    Object.freeze(this);
  }

  /** Whether `commit` is the attempt's own: its writer, its attempt and its predecessor as parent. */
  async proves(commit: string, record: WriteAttemptRecord): Promise<boolean> {
    return this.#isOwn(await this.#history.getNodeInfo(commit), record);
  }

  /** Finds the commit that followed the attempt's predecessor on its writer's chain. */
  async locate(record: WriteAttemptRecord): Promise<WritePublicationFinding> {
    const { writerId, predecessor } = record.premise;
    const tip = await this.#history.readRef(buildWriterRef(this.#graph, writerId));
    return tip === null || tip === predecessor ? NONE : await this.#walkBack(tip, record);
  }

  async #walkBack(tip: string, record: WriteAttemptRecord): Promise<WritePublicationFinding> {
    let current: string | null = tip;
    for (let walked = 0; current !== null && walked < MAX_WALK; walked += 1) {
      const info: NodeInfo = await this.#history.getNodeInfo(current);
      const parent = firstParent(info);
      if (parent === record.premise.predecessor) {
        return this.#isOwn(info, record) ? { kind: 'own', commit: current } : OTHER;
      }
      current = parent;
    }
    return NONE;
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
