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
  it('keeps the legacy one-patch corpus when patch counts are omitted', async () => {
    const fixture = await preparePerformanceFixture('cold-materialize', {
      baseNodeCount: 2,
      propertyBytesPerNode: 64,
    });
    try {
      expect(fixture.manifest.corpus).toMatchObject({
        baseNodeCount: 2,
        format: 'git-warp.performance.corpus/v1',
        suffixNodeCount: 0,
        version: 1,
      });
      expect(fixture.manifest.corpus).not.toHaveProperty('basePatchCount');
      expect(fixture.manifest.corpus).not.toHaveProperty('suffixPatchCount');
    } finally {
      await fixture.cleanup();
    }
  });

  it('proves cold, exact-warm, and predecessor-incremental semantics', async () => {
    const cold = await runScenario('cold-materialize');
    const warm = await runScenario('warm-materialize');
    const incremental = await runScenario('incremental-materialize');

    expect(warm.observation.semantic).toEqual(cold.observation.semantic);
    expect(cold.observation.materialization.replayedPatches).toBe(3);
    expect(warm.observation.materialization).toMatchObject({
      exactHits: 1,
      replayedPatches: 0,
      retainRequests: 0,
    });
    expect(incremental.observation.materialization).toMatchObject({
      predecessorHits: 1,
      replayedPatches: 2,
    });
    expect(incremental.observation.semantic).toMatchObject({
      edgeCount: 5,
      nodeCount: 6,
      propertyCount: 6,
      targetPropertyBytes: 64,
    });
  }, 120_000);
});

async function runScenario(
  scenario: PerformanceScenarioName,
): Promise<PerformanceSample> {
  const fixture = await preparePerformanceFixture(scenario, {
    baseNodeCount: 4,
    basePatchCount: 3,
    propertyBytesPerNode: 64,
    suffixNodeCount: 2,
    suffixPatchCount: 2,
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
