import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  Runtime,
  type EntityAdmission,
  type EntityAdmissionInventoryCertificate,
  type ObservationReceipt,
  type Reading,
} from '../../../index.ts';
import {
  createEntityAdmissionInventoryObserver,
  intent,
  requireEntityAdmissionInventoryCertificate,
} from '../../../advanced.ts';
import handleObserve from '../../../bin/cli/commands/observe.ts';
import type { McpJsonValue } from '../../../bin/cli/commands/mcp/McpJsonValue.ts';
import type { CliOptions } from '../../../bin/cli/types.ts';
import { receiptEnvelope } from '../../../bin/presenters/V19ReadingReceipt.ts';
import { createTestRepo } from '../api/helpers/setup.ts';

const LANE = 'captures';

describe('Runtime entity admission inventory', () => {
  let repository: Awaited<ReturnType<typeof createTestRepo>>;

  beforeEach(async () => {
    repository = await createTestRepo('runtime-entity-admission-inventory');
  });

  afterEach(async () => {
    await repository.cleanup();
  });

  it('certifies an empty Lane only after complete consumption', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'reader' });
    try {
      const lane = await runtime.lane(LANE);
      const inventory = await consumeInventory(lane);

      expect(inventory.admissions).toEqual([]);
      expect(inventory.receipt.status).toBe('completed');
      expect(inventory.certificate).toMatchObject({
        admissionCount: 0,
        completeness: 'complete',
        coveredDomain: 'retained-entity-add-admissions',
        lane: { kind: 'worldline', name: LANE },
        selector: { kind: 'lane' },
      });
    } finally {
      await runtime.close();
    }
  });

  it('recovers births rather than current nodes or operation-shaped guesses', async () => {
    let runtime: Runtime | null = await Runtime.open({
      at: repository.tempDir,
      writer: 'writer-a',
    });
    try {
      const lane = await runtime.lane(LANE);
      await lane.write([
        intent.entity.add({
          subject: 'capture:marked',
          properties: { body: 'original', profile: 'think.capture.v1' },
        }),
        intent.node.add({ subject: 'capture:manual' }),
        intent.property.set({
          subject: 'capture:manual',
          key: 'body',
          value: 'operation-shaped but not an entity admission',
        }),
      ]);
      await lane.write(intent.entity.addAuto({
        namespace: 'capture',
        properties: { body: 'equal' },
      }));
      await lane.write(intent.entity.addAuto({
        namespace: 'capture',
        properties: { body: 'equal' },
      }));
      const repeated = intent.entity.add({
        subject: 'capture:repeated',
        properties: { body: 'same subject' },
      });
      await lane.write(repeated);
      await lane.write(repeated);
      await lane.write(intent.property.set({
        subject: 'capture:marked',
        key: 'body',
        value: 'later mutation',
      }));
      await lane.write([
        intent.node.add({ subject: 'capture:manual-only' }),
        intent.property.set({
          subject: 'capture:manual-only',
          key: 'body',
          value: 'must retain an empty classification marker',
        }),
      ]);
      await runtime.close();
      runtime = await Runtime.open({ at: repository.tempDir, writer: 'reader' });

      const reopened = await runtime.lane(LANE);
      const inventory = await consumeInventory(reopened);
      const subjects = inventory.admissions.map(({ representation }) =>
        representation.subject);
      const repeatedAdmissions = inventory.admissions.filter(({ representation }) =>
        representation.subject === 'capture:repeated');
      const equalAdmissions = inventory.admissions.filter(({ initialProperties }) =>
        initialProperties['body'] === 'equal');
      const marked = inventory.admissions.find(({ representation }) =>
        representation.subject === 'capture:marked');

      expect(inventory.certificate.admissionCount).toBe(5);
      expect(subjects).not.toContain('capture:manual');
      expect(subjects).not.toContain('capture:manual-only');
      expect(repeatedAdmissions).toHaveLength(2);
      expect(new Set(repeatedAdmissions.map(({ occurrence }) => occurrence.id)).size).toBe(2);
      expect(equalAdmissions).toHaveLength(2);
      expect(new Set(equalAdmissions.map(({ representation }) =>
        representation.subject)).size).toBe(2);
      expect(marked?.initialProperties['body']).toBe('original');
      expect(marked?.origin).toEqual({ kind: 'supplied-subject', namespace: null });
      expect(equalAdmissions.map(({ origin }) => origin)).toEqual([
        { kind: 'allocated', namespace: 'capture' },
        { kind: 'allocated', namespace: 'capture' },
      ]);
      expect(inventory.admissions.every(({ ordering }) =>
        ordering.semantics === 'deterministic-non-causal')).toBe(true);
    } finally {
      if (runtime !== null) {
        await runtime.close();
      }
    }
  });

  it('pins one basis and reproduces its complete digest after restart', async () => {
    const writerA = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    const writerB = await Runtime.open({ at: repository.tempDir, writer: 'writer-b' });
    try {
      const laneA = await writerA.lane(LANE);
      const laneB = await writerB.lane(LANE);
      await laneA.write(entity('capture:a'));
      await laneB.write(entity('capture:b'));

      const observation = laneA.observe(
        createEntityAdmissionInventoryObserver('basis-f'),
      );
      const iterator = observation[Symbol.asyncIterator]();
      const first = await iterator.next();
      expect(first.done).toBe(false);
      await laneB.write(entity('capture:after-f'));
      const atF = [requireReadingValue(first), ...await drainValues(iterator)];
      const receiptAtF = await observation.receipt;
      const certificateAtF = requireEntityAdmissionInventoryCertificate(receiptAtF);

      expect(atF).toHaveLength(2);
      expect(atF.map(({ representation }) => representation.subject))
        .not.toContain('capture:after-f');
      expect(certificateAtF.admissionCount).toBe(2);

      const atF2 = await consumeInventory(laneA);
      expect(atF2.certificate.admissionCount).toBe(3);
      expect(atF2.admissions.map(({ representation }) => representation.subject))
        .toContain('capture:after-f');

      const repeatedAtF2 = await consumeInventory(laneA);
      expect(repeatedAtF2.admissions).toEqual(atF2.admissions);
      expect(repeatedAtF2.certificate.streamDigest)
        .toBe(atF2.certificate.streamDigest);

      await writerB.close();
      await writerA.close();
      const reopened = await Runtime.open({ at: repository.tempDir, writer: 'reader' });
      try {
        const replay = await consumeInventory(await reopened.lane(LANE));
        expect(replay.admissions).toEqual(atF2.admissions);
        expect(replay.certificate.streamDigest).toBe(atF2.certificate.streamDigest);
        expect(replay.certificate.admissionCount).toBe(atF2.certificate.admissionCount);
        expect(receiptEnvelope(replay.receipt)).toMatchObject({
          inventoryCertificate: {
            admissionCount: 3,
            completeness: 'complete',
            streamDigest: atF2.certificate.streamDigest,
          },
        });
      } finally {
        await reopened.close();
      }
    } finally {
      await writerB.close();
      await writerA.close();
    }
  });

  it('withholds completeness after cancellation and on a Strand', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    try {
      const lane = await runtime.lane(LANE);
      await lane.write(entity('capture:one'));
      await lane.write(entity('capture:two'));
      const observation = lane.observe(
        createEntityAdmissionInventoryObserver('cancelled-inventory'),
      );
      const iterator = observation[Symbol.asyncIterator]();
      expect((await iterator.next()).done).toBe(false);
      await iterator.return?.();
      const receipt = await observation.receipt;

      expect(receipt).toMatchObject({
        status: 'obstructed',
        reason: 'consumer_cancelled',
      });
      expect(() => requireEntityAdmissionInventoryCertificate(receipt))
        .toThrowError(expect.objectContaining({
          code: 'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE',
        }));

      const strand = await runtime.fork(lane, { name: 'candidate' });
      const strandInventory = strand.observe(
        createEntityAdmissionInventoryObserver('strand-inventory'),
      );
      expect(await strandInventory.receipt).toMatchObject({
        status: 'obstructed',
        reason: 'entity_admission_inventory_strand_unavailable',
      });
    } finally {
      await runtime.close();
    }
  });

  it('recovers an auto-allocated admission after Strand settlement', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    try {
      const parent = await runtime.lane(LANE);
      const strand = await runtime.fork(parent, { name: 'candidate' });
      await strand.write(intent.entity.addAuto({
        namespace: 'capture',
        properties: { body: 'settled' },
      }));

      const preview = await runtime.previewSettlement({ source: strand, target: parent });
      await runtime.settle(preview.plan);
      const inventory = await consumeInventory(parent);

      expect(inventory.admissions).toHaveLength(1);
      expect(inventory.admissions[0]?.origin).toEqual({
        kind: 'allocated',
        namespace: 'capture',
      });
    } finally {
      await runtime.close();
    }
  });

  it('exposes the same streamed records and certificate through the CLI', async () => {
    const writer = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    try {
      const lane = await writer.lane(LANE);
      await lane.write(entity('capture:cli'));
    } finally {
      await writer.close();
    }

    const result = await handleObserve({
      options: cliOptions(repository.tempDir),
      args: [
        '--observer',
        'cli-entity-admissions',
        '--reading',
        '{"kind":"entity-admissions"}',
      ],
    });

    expect(Symbol.asyncIterator in result.lines).toBe(true);
    const lines: McpJsonValue[] = [];
    for await (const line of result.lines) {
      lines.push(line);
    }

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      type: 'Reading',
      value: {
        representation: { subject: 'capture:cli' },
        initialProperties: { body: 'capture:cli' },
      },
    });
    expect(lines[1]).toMatchObject({
      type: 'Receipt',
      operation: 'observe',
      status: 'completed',
      inventoryCertificate: {
        admissionCount: 1,
        completeness: 'complete',
      },
    });
  });
});

function entity(subject: string) {
  return intent.entity.add({ subject, properties: { body: subject } });
}

function cliOptions(repo: string): CliOptions {
  return {
    repo,
    lane: LANE,
    strand: null,
    writer: 'cli-reader',
    writerExplicit: true,
    json: false,
    jsonl: true,
    help: false,
  };
}

async function consumeInventory(lane: Awaited<ReturnType<Runtime['lane']>>): Promise<{
  readonly admissions: readonly EntityAdmission[];
  readonly certificate: EntityAdmissionInventoryCertificate;
  readonly receipt: ObservationReceipt;
}> {
  const observation = lane.observe(
    createEntityAdmissionInventoryObserver('all-entity-admissions'),
  );
  const admissions: EntityAdmission[] = [];
  for await (const reading of observation) {
    admissions.push(reading.value);
  }
  const receipt = await observation.receipt;
  expect(receipt).toMatchObject({ status: 'completed', reason: undefined });
  return {
    admissions,
    certificate: requireEntityAdmissionInventoryCertificate(receipt),
    receipt,
  };
}

async function drainValues(
  iterator: AsyncIterator<Reading<EntityAdmission>>,
): Promise<EntityAdmission[]> {
  const values: EntityAdmission[] = [];
  for (;;) {
    const next = await iterator.next();
    if (next.done === true) {
      return values;
    }
    values.push(next.value.value);
  }
}

function requireReadingValue(
  result: IteratorResult<Reading<EntityAdmission>>,
): EntityAdmission {
  if (result.done === true) {
    throw new Error('inventory unexpectedly ended');
  }
  return result.value.value;
}
