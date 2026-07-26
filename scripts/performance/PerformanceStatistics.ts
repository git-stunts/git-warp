import type {
  CorpusProfile,
  Distribution,
  PerformanceSample,
  PerformanceScenarioName,
  ScenarioResult,
} from './PerformanceModel.ts';

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
    cpuSystemMs: summarizeDistribution(samples.map((sample) => sample.cpuSystemMs)),
    cpuTotalMs: summarizeDistribution(samples.map((sample) => sample.cpuTotalMs)),
    cpuUserMs: summarizeDistribution(samples.map((sample) => sample.cpuUserMs)),
    gitCommandCount: summarizeDistribution(
      samples.map((sample) => sample.gitCommandCount),
    ),
    maxRssBytes: summarizeDistribution(samples.map((sample) => sample.maxRssBytes)),
    measuredRuns: samples.length,
    peakHeapUsedBytes: summarizeDistribution(
      samples.map((sample) => sample.peakHeapUsedBytes),
    ),
    samples: Object.freeze([...samples]),
    scenario,
    throughputPerSecond: summarizeDistribution(
      samples.map((sample) => sample.throughputPerSecond),
    ),
    wallMs: summarizeDistribution(samples.map((sample) => sample.wallMs)),
    warmupRuns,
  });
}

export function summarizeDistribution(values: readonly number[]): Distribution {
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
