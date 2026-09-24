export const PERFORMANCE_SCHEMA_VERSION = 1;

export type PerformanceScenarioName =
  | 'cold-materialize'
  | 'warm-property-read'
  | 'incremental-materialize'
  | 'bounded-memory-read';

export type CorpusProfile = Readonly<{
  edgeCount: number;
  logicalPropertyBytes: number;
  nodeCount: number;
  propertyBytesPerNode: number;
  propertyCount: number;
  topology: 'directed-chain';
}>;

export type WorkerObservation = Readonly<{
  cachedWholeState: boolean;
  operationCount: number;
  replayCount: number;
  resultBytes: number;
  resultCount: number;
  timeToFirstReadingMs: number | null;
}>;

export type PerformanceSample = Readonly<{
  cpuSystemMs: number;
  cpuTotalMs: number;
  cpuUserMs: number;
  gitCommandCount: number;
  gitCommandHistogram: Readonly<Record<string, number>>;
  heapUsedBytes: number;
  maxRssBytes: number;
  observation: WorkerObservation;
  throughputPerSecond: number;
  wallMs: number;
}>;

export type Distribution = Readonly<{
  mad: number;
  maximum: number;
  median: number;
  minimum: number;
  samples: readonly number[];
}>;

export type ScenarioResult = Readonly<{
  corpus: CorpusProfile;
  cpuSystemMs: Distribution;
  cpuTotalMs: Distribution;
  cpuUserMs: Distribution;
  gitCommandCount: Distribution;
  heapUsedBytes: Distribution;
  maxRssBytes: Distribution;
  measuredRuns: number;
  samples: readonly PerformanceSample[];
  scenario: PerformanceScenarioName;
  throughputPerSecond: Distribution;
  wallMs: Distribution;
  warmupRuns: number;
}>;

export type PerformanceResult = Readonly<{
  commit: string;
  environment: Readonly<{
    architecture: string;
    cpuCount: number;
    cpuModel: string;
    node: string;
    platform: NodeJS.Platform;
    runner: string;
  }>;
  generatedAt: string;
  instrumentation: Readonly<{
    casHitMiss: null;
    casHitMissReason: string;
    cpuScope: 'process-and-descendants' | 'node-process';
    gitCommands: 'counted-plumbing-calls';
    rssScope: 'process-and-descendants' | 'worker-process';
    wallClock: 'measured-operation' | 'worker-lifecycle';
  }>;
  scenarios: Readonly<Record<PerformanceScenarioName, ScenarioResult>>;
  schemaVersion: number;
  streamingContract: Readonly<{
    heapCapBytes: number;
    logicalToHeapRatio: number;
    maximumRssBytes: number;
    passed: boolean;
  }>;
}>;

export function summarizeScenario(
  scenario: PerformanceScenarioName,
  corpus: CorpusProfile,
  samples: readonly PerformanceSample[],
  warmupRuns: number,
): ScenarioResult {
  if (samples.length === 0) {
    throw new Error(`Performance scenario has no measured samples: ${scenario}`);
  }
  return Object.freeze({
    corpus,
    cpuSystemMs: distribution(samples.map((sample) => sample.cpuSystemMs)),
    cpuTotalMs: distribution(samples.map((sample) => sample.cpuTotalMs)),
    cpuUserMs: distribution(samples.map((sample) => sample.cpuUserMs)),
    gitCommandCount: distribution(samples.map((sample) => sample.gitCommandCount)),
    heapUsedBytes: distribution(samples.map((sample) => sample.heapUsedBytes)),
    maxRssBytes: distribution(samples.map((sample) => sample.maxRssBytes)),
    measuredRuns: samples.length,
    samples: Object.freeze([...samples]),
    scenario,
    throughputPerSecond: distribution(samples.map((sample) => sample.throughputPerSecond)),
    wallMs: distribution(samples.map((sample) => sample.wallMs)),
    warmupRuns,
  });
}

function distribution(values: readonly number[]): Distribution {
  const medianValue = median(values);
  return Object.freeze({
    mad: median(values.map((value) => Math.abs(value - medianValue))),
    maximum: Math.max(...values),
    median: medianValue,
    minimum: Math.min(...values),
    samples: Object.freeze([...values]),
  });
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const right = sorted[middle];
  if (right === undefined) {
    throw new Error('Cannot compute a median without values');
  }
  if (sorted.length % 2 === 1) {
    return right;
  }
  const left = sorted[middle - 1];
  if (left === undefined) {
    throw new Error('Cannot compute an even median without two values');
  }
  return (left + right) / 2;
}
