import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Runtime } from '../../../index.ts';
import RuntimeHost from '../../../src/domain/RuntimeHost.ts';
import LegacyReading from '../../../src/domain/api/Reading.ts';
import {
  createObserver,
} from '../../../src/domain/api/ObserverRuntime.ts';
import type { ReadingValue } from '../../../src/domain/api/ObservedReading.ts';
import type ConeRecordKey from '../../../src/domain/services/cone/ConeRecordKey.ts';
import type ConeRoot from '../../../src/domain/services/cone/ConeRoot.ts';
import { CborPatchJournalAdapter }
  from '../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import GitConeRecordStoreAdapter
  from '../../../src/infrastructure/adapters/GitConeRecordStoreAdapter.ts';
import { CborIndexStoreAdapter }
  from '../../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import { createTestRepo }
  from '../api/helpers/setup.ts';

const LANE_NAME = 'events';
const WRITER_ID = 'agent-1';
const HUB_NODE_ID = 'node:hub';
const NEIGHBOR_NODE_ID = 'node:neighbor';

type ReadRecordsSpy = Readonly<{
  mock: Readonly<{
    calls: readonly (readonly [ConeRoot, readonly ConeRecordKey[]])[];
  }>;
}>;

describe('Runtime Observer warm reopen', () => {
  let repository: Awaited<ReturnType<typeof createTestRepo>>;

  beforeEach(async () => {
    repository = await createTestRepo('runtime-observer-warm-reopen');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await repository.cleanup();
  });

  it('reuses the folded cone basis on warm reopen and never opens checkpoint pages (#1039)', async () => {
    const seed = await repository.openGraph(LANE_NAME, WRITER_ID);
    await seed.patch((patch) => {
      patch
        .addNode(HUB_NODE_ID)
        .addNode(NEIGHBOR_NODE_ID)
        .setProperty(HUB_NODE_ID, 'status', 'ready')
        .addEdge(HUB_NODE_ID, NEIGHBOR_NODE_ID, 'contains');
    });
    await seed.materialize();
    await seed.createCheckpoint();

    const materialize = vi.spyOn(RuntimeHost.prototype, 'materialize');
    const decodeShardAt = vi.spyOn(CborIndexStoreAdapter.prototype, 'decodeShardAt');
    const openShardAt = vi.spyOn(CborIndexStoreAdapter.prototype, 'openShardAt');
    const scanShards = vi.spyOn(CborIndexStoreAdapter.prototype, 'scanShards');
    const readPatch = vi.spyOn(CborPatchJournalAdapter.prototype, 'readPatch');
    const readRecords = vi.spyOn(GitConeRecordStoreAdapter.prototype, 'readRecords');

    const first = await observeFromFreshRuntime(repository.tempDir);
    const firstDecodes = readPatch.mock.calls.length;
    const firstRecords = recordReads(readRecords);
    readPatch.mockClear();
    readRecords.mockClear();
    const second = await observeFromFreshRuntime(repository.tempDir);

    expect(first).toEqual({
      property: 'ready',
      propertyReceiptStatus: 'completed',
      neighborhood: {
        subject: HUB_NODE_ID,
        direction: 'out',
        edges: [{
          direction: 'out',
          neighborId: NEIGHBOR_NODE_ID,
          label: 'contains',
        }],
        completeness: 'complete',
        cursor: null,
      },
      neighborhoodReceiptStatus: 'completed',
    });
    expect(second).toEqual(first);
    // The first Observation folds the one uncovered patch; the warm reopen folds nothing.
    expect(firstDecodes).toBe(1);
    expect(readPatch).not.toHaveBeenCalled();
    expect(recordReads(readRecords)).toEqual(firstRecords.filter((read) => read.startsWith('read:')));
    expect(decodeShardAt).not.toHaveBeenCalled();
    expect(openShardAt).not.toHaveBeenCalled();
    expect(scanShards).not.toHaveBeenCalled();
    expect(materialize).not.toHaveBeenCalled();
  });
});

/** Record reads under published roots, in order; fold-session reads are marked apart. */
function recordReads(spy: ReadRecordsSpy): readonly string[] {
  return Object.freeze(spy.mock.calls.map(([root, keys]) => (
    `${root.isEmpty() ? 'fold' : 'read'}:${keys.map((key) => key.toString()).join(',')}`
  )));
}

async function observeFromFreshRuntime(at: string) {
  const runtime = await Runtime.open({ at, writer: WRITER_ID });
  try {
    const lane = await runtime.lane(LANE_NAME);
    const propertyObservation = lane.observe(propertyObserver());
    const property = await propertyObservation.one();
    const propertyReceipt = await propertyObservation.receipt;
    const neighborhoodObservation = lane.observe(neighborhoodObserver());
    const neighborhood = await neighborhoodObservation.one();
    const neighborhoodReceipt = await neighborhoodObservation.receipt;
    return Object.freeze({
      property: property.value,
      propertyReceiptStatus: propertyReceipt.status,
      neighborhood: neighborhood.value,
      neighborhoodReceiptStatus: neighborhoodReceipt.status,
    });
  } finally {
    await runtime.close();
  }
}

function propertyObserver() {
  return createObserver<string>(
    'events.status-of',
    LegacyReading.property({ subject: HUB_NODE_ID, key: 'status' }),
    (value) => {
      if (typeof value !== 'string') {
        throw new TypeError('events.status-of expected a string');
      }
      return value;
    },
  );
}

function neighborhoodObserver() {
  return createObserver<ReadingValue>(
    'events.neighborhood-of',
    LegacyReading.neighborhood({
      subject: HUB_NODE_ID,
      direction: 'out',
      labels: ['contains'],
      limit: 10,
    }),
    (value) => value,
  );
}
