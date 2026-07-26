import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  prepareStreamingFixture,
  type StreamingCorpusSpec,
} from './StreamingFixture.ts';
import { validateStreamingPerformanceResult }
  from './StreamingPerformanceModel.ts';
import { startMemorySampler }
  from './StreamingPerformanceInstrumentation.ts';
import {
  assertCollectingControlExhaustsHeap,
  runStreamingPerformanceProcess,
  type StreamingProcessOptions,
} from './StreamingPerformanceProcess.ts';

const MEBIBYTE = 1024 * 1024;

type StreamingProfile = Readonly<{
  corpus: StreamingCorpusSpec;
  maximumGenerationHeapBytes: number;
  process: Omit<StreamingProcessOptions, 'mode' | 'repositoryPath'>;
  proveHostileControl: boolean;
}>;

type RunOptions = Readonly<{
  outputPath: string;
  profileName: 'mini' | 'proof';
}>;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const profile = streamingProfile(options.profileName);
  const generationMemory = startMemorySampler();
  const fixture = await prepareStreamingFixture(profile.corpus);
  generationMemory.stop();
  try {
    const generation = Object.freeze({
      ...generationMemory.snapshot(),
      maximumHeapUsedBytes: profile.maximumGenerationHeapBytes,
    });
    if (generation.peakHeapUsedBytes > generation.maximumHeapUsedBytes) {
      throw new Error('Streaming fixture generation exceeded its heap envelope');
    }
    const processOptions = Object.freeze({
      ...profile.process,
      repositoryPath: fixture.repositoryPath,
    });
    const streaming = await runStreamingPerformanceProcess({
      ...processOptions,
      mode: 'stream',
    });
    validateStreamingPerformanceResult(streaming, fixture.manifest);
    if (profile.proveHostileControl) {
      await assertCollectingControlExhaustsHeap(processOptions);
    }
    const report = Object.freeze({
      fixture: fixture.manifest,
      generation,
      hostileControl: profile.proveHostileControl
        ? 'failed-with-memory-exhaustion'
        : 'not-run-mini-profile',
      profile: options.profileName,
      streaming,
    });
    await mkdir(dirname(options.outputPath), { recursive: true });
    await writeFile(
      options.outputPath,
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
    printSummary(options.outputPath, report);
  } finally {
    await fixture.cleanup();
  }
}

function streamingProfile(name: RunOptions['profileName']): StreamingProfile {
  if (name === 'mini') {
    return Object.freeze({
      corpus: Object.freeze({
        batchNodeCount: 2,
        minimumLogicalToOldSpaceRatio: 0.003,
        minimumPropertyPages: 4,
        nodeCount: 4,
        propertyBytesPerNode: 64 * 1024,
      }),
      maximumGenerationHeapBytes: 256 * MEBIBYTE,
      process: Object.freeze({
        consumerDelayMs: 0,
        maxOldSpaceBytes: 64 * MEBIBYTE,
        maximumRssBytes: 1024 * MEBIBYTE,
      }),
      proveHostileControl: false,
    });
  }
  return Object.freeze({
    corpus: Object.freeze({
      batchNodeCount: 1,
      minimumLogicalToOldSpaceRatio: 4,
      minimumPropertyPages: 128,
      nodeCount: 128,
      propertyBytesPerNode: 2 * MEBIBYTE,
    }),
    maximumGenerationHeapBytes: 96 * MEBIBYTE,
    process: Object.freeze({
      consumerDelayMs: 2,
      maxOldSpaceBytes: 64 * MEBIBYTE,
      maximumRssBytes: 384 * MEBIBYTE,
    }),
    proveHostileControl: true,
  });
}

function parseOptions(args: readonly string[]): RunOptions {
  let outputPath = resolve('benchmarks/v19/results/streaming-latest.json');
  let profileName: RunOptions['profileName'] = 'proof';
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === '--output' && value !== undefined) {
      outputPath = resolve(value);
    } else if (argument === '--profile' && (value === 'mini' || value === 'proof')) {
      profileName = value;
    } else {
      throw new Error(`Unknown streaming performance argument: ${String(argument)}`);
    }
    index += 1;
  }
  return Object.freeze({ outputPath, profileName });
}

function printSummary(
  outputPath: string,
  report: Readonly<{
    fixture: Readonly<{ logicalPropertyBytes: number; nodeCount: number }>;
    hostileControl: string;
    streaming: Readonly<{
      config: Readonly<{ maxOldSpaceBytes: number }>;
      metrics: Readonly<{ maxRssBytes: number; peakHeapUsedBytes: number }>;
    }>;
  }>,
): void {
  process.stdout.write(
    `streamed ${String(report.fixture.nodeCount)} readings `
    + `(${String(report.fixture.logicalPropertyBytes)} logical bytes) `
    + `under ${String(report.streaming.config.maxOldSpaceBytes)} old-space bytes; `
    + `peak heap ${String(report.streaming.metrics.peakHeapUsedBytes)}; `
    + `peak RSS ${String(report.streaming.metrics.maxRssBytes)}; `
    + `hostile control ${report.hostileControl}; ${outputPath}\n`,
  );
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
