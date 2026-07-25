import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Runtime } from '../../../index.ts';
import RuntimeHost from '../../../src/domain/RuntimeHost.ts';
import LegacyReading from '../../../src/domain/api/Reading.ts';
import {
  createObserver,
} from '../../../src/domain/api/ObserverRuntime.ts';
import type { ReadingValue } from '../../../src/domain/api/ObservedReading.ts';
import CheckpointTailFactReducer
  from '../../../src/domain/services/optic/CheckpointTailFactReducer.ts';
import type BundleHandle from '../../../src/domain/storage/BundleHandle.ts';
import { CborIndexStoreAdapter }
  from '../../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import { createTestRepo }
  from '../api/helpers/setup.ts';

const LANE_NAME = 'events';
const WRITER_ID = 'agent-1';
const HUB_NODE_ID = 'node:hub';
const NEIGHBOR_NODE_ID = 'node:neighbor';

type ShardPathSpy = Readonly<{
  mock: Readonly<{
    calls: readonly (readonly [BundleHandle, string, ...unknown[]])[];
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

  it('reuses the same bounded checkpoint pages without reducing covered patches', async () => {
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
    const reduceProperty = vi.spyOn(CheckpointTailFactReducer.prototype, 'reduceProperty');
    const assertNeighborhoodTailStable = vi.spyOn(
      CheckpointTailFactReducer.prototype,
      'assertNeighborhoodTailStable',
    );

    const first = await observeFromFreshRuntime(repository.tempDir);
    const firstPropertyPages = shardReadsFor(decodeShardAt, 'props_');
    const firstNeighborhoodPages = openedShardPaths(openShardAt);

    decodeShardAt.mockClear();
    openShardAt.mockClear();
    const second = await observeFromFreshRuntime(repository.tempDir);
    const secondPropertyPages = shardReadsFor(decodeShardAt, 'props_');
    const secondNeighborhoodPages = openedShardPaths(openShardAt);

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
    expect(secondPropertyPages).toEqual(firstPropertyPages);
    expect(secondNeighborhoodPages).toEqual(firstNeighborhoodPages);
    expect(firstPropertyPages).toHaveLength(1);
    expect(firstNeighborhoodPages.length).toBeGreaterThan(0);
    expect(firstNeighborhoodPages.length).toBeLessThanOrEqual(6);
    expect(scanShards).not.toHaveBeenCalled();
    expect(materialize).not.toHaveBeenCalled();
    expect(reduceProperty).toHaveBeenCalledTimes(2);
    expect(reduceProperty.mock.calls.every(([options]) => options.tailEntries.length === 0))
      .toBe(true);
    expect(assertNeighborhoodTailStable).toHaveBeenCalledTimes(2);
    expect(
      assertNeighborhoodTailStable.mock.calls.every(([tailEntries]) => tailEntries.length === 0),
    ).toBe(true);
  });
});

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

function shardReadsFor(
  spy: ShardPathSpy,
  prefix: string,
): readonly string[] {
  return Object.freeze(
    spy.mock.calls
      .filter(([, path]) => path.startsWith(prefix))
      .map(([handle, path]) => `${handle.toString()}:${path}`)
  );
}

function openedShardPaths(
  spy: ShardPathSpy,
): readonly string[] {
  return Object.freeze(
    spy.mock.calls
      .map(([handle, path]) => `${handle.toString()}:${path}`),
  );
}
