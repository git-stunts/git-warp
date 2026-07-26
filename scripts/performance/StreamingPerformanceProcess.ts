import { fileURLToPath } from 'node:url';
import { spawnAndCollect } from './PerformanceProcess.ts';
import {
  parseStreamingPerformanceResult,
  type StreamingPerformanceResult,
} from './StreamingPerformanceModel.ts';

const RESULT_PREFIX = 'GIT_WARP_STREAMING_PERFORMANCE_RESULT=';
const WORKER_TIMEOUT_MS = 10 * 60 * 1000;

export type StreamingProcessOptions = Readonly<{
  consumerDelayMs: number;
  maxOldSpaceBytes: number;
  maximumRssBytes: number;
  mode: 'collect' | 'stream';
  repositoryPath: string;
}>;

export async function runStreamingPerformanceProcess(
  options: StreamingProcessOptions,
): Promise<StreamingPerformanceResult> {
  const maxOldSpaceMib = exactMib(options.maxOldSpaceBytes);
  const workerPath = fileURLToPath(
    new URL('./StreamingPerformanceWorker.js', import.meta.url),
  );
  const completed = await spawnAndCollect(
    process.execPath,
    [
      `--max-old-space-size=${String(maxOldSpaceMib)}`,
      workerPath,
      '--repo',
      options.repositoryPath,
      '--consumer-delay-ms',
      String(options.consumerDelayMs),
      '--max-old-space-bytes',
      String(options.maxOldSpaceBytes),
      '--maximum-rss-bytes',
      String(options.maximumRssBytes),
      '--mode',
      options.mode,
    ],
    process.env,
    WORKER_TIMEOUT_MS,
  );
  return parseWorkerResult(completed.stdout);
}

export async function assertCollectingControlExhaustsHeap(
  options: Omit<StreamingProcessOptions, 'mode'>,
): Promise<void> {
  try {
    await runStreamingPerformanceProcess({ ...options, mode: 'collect' });
  } catch (raw) {
    const message = raw instanceof Error ? raw.message : String(raw);
    if (isHeapExhaustionFailure(message)) {
      return;
    }
    throw new Error(`Collecting control failed for an unexpected reason: ${message}`);
  }
  throw new Error('Collecting control unexpectedly completed within the heap cap');
}

export function isHeapExhaustionFailure(message: string): boolean {
  return /heap out of memory|allocation failed|SIGABRT/iu.test(message);
}

function exactMib(bytes: number): number {
  const mebibyte = 1024 * 1024;
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes % mebibyte !== 0) {
    throw new Error('maxOldSpaceBytes must be a positive whole number of MiB');
  }
  return bytes / mebibyte;
}

function parseWorkerResult(stdout: string): StreamingPerformanceResult {
  const line = stdout.split('\n').find((entry) => entry.startsWith(RESULT_PREFIX));
  if (line === undefined) {
    throw new Error(`Streaming worker emitted no result: ${stdout}`);
  }
  const parsed: unknown = JSON.parse(line.slice(RESULT_PREFIX.length));
  return parseStreamingPerformanceResult(parsed);
}
