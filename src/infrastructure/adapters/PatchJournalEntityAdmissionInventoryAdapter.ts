import type PatchEntry from '../../domain/artifacts/PatchEntry.ts';
import { entityAdmissionsFromPatch } from '../../domain/entity/EntityAdmissionPatchReader.ts';
import type RetainedEntityAdmission from '../../domain/entity/RetainedEntityAdmission.ts';
import WarpStream from '../../domain/stream/WarpStream.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import type EntityAdmissionInventoryBasis from '../../domain/entity/EntityAdmissionInventoryBasis.ts';
import EntityAdmissionInventoryPort from '../../ports/EntityAdmissionInventoryPort.ts';
import type PatchJournalPort from '../../ports/PatchJournalPort.ts';
import { requireAdapterDependency } from './AdapterDependencyGuard.ts';

type AdmissionCursor = {
  readonly iterator: AsyncIterator<RetainedEntityAdmission>;
  current: RetainedEntityAdmission;
};

/** Retained-patch implementation of exact-basis entity admission inventory. */
export default class PatchJournalEntityAdmissionInventoryAdapter
extends EntityAdmissionInventoryPort {
  readonly #journal: PatchJournalPort;

  constructor(options: { readonly journal: PatchJournalPort }) {
    super();
    requireAdapterDependency(options.journal, 'journal');
    this.#journal = options.journal;
  }

  override scan(
    basis: EntityAdmissionInventoryBasis,
  ): WarpStream<RetainedEntityAdmission> {
    if (basis === null || typeof basis !== 'object') {
      throw new WarpError(
        'Entity admission inventory requires a worldline coordinate',
        'E_ENTITY_ADMISSION_INVENTORY_BASIS',
      );
    }
    return WarpStream.from(this.#mergeBasis(basis));
  }

  async *#mergeBasis(
    basis: EntityAdmissionInventoryBasis,
  ): AsyncIterable<RetainedEntityAdmission> {
    const cursors = await this.#openCursors(basis);
    try {
      while (cursors.length > 0) {
        const selected = latestCursorIndex(cursors);
        const cursor = cursors[selected];
        if (cursor === undefined) {
          throw new WarpError(
            'Entity admission inventory cursor disappeared',
            'E_ENTITY_ADMISSION_INVENTORY_CURSOR',
          );
        }
        yield cursor.current;
        const next = await cursor.iterator.next();
        if (next.done === true) {
          cursors.splice(selected, 1);
        } else {
          cursor.current = next.value;
        }
      }
    } finally {
      await closeCursors(cursors);
    }
  }

  async #openCursors(
    basis: EntityAdmissionInventoryBasis,
  ): Promise<AdmissionCursor[]> {
    const cursors: AdmissionCursor[] = [];
    try {
      for (const { writerId, patchSha } of basis.frontierEntries) {
        const iterator = this.#writerAdmissions(writerId, patchSha)[Symbol.asyncIterator]();
        const first = await iterator.next();
        if (first.done !== true) {
          cursors.push({ iterator, current: first.value });
        }
      }
      return cursors;
    } catch (error) {
      await closeCursors(cursors);
      throw error;
    }
  }

  async *#writerAdmissions(
    writerId: string,
    patchSha: string,
  ): AsyncIterable<RetainedEntityAdmission> {
    for await (const entry of this.#journal.scanPatchHistory(writerId, patchSha)) {
      yield* reverseAdmissions(entry);
    }
  }
}

function reverseAdmissions(entry: PatchEntry): readonly RetainedEntityAdmission[] {
  return [...entityAdmissionsFromPatch(entry)].reverse();
}

function latestCursorIndex(cursors: readonly AdmissionCursor[]): number {
  let selected = 0;
  for (let index = 1; index < cursors.length; index += 1) {
    const candidate = cursors[index];
    const current = cursors[selected];
    if (candidate !== undefined && current !== undefined && candidate.current.compare(current.current) > 0) {
      selected = index;
    }
  }
  return selected;
}

async function closeCursors(cursors: readonly AdmissionCursor[]): Promise<void> {
  await Promise.all(cursors.map(async ({ iterator }) => await iterator.return?.()));
}
