import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers';
import { pathToFileURL } from 'node:url';
import { getHeapStatistics } from 'node:v8';
import { Runtime } from '../../index.ts';
import { installDefaultRuntimeHostNodePorts }
  from '../../src/application/RuntimeHostNodeDefaults.ts';
import {
  createManyObserver,
} from '../../src/domain/api/ObserverRuntime.ts';
import LegacyReading from '../../src/domain/api/Reading.ts';
import { performanceNodeId } from './PerformanceFixture.ts';
import {
  decodeStreamingPayloadDescriptor,
  readStreamingFixtureManifest,
} from './StreamingFixture.ts';
import {
  STREAMING_SCHEMA_VERSION,
  type StreamingPerformanceResult,
} from './StreamingPerformanceModel.ts';
import {
  installPathEvidence,
  startMemorySampler,
} from './StreamingPerformanceInstrumentation.ts';

const GRAPH_NAME = 'performance';
const RESULT_PREFIX = 'GIT_WARP_STREAMING_PERFORMANCE_RESULT=';
const WRITER_ID = 'benchmark-writer';

export type StreamingWorkerOptions = Readonly<{
  consumerDelayMs: number;
  maxOldSpaceBytes: number;
  maximumRssBytes: number;
  mode: 'collect' | 'stream';
  repositoryPath: string;
}>;

async function main(): Promise<void> {
  const options = parseWorkerOptions(process.argv.slice(2));
  const result = await runStreamingPerformanceWorker(options);
  process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(result)}\n`);
}

export async function runStreamingPerformanceWorker(
  options: StreamingWorkerOptions,
): Promise<StreamingPerformanceResult> {
  installDefaultRuntimeHostNodePorts();
  const manifest = await readStreamingFixtureManifest(options.repositoryPath);
  const pathEvidence = installPathEvidence();
  const memory = startMemorySampler();
  let runtime: Runtime | undefined;
  try {
    runtime = await Runtime.open({
      at: options.repositoryPath,
      writer: WRITER_ID,
    });
    const lane = await runtime.lane(GRAPH_NAME);
    const observation = await consumeObservation(
      lane,
      manifest,
      options,
      memory.sample,
    );
    return Object.freeze({
      config: Object.freeze({
        consumerDelayMs: options.consumerDelayMs,
        expectedReadingCount: manifest.nodeCount,
        logicalPropertyBytes: manifest.logicalPropertyBytes,
        logicalToOldSpaceRatio:
          manifest.logicalPropertyBytes / options.maxOldSpaceBytes,
        maxOldSpaceBytes: options.maxOldSpaceBytes,
        maximumRssBytes: options.maximumRssBytes,
        minimumPropertyPages: manifest.minimumPropertyPages,
        observedHeapLimitBytes: getHeapStatistics().heap_size_limit,
      }),
      evidence: Object.freeze({
        ...observation.evidence,
        ...pathEvidence.snapshot(),
      }),
      metrics: Object.freeze({
        ...observation.metrics,
        ...memory.snapshot(),
      }),
      receipt: observation.receipt,
      schemaVersion: STREAMING_SCHEMA_VERSION,
      semantic: observation.semantic,
    });
  } finally {
    memory.stop();
    pathEvidence.restore();
    await runtime?.close();
  }
}

async function consumeObservation(
  lane: Awaited<ReturnType<Runtime['lane']>>,
  manifest: Awaited<ReturnType<typeof readStreamingFixtureManifest>>,
  options: StreamingWorkerOptions,
  sampleMemory: () => void,
) {
  let plannedReadings = 0;
  let decodedReadings = 0;
  let maximumPlanningLead = 0;
  const observer = createManyObserver<string>(
    'performance.streamed-properties',
    () => (function* () {
      for (let index = 0; index < manifest.nodeCount; index += 1) {
        plannedReadings += 1;
        maximumPlanningLead = Math.max(
          maximumPlanningLead,
          plannedReadings - decodedReadings,
        );
        yield LegacyReading.property({
          key: 'payload',
          subject: performanceNodeId(index),
        });
      }
    })(),
    decodePayload,
  );
  const observation = lane.observe(observer);
  const fingerprint = createHash('sha256');
  const collected = options.mode === 'collect' ? [] as string[][] : undefined;
  let resultBytes = 0;
  let readingCount = 0;
  let timeToFirstReadingMs: number | undefined;
  const wallStart = performance.now();
  for await (const reading of observation) {
    decodedReadings += 1;
    timeToFirstReadingMs ??= performance.now() - wallStart;
    fingerprint.update(reading.value);
    resultBytes += reading.value.length;
    readingCount += 1;
    collected?.push([...reading.value]);
    if (options.consumerDelayMs > 0) {
      await delay(options.consumerDelayMs);
    }
    sampleMemory();
  }
  const receipt = await observation.receipt;
  const wallMs = performance.now() - wallStart;
  sampleMemory();
  if (receipt.status !== 'completed') {
    throw new Error(`Streaming observation ended with ${receipt.status}`);
  }
  const receiptEvidence = receipt.evidence;
  if (receiptEvidence === undefined) {
    throw new Error('Streaming observation receipt has no accepted evidence');
  }
  return Object.freeze({
    evidence: Object.freeze({
      decodedReadings,
      maximumPlanningLead,
      plannedReadings,
    }),
    metrics: Object.freeze({
      throughputPerSecond: readingCount / (wallMs / 1000),
      timeToFirstReadingMs: timeToFirstReadingMs ?? 0,
      wallMs,
    }),
    receipt: Object.freeze({
      basisId: receiptEvidence.basis.id,
      status: receipt.status,
      tickId: receiptEvidence.tick?.id ?? null,
    }),
    semantic: Object.freeze({
      fingerprint: fingerprint.digest('hex'),
      readingCount,
      resultBytes,
    }),
  });
}

function decodePayload(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('performance.streamed-properties expected a descriptor string');
  }
  return decodeStreamingPayloadDescriptor(value);
}

function parseWorkerOptions(args: readonly string[]): StreamingWorkerOptions {
  let consumerDelayMs: number | undefined;
  let maxOldSpaceBytes: number | undefined;
  let maximumRssBytes: number | undefined;
  let mode: StreamingWorkerOptions['mode'] | undefined;
  let repositoryPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === '--consumer-delay-ms') {
      consumerDelayMs = nonNegativeInteger(value, argument);
    } else if (argument === '--max-old-space-bytes') {
      maxOldSpaceBytes = positiveInteger(value, argument);
    } else if (argument === '--maximum-rss-bytes') {
      maximumRssBytes = positiveInteger(value, argument);
    } else if (argument === '--mode' && (value === 'stream' || value === 'collect')) {
      mode = value;
    } else if (argument === '--repo' && value !== undefined) {
      repositoryPath = value;
    } else {
      throw new Error(`Unknown streaming worker argument: ${String(argument)}`);
    }
    index += 1;
  }
  if (
    consumerDelayMs === undefined
    || maxOldSpaceBytes === undefined
    || maximumRssBytes === undefined
    || mode === undefined
    || repositoryPath === undefined
  ) {
    throw new Error('Streaming worker requires delay, memory, mode, and repo options');
  }
  return Object.freeze({
    consumerDelayMs,
    maxOldSpaceBytes,
    maximumRssBytes,
    mode,
    repositoryPath,
  });
}

function positiveInteger(value: string | undefined, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${option} requires a positive integer`);
  }
  return parsed;
}

function nonNegativeInteger(value: string | undefined, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${option} requires a non-negative integer`);
  }
  return parsed;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  });
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  void main().catch((raw: unknown) => {
    const message = raw instanceof Error ? raw.stack ?? raw.message : String(raw);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
