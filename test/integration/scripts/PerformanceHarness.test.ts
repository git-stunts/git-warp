import { describe, expect, it } from 'vitest';
import {
  preparePerformanceFixture,
} from '../../../scripts/performance/PerformanceFixture.ts';
import type {
  PerformanceSample,
  PerformanceScenarioName,
} from '../../../scripts/performance/PerformanceModel.ts';
import {
  runPerformanceWorker,
} from '../../../scripts/performance/PerformanceWorker.ts';

describe('v19 materialization performance harness', () => {
  it('proves cold, exact-warm, and predecessor-incremental semantics', async () => {
    const cold = await runScenario('cold-materialize');
    const warm = await runScenario('warm-materialize');
    const incremental = await runScenario('incremental-materialize');

    expect(warm.observation.semantic).toEqual(cold.observation.semantic);
    expect(cold.observation.materialization.replayedPatches).toBe(1);
    expect(warm.observation.materialization).toMatchObject({
      exactHits: 1,
      replayedPatches: 0,
      retainRequests: 0,
    });
    expect(incremental.observation.materialization).toMatchObject({
      predecessorHits: 1,
      replayedPatches: 1,
    });
    expect(incremental.observation.semantic).toMatchObject({
      edgeCount: 4,
      nodeCount: 5,
      propertyCount: 5,
      targetPropertyBytes: 64,
    });
  }, 120_000);
});

async function runScenario(
  scenario: PerformanceScenarioName,
): Promise<PerformanceSample> {
  const fixture = await preparePerformanceFixture(scenario, {
    baseNodeCount: 4,
    propertyBytesPerNode: 64,
    suffixNodeCount: 1,
  });
  try {
    return await runPerformanceWorker({
      repositoryPath: fixture.repositoryPath,
      scenario,
    });
  } finally {
    await fixture.cleanup();
  }
}
