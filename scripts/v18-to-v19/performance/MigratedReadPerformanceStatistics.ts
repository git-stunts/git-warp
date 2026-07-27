import type {
  MigratedReadRuntime,
  MigratedReadRuntimeSummary,
  MigratedReadSample,
  MigratedReadScenario,
  MigratedReadScenarioSummary,
} from './MigratedReadPerformanceModel.ts';

export function summarizeMigratedReadRuntime(
  runtime: MigratedReadRuntime,
  samples: readonly MigratedReadSample[],
): MigratedReadRuntimeSummary {
  return Object.freeze({
    cold: summarizeScenario(runtime, 'cold', samples),
    warm: summarizeScenario(runtime, 'warm', samples),
  });
}

function summarizeScenario(
  runtime: MigratedReadRuntime,
  scenario: MigratedReadScenario,
  samples: readonly MigratedReadSample[],
): MigratedReadScenarioSummary {
  const matching = samples.filter((sample) =>
    sample.runtime === runtime && sample.scenario === scenario
  );
  if (matching.length === 0) {
    throw new Error(`${runtime} ${scenario} produced no measured samples`);
  }
  return Object.freeze({
    cpuTotalMs: distribution(matching.map((sample) => sample.cpuTotalMs)),
    gitCommandCount: distribution(
      matching.map((sample) => sample.gitCommandCount),
    ),
    maxRssBytes: distribution(matching.map((sample) => sample.maxRssBytes)),
    peakHeapUsedBytes: distribution(
      matching.map((sample) => sample.peakHeapUsedBytes),
    ),
    samples: [...matching],
    wallMs: distribution(matching.map((sample) => sample.wallMs)),
    workerLifecycleWallMs: distribution(
      matching.map((sample) => sample.workerLifecycleWallMs),
    ),
  });
}

function distribution(values: readonly number[]): Readonly<{
  maximum: number;
  median: number;
  minimum: number;
  samples: number[];
}> {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = requiredValue(sorted, middle);
  const median = sorted.length % 2 === 0
    ? (requiredValue(sorted, middle - 1) + upper) / 2
    : upper;
  return Object.freeze({
    maximum: Math.max(...values),
    median,
    minimum: Math.min(...values),
    samples: [...values],
  });
}

function requiredValue(values: readonly number[], index: number): number {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`distribution index ${String(index)} is absent`);
  }
  return value;
}
