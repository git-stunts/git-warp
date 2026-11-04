import type ConeReader from '../services/cone/ConeReader.ts';
import ConeAdmissionRecord from '../services/cone/ConeAdmissionRecord.ts';
import ConeRecordKey from '../services/cone/ConeRecordKey.ts';
import type ConeUnprovenAdmissionRecord from '../services/cone/ConeUnprovenAdmissionRecord.ts';
import type ConeRoot from '../services/cone/ConeRoot.ts';
import WarpError from '../errors/WarpError.ts';
import type RetainedEntityAdmission from './RetainedEntityAdmission.ts';

/** One writer chain to merge: its id and how many of its admissions are unread. */
export type ConeAdmissionChain = { readonly writerId: string; readonly remaining: number };

type ChainCursor = {
  readonly writerId: string;
  /** Admissions of the chain not yet yielded, counting `current`. */
  remaining: number;
  /** Records read ahead, newest first; the first is `current`. */
  buffer: RetainedEntityAdmission[];
};

type IndexEntry = ConeAdmissionRecord | ConeUnprovenAdmissionRecord | null;
type Selection = { readonly chain: ChainCursor; readonly admission: RetainedEntityAdmission };

type MergeSource = { readonly reader: ConeReader; readonly root: ConeRoot; readonly page: number };

/**
 * A k-way merge of writer chains' admission indexes, newest event first.
 *
 * Each chain keeps its next admission loaded, like a history scan's cursor
 * kept its next admission: loading reads a batch of at most `page` records
 * below the chain's position, and an unproven entry refuses where the scan
 * would have refused. `positions()` names what is still unread, so a later
 * merge over the same basis resumes exactly there.
 */
export default class ConeAdmissionMerge {
  readonly #source: MergeSource;
  readonly #chains: ChainCursor[];
  /** The chain the last admission came from; its look-ahead is read on the next call, as a scan read lazily. */
  #drained: ChainCursor | null = null;

  private constructor(source: MergeSource, chains: ChainCursor[]) {
    this.#source = source;
    this.#chains = chains;
  }

  static async open(fields: MergeSource & { readonly chains: readonly ConeAdmissionChain[] }): Promise<ConeAdmissionMerge> {
    const merge = new ConeAdmissionMerge(fields, fields.chains.map((chain) => ({ ...chain, buffer: [] })));
    for (const chain of merge.#chains) {
      await merge.#fill(chain);
    }
    return merge;
  }

  /** The newest unread admission across the chains, or null when every chain is read. */
  async next(): Promise<RetainedEntityAdmission | null> {
    if (this.#drained !== null) {
      await this.#fill(this.#drained);
      this.#drained = null;
    }
    const selection = latestChain(this.#chains);
    if (selection === null) {
      return null;
    }
    const { chain, admission } = selection;
    chain.buffer.shift();
    chain.remaining -= 1;
    this.#drained = chain;
    return admission;
  }

  /** Per writer chain, how many admissions are still unread. */
  positions(): ReadonlyMap<string, number> {
    return new Map(this.#chains.map((chain) => [chain.writerId, chain.remaining]));
  }

  /** Reads the next batch of a chain whose look-ahead ran out. */
  async #fill(chain: ChainCursor): Promise<void> {
    if (chain.buffer.length > 0 || chain.remaining === 0) {
      return;
    }
    const low = Math.max(0, chain.remaining - this.#source.page);
    const ordinals = Array.from({ length: chain.remaining - low }, (_unused, index) => chain.remaining - 1 - index);
    const keys = ordinals.map((ordinal) => ConeRecordKey.forAdmission(chain.writerId, ordinal));
    const records = await this.#source.reader.records(this.#source.root, keys);
    chain.buffer = takeUntilRefusal(ordinals.map((ordinal) => records.admission(chain.writerId, ordinal)), chain);
  }
}

/** The batch's admissions newest first; an unproven entry at the head refuses, one further down ends the batch. */
function takeUntilRefusal(entries: readonly IndexEntry[], chain: ChainCursor): RetainedEntityAdmission[] {
  const admissions: RetainedEntityAdmission[] = [];
  for (const entry of entries) {
    if (entry instanceof ConeAdmissionRecord) {
      admissions.push(entry.admission);
    } else if (admissions.length > 0) {
      return admissions;
    } else {
      throw entry === null ? missingEntry(chain) : entry.refusal();
    }
  }
  return admissions;
}

function latestChain(chains: readonly ChainCursor[]): Selection | null {
  let selected: Selection | null = null;
  for (const chain of chains) {
    const admission = chain.buffer[0];
    if (admission !== undefined && (selected === null || admission.compare(selected.admission) > 0)) {
      selected = { chain, admission };
    }
  }
  return selected;
}

function missingEntry(chain: ChainCursor): WarpError {
  return new WarpError('Entity admission index entry is missing below its tally', 'E_CONE_RECORD_CORRUPT', {
    context: { writerId: chain.writerId, ordinal: chain.remaining - 1 },
  });
}
