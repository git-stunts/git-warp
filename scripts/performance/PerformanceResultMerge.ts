import {
  PERFORMANCE_SCENARIOS,
  validatePerformanceResult,
  type PerformanceResult,
} from './PerformanceModel.ts';
import { summarizeScenario } from './PerformanceStatistics.ts';

export function mergePerformanceResults(
  results: readonly PerformanceResult[],
): PerformanceResult {
  const first = results[0];
  if (first === undefined) {
    throw new Error('Cannot merge an empty performance result set');
  }
  for (const result of results) {
    validatePerformanceResult(result);
    assertSharedRunIdentity(first, result);
  }

  const scenarios = Object.fromEntries(PERFORMANCE_SCENARIOS.map((scenario) => {
    const samples = results.flatMap((result) => result.scenarios[scenario].samples);
    const warmupRuns = results.reduce(
      (total, result) => total + result.scenarios[scenario].warmupRuns,
      0,
    );
    return [
      scenario,
      summarizeScenario(
        scenario,
        first.scenarios[scenario].corpus,
        samples,
        warmupRuns,
      ),
    ];
  })) as PerformanceResult['scenarios'];

  const merged: PerformanceResult = Object.freeze({
    ...first,
    generatedAt: new Date().toISOString(),
    scenarios: Object.freeze(scenarios),
  });
  validatePerformanceResult(merged);
  return merged;
}

function assertSharedRunIdentity(
  first: PerformanceResult,
  candidate: PerformanceResult,
): void {
  if (candidate.commit !== first.commit) {
    throw new Error('Performance batches have different commits');
  }
  if (JSON.stringify(candidate.environment) !== JSON.stringify(first.environment)) {
    throw new Error('Performance batches have different environments');
  }
  if (
    JSON.stringify(candidate.instrumentation)
    !== JSON.stringify(first.instrumentation)
  ) {
    throw new Error('Performance batches have different instrumentation');
  }
  for (const scenario of PERFORMANCE_SCENARIOS) {
    if (
      JSON.stringify(candidate.scenarios[scenario].corpus)
      !== JSON.stringify(first.scenarios[scenario].corpus)
    ) {
      throw new Error(`Performance batches have different corpora: ${scenario}`);
    }
  }
}
