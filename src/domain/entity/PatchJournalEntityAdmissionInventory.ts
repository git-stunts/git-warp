import EntityAdmissionInventoryPort from '../../ports/EntityAdmissionInventoryPort.ts';
import type PatchJournalPort from '../../ports/PatchJournalPort.ts';
import type PatchEntry from '../artifacts/PatchEntry.ts';
import WarpError from '../errors/WarpError.ts';
import WarpStream from '../stream/WarpStream.ts';
import {
  completeCleanupSteps,
  failWithCleanupSteps,
} from '../utils/OperationCleanup.ts';
import EntityAdmissionInventoryBasis from './EntityAdmissionInventoryBasis.ts';
import { entityAdmissionsFromPatch } from './EntityAdmissionPatchReader.ts';
import type RetainedEntityAdmission from './RetainedEntityAdmission.ts';

type AdmissionCursor = {
  readonly iterator: AsyncIterator<RetainedEntityAdmission>;
  current: RetainedEntityAdmission;
};

/** Retained-patch implementation of exact-basis entity admission inventory. */
export default class PatchJournalEntityAdmissionInventory
extends EntityAdmissionInventoryPort {
  readonly #journal: PatchJournalPort;

  constructor(options: { readonly journal: PatchJournalPort }) {
    super();
    if (options.journal === null || options.journal === undefined) {
      throw new WarpError(
        'Entity admission inventory requires a patch journal',
        'E_ENTITY_ADMISSION_INVENTORY_JOURNAL',
      );
    }
    this.#journal = options.journal;
  }

  override scan(
    basis: EntityAdmissionInventoryBasis,
  ): WarpStream<RetainedEntityAdmission> {
    if (!(basis instanceof EntityAdmissionInventoryBasis)) {
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
    let operationFailed = false;
    try {
      yield* mergedAdmissions(cursors);
    } catch (error) {
      operationFailed = true;
      const failure = error instanceof Error
        ? error
        : nonErrorInventoryFailure();
      await failWithCleanupSteps(
        failure,
        cursorCleanupSteps(cursors),
        'Entity admission inventory scan and cursor cleanup failed',
      );
    } finally {
      if (!operationFailed) {
        await closeCursors(cursors);
      }
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
      const failure = error instanceof Error
        ? error
        : nonErrorInventoryFailure();
      return await failWithCleanupSteps(
        failure,
        cursorCleanupSteps(cursors),
        'Entity admission inventory open and cursor cleanup failed',
      );
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

async function* mergedAdmissions(
  cursors: AdmissionCursor[],
): AsyncIterable<RetainedEntityAdmission> {
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
  await completeCleanupSteps(
    cursorCleanupSteps(cursors),
    'Entity admission inventory cursor cleanup failed',
  );
}

function cursorCleanupSteps(
  cursors: readonly AdmissionCursor[],
): readonly (() => Promise<void>)[] {
  return cursors.map(({ iterator }) => async () => {
    await iterator.return?.();
  });
}

function nonErrorInventoryFailure(): WarpError {
  return new WarpError(
    'Entity admission inventory rejected with a non-Error value',
    'E_ENTITY_ADMISSION_INVENTORY_FAILURE',
  );
}
