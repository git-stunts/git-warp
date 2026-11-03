import type ObservationSupportLimits from '../../domain/services/custody/ObservationSupportLimits.ts';
import type ConeFrontier from '../../domain/services/cone/ConeFrontier.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import ConeFrontierCborCodec from './ConeFrontierCborCodec.ts';
import type { GitPlumbing } from './gitErrorClassification.ts';
import type { GitTreeObjectEntry } from './GitTreeObjectEntry.ts';
import type ObservationWorkMeter from './ObservationWorkMeter.ts';

const FRONTIER_ENTRY = 'frontier';

export type ObservationBasisHistory = {
  readonly plumbing: Pick<GitPlumbing, 'execute'>;
  nodeExists(oid: string): Promise<boolean>;
  readBlob(oid: string): Promise<Uint8Array>;
  readTreeObjectEntries(treeOid: string): Promise<readonly GitTreeObjectEntry[]>;
};

export type ObservationBasisProblem = 'missing' | 'corrupt' | 'frontier-limit' | 'writer-limit' | 'work-limit';

/**
 * Reads the writer heads a cone basis requires from the frontier stored in its
 * own tree, which its object id commits to. Heads are distinct and in writer-id
 * order, so one basis always yields one sequence. The frontier is a single blob,
 * so its byte size is bounded before it is read.
 */
export default class ObservationBasisFrontier {
  readonly #history: ObservationBasisHistory;
  readonly #frontiers: ConeFrontierCborCodec;
  readonly #limits: ObservationSupportLimits;

  constructor(options: {
    readonly history: ObservationBasisHistory;
    readonly codec: CodecPort;
    readonly limits: ObservationSupportLimits;
  }) {
    this.#history = options.history;
    this.#frontiers = new ConeFrontierCborCodec(options.codec);
    this.#limits = options.limits;
    Object.freeze(this);
  }

  /** The basis's writer heads, once its tree and every top-level entry exist. */
  async heads(basis: string, meter: ObservationWorkMeter): Promise<readonly string[] | ObservationBasisProblem> {
    if (!meter.spend(1)) {
      return 'work-limit';
    }
    if (!await this.#history.nodeExists(basis)) {
      return 'missing';
    }
    const entries = await this.#entries(basis);
    if (typeof entries === 'string') {
      return entries;
    }
    const missing = await this.#firstProblem(entries, meter);
    return missing ?? await this.#frontierHeads(entries, meter);
  }

  async #entries(basis: string): Promise<readonly GitTreeObjectEntry[] | 'corrupt'> {
    try {
      return await this.#history.readTreeObjectEntries(basis);
    } catch {
      return 'corrupt';
    }
  }

  async #firstProblem(entries: readonly GitTreeObjectEntry[], meter: ObservationWorkMeter): Promise<ObservationBasisProblem | null> {
    for (const entry of entries) {
      if (!meter.spend(1)) {
        return 'work-limit';
      }
      if (!await this.#history.nodeExists(entry.oid)) {
        return 'missing';
      }
    }
    return null;
  }

  async #frontierHeads(entries: readonly GitTreeObjectEntry[], meter: ObservationWorkMeter): Promise<readonly string[] | ObservationBasisProblem> {
    const entry = entries.find((candidate) => candidate.name === FRONTIER_ENTRY);
    if (entry === undefined) {
      return 'corrupt';
    }
    const size = await this.#sizeOf(entry.oid);
    if (size === null) {
      return 'corrupt';
    }
    if (size > this.#limits.frontierBytes) {
      return 'frontier-limit';
    }
    return meter.spend(1) ? await this.#decodedHeads(entry.oid) : 'work-limit';
  }

  /** The frontier blob's byte size, or null when Git cannot read even its header. */
  async #sizeOf(oid: string): Promise<number | null> {
    try {
      return Number(await this.#history.plumbing.execute({ args: ['cat-file', '-s', oid] }));
    } catch {
      return null;
    }
  }

  async #decodedHeads(oid: string): Promise<readonly string[] | ObservationBasisProblem> {
    const frontier = await this.#decoded(oid);
    if (frontier === null) {
      return 'corrupt';
    }
    const heads = [...new Set(frontier.entries().map(([, position]) => position.sha))];
    return heads.length > this.#limits.writers ? 'writer-limit' : heads;
  }

  async #decoded(oid: string): Promise<ConeFrontier | null> {
    try {
      return this.#frontiers.decode(await this.#history.readBlob(oid));
    } catch {
      return null;
    }
  }
}
