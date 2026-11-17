import type ObservationSupportLimits from '../../domain/services/custody/ObservationSupportLimits.ts';
import type ConeFrontier from '../../domain/services/cone/ConeFrontier.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import ConeFrontierCborCodec from './ConeFrontierCborCodec.ts';
import type { FrontierHead } from './FrontierAnchorPlan.ts';
import type { GitPlumbing } from './gitErrorClassification.ts';
import GitObjectFormat from './GitObjectFormat.ts';
import type { GitTreeObjectEntry } from './GitTreeObjectEntry.ts';
import { isObjectFault } from './ObservationObjectFault.ts';
import { isMissingObject, objectTypes } from './ObservationObjectTypes.ts';
import type ObservationWorkMeter from './ObservationWorkMeter.ts';

const FRONTIER_ENTRY = 'frontier';

export type ObservationBasisHistory = {
  readonly plumbing: Pick<GitPlumbing, 'execute'>;
  readBlob(oid: string): Promise<Uint8Array>;
  readTreeObjectEntries(treeOid: string): Promise<readonly GitTreeObjectEntry[]>;
};

export type ObservationBasisProblem = 'missing' | 'corrupt' | 'frontier-limit' | 'work-limit';

/** The writer heads a basis requires, and the object format they are ids in. */
export type ObservationBasisHeads = { readonly format: GitObjectFormat; readonly heads: readonly FrontierHead[] };

/**
 * Reads the writer heads a cone basis requires from the frontier stored in its
 * own tree, which its object id commits to. Heads are distinct, each with the first
 * writer in writer-id order that names it, so one basis always yields one sequence.
 * The frontier is a single blob, so its byte size is bounded before it is read; it
 * bounds how many writers a basis can name (#1197).
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
  async heads(basis: string, meter: ObservationWorkMeter): Promise<ObservationBasisHeads | ObservationBasisProblem> {
    if (!meter.spend(1)) {
      return 'work-limit';
    }
    const entries = await this.#entries(basis);
    if (typeof entries === 'string') {
      return entries;
    }
    const missing = await this.#firstProblem(entries, meter);
    return missing ?? await this.#frontierHeads(entries, meter);
  }

  async #entries(basis: string): Promise<readonly GitTreeObjectEntry[] | 'missing' | 'corrupt'> {
    const [type = ''] = await objectTypes(this.#history.plumbing, [basis]);
    if (isMissingObject(type)) {
      return 'missing';
    }
    return type === 'tree' ? await this.#treeEntries(basis) : 'corrupt';
  }

  async #treeEntries(basis: string): Promise<readonly GitTreeObjectEntry[] | 'corrupt'> {
    try {
      return await this.#history.readTreeObjectEntries(basis);
    } catch (cause) {
      if (isObjectFault(cause)) {
        return 'corrupt';
      }
      throw cause;
    }
  }

  async #firstProblem(entries: readonly GitTreeObjectEntry[], meter: ObservationWorkMeter): Promise<ObservationBasisProblem | null> {
    if (!meter.spend(entries.length)) {
      return 'work-limit';
    }
    const types = await objectTypes(this.#history.plumbing, entries.map((entry) => entry.oid));
    return types.some(isMissingObject) ? 'missing' : null;
  }

  /** The frontier entry's own id names the repository's object format, which every head must share. */
  async #frontierHeads(entries: readonly GitTreeObjectEntry[], meter: ObservationWorkMeter): Promise<ObservationBasisHeads | ObservationBasisProblem> {
    const entry = entries.find((candidate) => candidate.name === FRONTIER_ENTRY);
    const format = entry === undefined ? null : GitObjectFormat.ofOid(entry.oid);
    return entry === undefined || format === null ? 'corrupt' : await this.#boundedHeads(entry.oid, format, meter);
  }

  async #boundedHeads(oid: string, format: GitObjectFormat, meter: ObservationWorkMeter): Promise<ObservationBasisHeads | ObservationBasisProblem> {
    const size = await this.#sizeOf(oid);
    if (size === null) {
      return 'corrupt';
    }
    if (size > this.#limits.frontierBytes) {
      return 'frontier-limit';
    }
    return meter.spend(1) ? await this.#decodedHeads(oid, format) : 'work-limit';
  }

  /** The frontier blob's byte size, or null when Git cannot read even its header. */
  async #sizeOf(oid: string): Promise<number | null> {
    try {
      return Number(await this.#history.plumbing.execute({ args: ['cat-file', '-s', oid] }));
    } catch (cause) {
      if (isObjectFault(cause)) {
        return null;
      }
      throw cause;
    }
  }

  async #decodedHeads(oid: string, format: GitObjectFormat): Promise<ObservationBasisHeads | ObservationBasisProblem> {
    const bytes = await this.#blob(oid);
    const frontier = bytes === null ? null : this.#decoded(bytes);
    return frontier === null ? 'corrupt' : headsIn(frontier, format);
  }

  async #blob(oid: string): Promise<Uint8Array | null> {
    try {
      return await this.#history.readBlob(oid);
    } catch (cause) {
      if (isObjectFault(cause)) {
        return null;
      }
      throw cause;
    }
  }

  #decoded(bytes: Uint8Array): ConeFrontier | null {
    try {
      return this.#frontiers.decode(bytes);
    } catch {
      return null;
    }
  }
}

/** Distinct heads in writer-id order, each with the first writer that names it, and each an id in the basis's own format. */
function headsIn(frontier: ConeFrontier, format: GitObjectFormat): ObservationBasisHeads | 'corrupt' {
  const entries = frontier.entries();
  if (entries.some(([, position]) => GitObjectFormat.ofOid(position.sha) !== format)) {
    return 'corrupt';
  }
  const named = new Map<string, string>();
  for (const [writer, position] of entries) {
    named.set(position.sha, named.get(position.sha) ?? writer);
  }
  return { format, heads: [...named].map(([head, writer]) => ({ writer, head })) };
}
