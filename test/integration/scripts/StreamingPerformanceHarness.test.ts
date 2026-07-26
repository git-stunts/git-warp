import { describe, expect, it } from 'vitest';
import {
  prepareStreamingFixture,
} from '../../../scripts/performance/StreamingFixture.ts';
import { validateStreamingPerformanceResult }
  from '../../../scripts/performance/StreamingPerformanceModel.ts';
import { runStreamingPerformanceWorker }
  from '../../../scripts/performance/StreamingPerformanceWorker.ts';

const MEBIBYTE = 1024 * 1024;

describe('v19 streamed observation performance harness', () => {
  it('persists descriptors and decodes logical payloads lazily from retained pages', async () => {
    const fixture = await prepareStreamingFixture({
      batchNodeCount: 2,
      minimumLogicalToOldSpaceRatio: 0.003,
      minimumPropertyPages: 4,
      nodeCount: 4,
      propertyBytesPerNode: 64 * 1024,
    });
    try {
      const result = await runStreamingPerformanceWorker({
        consumerDelayMs: 1,
        maxOldSpaceBytes: 64 * MEBIBYTE,
        maximumRssBytes: 1024 * MEBIBYTE,
        mode: 'stream',
        repositoryPath: fixture.repositoryPath,
      });
      expect(() => validateStreamingPerformanceResult(result, fixture.manifest))
        .not.toThrow();
      expect(result.evidence).toMatchObject({
        decodedReadings: 4,
        materializeCalls: 0,
        maximumPlanningLead: 1,
        plannedReadings: 4,
        uniquePropertyPages: 4,
        wholeIndexScans: 0,
      });
      expect(result.receipt.status).toBe('completed');
      expect(result.semantic).toMatchObject({
        fingerprint: fixture.manifest.expectedFingerprint,
        readingCount: 4,
        resultBytes: 4 * 64 * 1024,
      });
    } finally {
      await fixture.cleanup();
    }
  }, 120_000);
});
