import { getHeapStatistics } from 'node:v8';
import { clearInterval, setInterval } from 'node:timers';

import { Runtime } from '../../index.ts';
import RuntimeHost from '../../src/domain/RuntimeHost.ts';
import LegacyReading from '../../src/domain/api/Reading.ts';
import { createObserver } from '../../src/domain/api/ObserverRuntime.ts';
import type { ReadingValue } from '../../src/domain/api/ObservedReading.ts';
import { installDefaultRuntimeHostNodePorts } from '../../src/application/RuntimeHostNodeDefaults.ts';
import { CborIndexStoreAdapter } from '../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import { createTestRepo } from '../integration/api/helpers/setup.ts';

const LANE_NAME = 'events';
const WRITER_ID = 'agent-1';
const HUB_NODE_ID = 'node:hub';
const NEIGHBOR_NODE_ID = 'node:neighbor';

installDefaultRuntimeHostNodePorts();
const configuredHeapCapMiB = readConfiguredHeapCapMiB();

let peakHeapUsedBytes = 0;
let peakRssBytes = 0;
const sampleMemory = (): void => {
  const memory = process.memoryUsage();
  peakHeapUsedBytes = Math.max(peakHeapUsedBytes, memory.heapUsed);
  peakRssBytes = Math.max(peakRssBytes, memory.rss);
};
const sampler = setInterval(sampleMemory, 5);
sampler.unref();
sampleMemory();

const repository = await createTestRepo('runtime-observer-memory-cap');
const originalMaterialize = RuntimeHost.prototype.materialize;
const originalScanShards = CborIndexStoreAdapter.prototype.scanShards;
let materializeCalls = 0;
let wholeIndexScans = 0;

try {
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
  sampleMemory();

  RuntimeHost.prototype.materialize = async function prohibitedMaterialize() {
    materializeCalls += 1;
    throw new Error('bounded Observer called RuntimeHost.materialize()');
  };
  CborIndexStoreAdapter.prototype.scanShards = function prohibitedScanShards() {
    wholeIndexScans += 1;
    throw new Error('bounded Observer called scanShards()');
  };

  const first = await observeFromFreshRuntime(repository.tempDir);
  sampleMemory();
  const second = await observeFromFreshRuntime(repository.tempDir);
  sampleMemory();

  console.log(
    JSON.stringify({
      configuredHeapCapMiB,
      heapLimitMiB: bytesToMiB(getHeapStatistics().heap_size_limit),
      peakHeapUsedMiB: bytesToMiB(peakHeapUsedBytes),
      peakRssMiB: bytesToMiB(peakRssBytes),
      materializeCalls,
      wholeIndexScans,
      first,
      second,
    })
  );
} finally {
  clearInterval(sampler);
  RuntimeHost.prototype.materialize = originalMaterialize;
  CborIndexStoreAdapter.prototype.scanShards = originalScanShards;
  await repository.cleanup();
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
    }
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
    (value) => value
  );
}

function bytesToMiB(bytes: number): number {
  return Number((bytes / (1024 * 1024)).toFixed(2));
}

function readConfiguredHeapCapMiB(): number {
  const argument = process.execArgv.find((value) => value.startsWith('--max-old-space-size='));
  const value = Number(argument?.split('=', 2)[1]);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('bounded Observer child requires --max-old-space-size=<MiB>');
  }
  return value;
}
