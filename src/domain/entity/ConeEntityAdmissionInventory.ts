import type ConeReader from '../services/cone/ConeReader.ts';
import ConeRecordKey from '../services/cone/ConeRecordKey.ts';
import WarpError from '../errors/WarpError.ts';
import ConeAdmissionMerge, { type ConeAdmissionChain } from './ConeAdmissionMerge.ts';
import type EntityAdmissionInventoryBasis from './EntityAdmissionInventoryBasis.ts';

/** Index records an inventory reads per writer chain in one batch. */
export const ENTITY_ADMISSION_INVENTORY_PAGE = 256;

/**
 * Exact-basis entity admission inventory answered from a lane's cone
 * admission index (#1039), never from writer history.
 *
 * Every folded patch appends its admissions to its writer chain's index
 * (`ConeAdmissionIndexer`). An inventory reads each chain's tally once, then
 * pages each chain downwards from a position, in batches of a bounded number
 * of records, and merges the chains in descending deterministic event order:
 * the same order, values and refusals a scan of every writer's history from
 * its tip produced. Reading `n` admissions costs `O(n + writers × page)`
 * record reads, whatever the history length.
 */
export default class ConeEntityAdmissionInventory {
  readonly #reader: ConeReader;
  readonly #page: number;

  constructor(options: { readonly reader: ConeReader; readonly page?: number }) {
    this.#reader = options.reader;
    this.#page = options.page ?? ENTITY_ADMISSION_INVENTORY_PAGE;
    if (!Number.isSafeInteger(this.#page) || this.#page < 1) {
      throw new WarpError('Entity admission inventory page must be a positive integer', 'E_ENTITY_ADMISSION_INVENTORY_PAGE');
    }
    Object.freeze(this);
  }

  /**
   * Opens a merge over the basis's writer chains. `remaining` resumes it: per
   * writer, how many of the chain's newest-first admissions are still unread;
   * null starts from each chain's newest admission.
   */
  async open(
    basis: EntityAdmissionInventoryBasis,
    remaining: ReadonlyMap<string, number> | null,
  ): Promise<ConeAdmissionMerge> {
    const writers = basis.frontierEntries.map(({ writerId }) => writerId);
    const tallies = await this.#reader.records(basis.root, writers.map((writerId) => ConeRecordKey.forAdmissionTally(writerId)));
    const chains = writers.map((writerId): ConeAdmissionChain => ({
      writerId,
      remaining: startingPosition(tallies.admissionTally(writerId).count, remaining?.get(writerId)),
    }));
    return await ConeAdmissionMerge.open({ reader: this.#reader, root: basis.root, page: this.#page, chains });
  }
}

function startingPosition(count: number, resumed: number | undefined): number {
  if (resumed === undefined) {
    return count;
  }
  if (resumed > count) {
    throw new WarpError('Entity admission inventory cursor is ahead of its basis', 'E_ENTITY_ADMISSION_INVENTORY_CURSOR');
  }
  return resumed;
}
