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
  readonly cleanup: () => Promise<void>;
  readonly iterator: AsyncIterator<RetainedEntityAdmission>;
  current: RetainedEntityAdmission;
};
type AdmissionCursorSelection = readonly [index: number, cursor: AdmissionCursor];
type WriterAdmissionSource = Readonly<{
  cleanup: () => Promise<void>;
  iterator: AsyncIterator<RetainedEntityAdmission>;
}>;

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
        const cursor = await this.#openCursor(writerId, patchSha);
        if (cursor !== null) {
          cursors.push(cursor);
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

  async #openCursor(
    writerId: string,
    patchSha: string,
  ): Promise<AdmissionCursor | null> {
    const source = this.#writerAdmissionSource(writerId, patchSha);
    try {
      const first = await source.iterator.next();
      if (first.done === true) {
        await source.cleanup();
        return null;
      }
      return { ...source, current: first.value };
    } catch (error) {
      const failure = error instanceof Error
        ? error
        : nonErrorInventoryFailure();
      return await failWithCleanupSteps(
        failure,
        [source.cleanup],
        'Entity admission inventory writer open and cleanup failed',
      );
    }
  }

  #writerAdmissionSource(
    writerId: string,
    patchSha: string,
  ): WriterAdmissionSource {
    const patches = this.#journal.scanPatchHistory(writerId, patchSha)[Symbol.asyncIterator]();
    return Object.freeze({
      cleanup: cleanupOnce(async () => {
        await patches.return?.();
      }),
      iterator: admissionsFromPatchHistory(patches)[Symbol.asyncIterator](),
    });
  }
}

async function* admissionsFromPatchHistory(
  patches: AsyncIterator<PatchEntry>,
): AsyncIterable<RetainedEntityAdmission> {
  while (true) {
    const next = await patches.next();
    if (next.done === true) {
      return;
    }
    yield* reverseAdmissions(next.value);
  }
}

async function* mergedAdmissions(
  cursors: AdmissionCursor[],
): AsyncIterable<RetainedEntityAdmission> {
  while (true) {
    const selection = latestCursor(cursors);
    if (selection === null) {
      return;
    }
    const [selected, cursor] = selection;
    yield cursor.current;
    const next = await cursor.iterator.next();
    if (next.done === true) {
      cursors.splice(selected, 1);
      await cursor.cleanup();
    } else {
      cursor.current = next.value;
    }
  }
}

function reverseAdmissions(entry: PatchEntry): readonly RetainedEntityAdmission[] {
  return [...entityAdmissionsFromPatch(entry)].reverse();
}

function latestCursor(
  cursors: readonly AdmissionCursor[],
): AdmissionCursorSelection | null {
  let selected: AdmissionCursorSelection | null = null;
  for (const [index, candidate] of cursors.entries()) {
    if (selected === null || candidate.current.compare(selected[1].current) > 0) {
      selected = Object.freeze([index, candidate]);
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
  return cursors.map(({ cleanup }) => cleanup);
}

function cleanupOnce(cleanup: () => Promise<void>): () => Promise<void> {
  let completion: Promise<void> | null = null;
  return () => {
    completion ??= Promise.resolve().then(cleanup);
    return completion;
  };
}

function nonErrorInventoryFailure(): WarpError {
  return new WarpError(
    'Entity admission inventory rejected with a non-Error value',
    'E_ENTITY_ADMISSION_INVENTORY_FAILURE',
  );
}
