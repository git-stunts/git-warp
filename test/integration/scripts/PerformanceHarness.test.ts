import { describe, expect, it } from 'vitest';
import { preparePerformanceFixture } from '../../../scripts/performance/PerformanceFixture.ts';
import { runPerformanceWorker } from '../../../scripts/performance/PerformanceWorker.ts';

describe('v19 performance harness', () => {
  it('reads a retained property without replaying or caching the whole graph', async () => {
    const fixture = await preparePerformanceFixture('warm-property-read', {
      nodeCount: 4,
      propertyBytesPerNode: 128,
    });
    try {
      const sample = await runPerformanceWorker({
        repositoryPath: fixture.repositoryPath,
        scenario: 'warm-property-read',
      });

      expect(sample.observation.replayCount).toBe(0);
      expect(sample.observation.cachedWholeState).toBe(false);
      expect(sample.observation.resultCount).toBe(16);
      expect(sample.observation.resultBytes).toBe(16 * 128);
      expect(sample.gitCommandCount).toBeGreaterThan(0);
      expect(sample.gitCommandHistogram['update-ref']).toBe(1);
      expect(sample.throughputPerSecond).toBeGreaterThan(0);
    } finally {
      await fixture.cleanup();
    }
  }, 120_000);
});
