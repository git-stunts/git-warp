import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import PatchEntry from '../../../../src/domain/artifacts/PatchEntry.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import EntityAdmissionInventoryBasis from '../../../../src/domain/entity/EntityAdmissionInventoryBasis.ts';
import PatchJournalEntityAdmissionInventory from '../../../../src/domain/entity/PatchJournalEntityAdmissionInventory.ts';
import type RetainedEntityAdmission from '../../../../src/domain/entity/RetainedEntityAdmission.ts';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import EntityAdmissionBoundary from '../../../../src/domain/types/EntityAdmissionBoundary.ts';
import EntityAdmissionOrigin from '../../../../src/domain/types/EntityAdmissionOrigin.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../src/domain/types/ops/NodePropSet.ts';
import type { PatchCommitMessage } from '../../../../src/ports/CommitMessageCodecPort.ts';
import PatchJournalPort, {
  type AppendPatchRequest,
  type PublishedPatch,
} from '../../../../src/ports/PatchJournalPort.ts';

const PORT_SOURCE = readFileSync(
  join(process.cwd(), 'src/ports/EntityAdmissionInventoryPort.ts'),
  'utf8',
);

describe('PatchJournalEntityAdmissionInventory', () => {
  it('rejects a forged basis-shaped object before opening a scan', () => {
    const inventory = new PatchJournalEntityAdmissionInventory({
      journal: new InventoryJournal(new Map()),
    });

    expect(() =>
      inventory.scan({ frontierEntries: [], worldlineName: 'captures' }),
    ).toThrowError(
      expect.objectContaining({
        code: 'E_ENTITY_ADMISSION_INVENTORY_BASIS',
      }),
    );
  });

  it('declares and repeats descending retained-admission order', async () => {
    expect(PORT_SOURCE).toContain(
      'descending `RetainedEntityAdmission.compare()` order',
    );
    const inventory = new PatchJournalEntityAdmissionInventory({
      journal: new InventoryJournal(new Map([
        ['writer-a', [
          entityEntry('writer-a', 3, 'a003', 'capture:a3'),
          entityEntry('writer-a', 1, 'a001', 'capture:a1'),
        ]],
        ['writer-b', [
          entityEntry('writer-b', 4, 'b004', 'capture:b4'),
          entityEntry('writer-b', 2, 'b002', 'capture:b2'),
        ]],
      ])),
    });
    const basis = new EntityAdmissionInventoryBasis({
      frontier: new Map([
        ['writer-a', 'a003'],
        ['writer-b', 'b004'],
      ]),
      worldlineName: 'captures',
    });

    const first = await collect(inventory.scan(basis));
    const second = await collect(inventory.scan(basis));

    expect(first.map(({ eventId }) => eventId.lamport)).toEqual([4, 3, 2, 1]);
    expect(first.every((admission, index) => {
      const next = first[index + 1];
      return next === undefined || admission.compare(next) >= 0;
    })).toBe(true);
    expect(second.map(eventIdentity)).toEqual(first.map(eventIdentity));
  });

  it('preserves open and cursor cleanup failures in deterministic order', async () => {
    const openFailure = new Error('writer-c open failed');
    const writerACleanup = new Error('writer-a cleanup failed');
    const writerBCleanup = new Error('writer-b cleanup failed');
    const inventory = new PatchJournalEntityAdmissionInventory({
      journal: new FailingInventoryJournal(new Map([
        ['writer-a', failingReturnHistory(
          entityEntry('writer-a', 1, 'a001', 'capture:a1'),
          writerACleanup,
        )],
        ['writer-b', failingReturnHistory(
          entityEntry('writer-b', 2, 'b002', 'capture:b2'),
          writerBCleanup,
        )],
        ['writer-c', failingOpenHistory(openFailure)],
      ])),
    });
    const basis = new EntityAdmissionInventoryBasis({
      frontier: new Map([
        ['writer-a', 'a001'],
        ['writer-b', 'b002'],
        ['writer-c', 'c003'],
      ]),
      worldlineName: 'captures',
    });

    const iterator = inventory.scan(basis)[Symbol.asyncIterator]();

    await expect(iterator.next()).rejects.toMatchObject({
      errors: [openFailure, writerACleanup, writerBCleanup],
    });
  });
});

class InventoryJournal extends PatchJournalPort {
  readonly #histories: ReadonlyMap<string, readonly PatchEntry[]>;

  constructor(histories: ReadonlyMap<string, readonly PatchEntry[]>) {
    super();
    this.#histories = histories;
  }

  override appendPatch(_request: AppendPatchRequest): Promise<PublishedPatch> {
    throw new Error('InventoryJournal does not publish patches');
  }

  override readPatch(_message: PatchCommitMessage): Promise<Patch> {
    throw new Error('InventoryJournal reads through scanPatchHistory');
  }

  override scanPatchRange(): WarpStream<PatchEntry> {
    throw new Error('InventoryJournal scans retained history only');
  }

  override scanPatchHistory(
    writerId: string,
    fromSha: string,
  ): WarpStream<PatchEntry> {
    const history = this.#histories.get(writerId) ?? [];
    if (history[0]?.sha !== fromSha) {
      throw new Error(`InventoryJournal has no frontier ${writerId}/${fromSha}`);
    }
    return WarpStream.from(history);
  }
}

class FailingInventoryJournal extends PatchJournalPort {
  readonly #histories: ReadonlyMap<string, AsyncIterable<PatchEntry>>;

  constructor(histories: ReadonlyMap<string, AsyncIterable<PatchEntry>>) {
    super();
    this.#histories = histories;
  }

  override appendPatch(_request: AppendPatchRequest): Promise<PublishedPatch> {
    throw new Error('FailingInventoryJournal does not publish patches');
  }

  override readPatch(_message: PatchCommitMessage): Promise<Patch> {
    throw new Error('FailingInventoryJournal reads through scanPatchHistory');
  }

  override scanPatchRange(): WarpStream<PatchEntry> {
    throw new Error('FailingInventoryJournal scans retained history only');
  }

  override scanPatchHistory(writerId: string): WarpStream<PatchEntry> {
    const history = this.#histories.get(writerId);
    if (history === undefined) {
      throw new Error(`FailingInventoryJournal has no writer ${writerId}`);
    }
    return WarpStream.from(history);
  }
}

function failingReturnHistory(
  retained: PatchEntry,
  failure: Error,
): AsyncIterable<PatchEntry> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<PatchEntry> {
      let emitted = false;
      return {
        async next(): Promise<IteratorResult<PatchEntry>> {
          if (emitted) {
            return { done: true, value: undefined };
          }
          emitted = true;
          return { done: false, value: retained };
        },
        async return(): Promise<IteratorResult<PatchEntry>> {
          throw failure;
        },
      };
    },
  };
}

function failingOpenHistory(failure: Error): AsyncIterable<PatchEntry> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<PatchEntry> {
      return {
        async next(): Promise<IteratorResult<PatchEntry>> {
          throw failure;
        },
      };
    },
  };
}

function entityEntry(
  writer: string,
  lamport: number,
  sha: string,
  subject: string,
): PatchEntry {
  return new PatchEntry({
    sha,
    patch: new Patch({
      writer,
      lamport,
      context: {},
      ops: [
        new NodeAdd(subject, Dot.create(writer, lamport)),
        new NodePropSet(subject, 'body', subject),
      ],
      entityAdmissions: [new EntityAdmissionBoundary({
        operationIndex: 0,
        operationCount: 2,
        origin: EntityAdmissionOrigin.suppliedSubject(),
      })],
    }),
  });
}

async function collect(
  stream: AsyncIterable<RetainedEntityAdmission>,
): Promise<RetainedEntityAdmission[]> {
  const admissions: RetainedEntityAdmission[] = [];
  for await (const admission of stream) {
    admissions.push(admission);
  }
  return admissions;
}

function eventIdentity(admission: RetainedEntityAdmission): string {
  const { eventId } = admission;
  return [
    eventId.lamport,
    eventId.writerId,
    eventId.patchSha,
    eventId.opIndex,
  ].join(':');
}
