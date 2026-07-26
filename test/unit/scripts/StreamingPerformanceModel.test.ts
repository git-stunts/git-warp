import { describe, expect, it } from 'vitest';
import {
  StreamingFixtureManifestSchema,
  StreamingPerformanceResultSchema,
  validateStreamingPerformanceResult,
} from '../../../scripts/performance/StreamingPerformanceModel.ts';
import { deterministicPayload }
  from '../../../scripts/performance/PerformanceFixture.ts';
import { isHeapExhaustionFailure }
  from '../../../scripts/performance/StreamingPerformanceProcess.ts';
import {
  parseStreamingPerformanceReport,
  requireStreamingProofReport,
} from '../../../scripts/performance/StreamingPerformanceReport.ts';

const MEBIBYTE = 1024 * 1024;

describe('StreamingPerformanceModel', () => {
  it('keeps the deterministic corpus bytes stable with bounded allocation', () => {
    expect(deterministicPayload(0, 32, 0x19c0ffee))
      .toBe('000000000000:aenzxgfmspmgujsusno');
    expect(deterministicPayload(7, 32, 0x19c0ffee))
      .toBe('000000000007:dlqkmypdbrhognjltnw');
  });

  it('classifies only expected collecting-control heap failures', () => {
    expect(isHeapExhaustionFailure(
      'FATAL ERROR: Allocation failed - JavaScript heap out of memory (SIGABRT)',
    )).toBe(true);
    expect(isHeapExhaustionFailure('worker timed out after 600000 ms')).toBe(false);
  });

  it('accepts exact bounded streaming evidence', () => {
    expect(() => validateStreamingPerformanceResult(result(), manifest())).not.toThrow();
  });

  it.each([
    ['whole-state path', { evidence: { materializeCalls: 1 } }],
    ['planning lead', { evidence: { maximumPlanningLead: 2 } }],
    ['property pages', { evidence: { uniquePropertyPages: 3 } }],
    ['RSS envelope', { metrics: { maxRssBytes: 257 * MEBIBYTE } }],
  ])('rejects a violated %s contract', (_name, override) => {
    const candidate = result(override);
    expect(() => validateStreamingPerformanceResult(candidate, manifest())).toThrow();
  });

  it('requires proof-profile hostile OOM and bounded fixture generation', () => {
    const valid = report();
    expect(requireStreamingProofReport(valid)).toEqual(valid);
    expect(() => parseStreamingPerformanceReport({
      ...valid,
      hostileControl: 'not-run-mini-profile',
    })).toThrow('did not exhaust');
    expect(() => parseStreamingPerformanceReport({
      ...valid,
      generation: {
        ...valid.generation,
        peakHeapUsedBytes: 97 * MEBIBYTE,
      },
    })).toThrow('fixture-generation heap envelope');
  });
});

function report() {
  return {
    fixture: manifest(),
    generation: {
      maximumHeapUsedBytes: 96 * MEBIBYTE,
      maxRssBytes: 160 * MEBIBYTE,
      peakHeapUsedBytes: 60 * MEBIBYTE,
    },
    hostileControl: 'failed-with-memory-exhaustion',
    profile: 'proof',
    streaming: result(),
  } as const;
}

function manifest() {
  return StreamingFixtureManifestSchema.parse({
    batchNodeCount: 1,
    expectedFingerprint: 'a'.repeat(64),
    graphName: 'performance',
    logicalPropertyBytes: 128 * MEBIBYTE,
    minimumLogicalToOldSpaceRatio: 4,
    minimumPropertyPages: 4,
    nodeCount: 4,
    persistenceMode: 'streaming-descriptor-checkpoint-v1',
    propertyBytesPerNode: 32 * MEBIBYTE,
    seed: 1,
    writerId: 'benchmark-writer',
  });
}

function result(
  override: Readonly<{
    evidence?: Readonly<{
      materializeCalls?: number;
      maximumPlanningLead?: number;
      uniquePropertyPages?: number;
    }>;
    metrics?: Readonly<{ maxRssBytes?: number }>;
  }> = {},
) {
  return StreamingPerformanceResultSchema.parse({
    config: {
      consumerDelayMs: 2,
      expectedReadingCount: 4,
      logicalPropertyBytes: 128 * MEBIBYTE,
      logicalToOldSpaceRatio: 4,
      maxOldSpaceBytes: 32 * MEBIBYTE,
      maximumRssBytes: 256 * MEBIBYTE,
      minimumPropertyPages: 4,
      observedHeapLimitBytes: 80 * MEBIBYTE,
    },
    evidence: {
      decodedReadings: 4,
      materializeCalls: override.evidence?.materializeCalls ?? 0,
      maximumPlanningLead: override.evidence?.maximumPlanningLead ?? 1,
      plannedReadings: 4,
      uniquePropertyPages: override.evidence?.uniquePropertyPages ?? 4,
      wholeIndexScans: 0,
    },
    metrics: {
      maxRssBytes: override.metrics?.maxRssBytes ?? 200 * MEBIBYTE,
      peakHeapUsedBytes: 40 * MEBIBYTE,
      throughputPerSecond: 10,
      timeToFirstReadingMs: 5,
      wallMs: 400,
    },
    receipt: {
      basisId: 'basis',
      status: 'completed',
      tickId: 'tick',
    },
    schemaVersion: 1,
    semantic: {
      fingerprint: 'a'.repeat(64),
      readingCount: 4,
      resultBytes: 128 * MEBIBYTE,
    },
  });
}
