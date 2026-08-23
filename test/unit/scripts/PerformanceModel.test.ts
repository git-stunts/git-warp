import { describe, expect, it } from 'vitest';
import {
  evaluatePerformanceGate,
  type PerformancePolicy,
} from '../../../scripts/performance/GatePerformance.ts';
import {
  parsePerformanceResult,
  type CorpusProfile,
  type Distribution,
  type PerformanceResult,
  type PerformanceSample,
  type PerformanceScenarioName,
  type ScenarioResult,
} from '../../../scripts/performance/PerformanceModel.ts';
import { mergePerformanceResults }
  from '../../../scripts/performance/PerformanceResultMerge.ts';
import type { StreamingPerformanceReport }
  from '../../../scripts/performance/StreamingPerformanceReport.ts';

describe('v19 performance result contract', () => {
  it('accepts a complete result with stable cold/warm semantics and reuse evidence', () => {
    expect(parsePerformanceResult(validResult())).toEqual(validResult());
  });

  it('rejects missing, malformed, and semantically incomplete records', () => {
    const valid = validResult();
    const missingScenario = {
      ...valid,
      scenarios: {
        'cold-materialize': valid.scenarios['cold-materialize'],
        'warm-materialize': valid.scenarios['warm-materialize'],
      },
    };
    const malformedMetric = replaceSample(valid, 'cold-materialize', {
      ...valid.scenarios['cold-materialize'].samples[0],
      cpuTotalMs: -1,
    });
    const incompleteCardinality = replaceSample(valid, 'cold-materialize', {
      ...valid.scenarios['cold-materialize'].samples[0],
      observation: {
        ...valid.scenarios['cold-materialize'].samples[0]?.observation,
        semantic: {
          ...valid.scenarios['cold-materialize'].samples[0]?.observation.semantic,
          nodeCount: 1,
        },
      },
    });
    const falseWarmHit = replaceSample(valid, 'warm-materialize', {
      ...valid.scenarios['warm-materialize'].samples[0],
      observation: {
        ...valid.scenarios['warm-materialize'].samples[0]?.observation,
        materialization: {
          ...valid.scenarios['warm-materialize'].samples[0]?.observation.materialization,
          exactHits: 0,
        },
      },
    });
    const forgedSummary = replaceDistribution(
      valid,
      'warm-materialize',
      'cpuTotalMs',
      distribution(999),
    );
    const mismatchedGitCount = replaceSample(valid, 'cold-materialize', {
      ...valid.scenarios['cold-materialize'].samples[0],
      gitCommandHistogram: { 'cat-file:blob': 9 },
    });
    const unretainedColdResult = replaceSample(valid, 'cold-materialize', {
      ...valid.scenarios['cold-materialize'].samples[0],
      observation: {
        ...valid.scenarios['cold-materialize'].samples[0]?.observation,
        materialization: {
          ...valid.scenarios['cold-materialize'].samples[0]?.observation.materialization,
          retainRequests: 0,
        },
      },
    });

    expect(() => parsePerformanceResult(missingScenario)).toThrow();
    expect(() => parsePerformanceResult(malformedMetric)).toThrow();
    expect(() => parsePerformanceResult(incompleteCardinality))
      .toThrow('did not complete semantically');
    expect(() => parsePerformanceResult(falseWarmHit))
      .toThrow('did not prove an exact git-cas hit');
    expect(() => parsePerformanceResult(forgedSummary))
      .toThrow('distributions do not match raw samples');
    expect(() => parsePerformanceResult(mismatchedGitCount))
      .toThrow('Git-command evidence is inconsistent');
    expect(() => parsePerformanceResult(unretainedColdResult))
      .toThrow('did not prove a cold replay');
  });

  it('fails a synthetic CPU regression while keeping wall time diagnostic', () => {
    const base = validResult();
    const cpuRegression = replaceDistribution(
      base,
      'warm-materialize',
      'cpuTotalMs',
      distribution(250),
    );
    const wallOnlyRegression = replaceDistribution(
      base,
      'warm-materialize',
      'wallMs',
      distribution(1_000_000),
    );

    expect(evaluatePerformanceGate(cpuRegression, base, policy()).failures)
      .toEqual([
        'warm-materialize median CPU regression: 250.0 ms exceeds 165.0 ms',
      ]);
    expect(evaluatePerformanceGate(wallOnlyRegression, base, policy()).failures)
      .toEqual([]);
  });

  it('fails synthetic RSS and heap regressions deterministically', () => {
    const base = validResult();
    const rssRegression = replaceDistribution(
      base,
      'cold-materialize',
      'maxRssBytes',
      distribution(300 * 1024 * 1024),
    );
    const heapRegression = replaceDistribution(
      base,
      'warm-materialize',
      'peakHeapUsedBytes',
      distribution(200 * 1024 * 1024),
    );

    expect(evaluatePerformanceGate(rssRegression, null, policy()).failures)
      .toEqual([
        'cold-materialize maximum RSS: 300.0 MiB exceeds 256.0 MiB',
      ]);
    expect(evaluatePerformanceGate(heapRegression, null, policy()).failures)
      .toEqual([
        'warm-materialize peak heap: 200.0 MiB exceeds 128.0 MiB',
      ]);
  });

  it('fails synthetic streaming RSS and heap regressions deterministically', () => {
    const head = validResult();
    const rssRegression = streamingReport({
      maxRssBytes: 300 * 1024 * 1024,
      peakHeapUsedBytes: 40 * 1024 * 1024,
    });
    const heapRegression = streamingReport({
      maxRssBytes: 200 * 1024 * 1024,
      peakHeapUsedBytes: 110 * 1024 * 1024,
    });

    expect(evaluatePerformanceGate(
      head,
      null,
      policy(),
      rssRegression,
    ).failures).toEqual([
      'streaming maximum RSS: 300.0 MiB exceeds 256.0 MiB',
    ]);
    expect(evaluatePerformanceGate(
      head,
      null,
      policy(),
      heapRegression,
    ).failures).toEqual([
      'streaming peak heap: 110.0 MiB exceeds 96.0 MiB',
    ]);
  });

  it('fails a Git-command blowup the CPU envelope would absorb', () => {
    const blowup = replaceDistribution(
      validResult(),
      'cold-materialize',
      'gitCommandCount',
      distribution(3_505),
    );

    expect(evaluatePerformanceGate(blowup, null, policy()).failures).toEqual([
      'cold-materialize median Git commands: 3505 exceeds 12',
    ]);
  });

  it('fails Git-command creep that stays inside every absolute ceiling', () => {
    const base = validResult();
    const creep = replaceDistribution(
      base,
      'warm-materialize',
      'gitCommandCount',
      distribution(11),
    );

    expect(evaluatePerformanceGate(creep, base, policy()).failures).toEqual([
      'warm-materialize median Git command regression: 11 exceeds 10',
    ]);
  });

  it('accepts an unchanged Git-command count', () => {
    const base = validResult();

    expect(evaluatePerformanceGate(validResult(), base, policy()).failures)
      .toEqual([]);
  });

  it('describes comparison mode as both CPU and Git-command gated', () => {
    const base = validResult();

    expect(evaluatePerformanceGate(validResult(), base, policy()).summary)
      .toContain(
        'Comparison mode: same-runner base/head CPU and Git-command gates '
          + 'plus absolute policy.',
      );
  });

  it('allows the git-cas versions under test to differ', () => {
    const base = validResult();
    const head: PerformanceResult = {
      ...base,
      environment: {
        ...base.environment,
        gitCas: '999.0.0',
      },
    };

    expect(evaluatePerformanceGate(head, base, policy()).failures).toEqual([]);
  });

  it('refuses to compare different machine environments', () => {
    const base = validResult();
    const head: PerformanceResult = {
      ...base,
      environment: {
        ...base.environment,
        platform: 'darwin',
      },
    };

    expect(() => evaluatePerformanceGate(head, base, policy()))
      .toThrow('environments are not comparable');
  });

  it('merges counterbalanced batches without discarding raw samples', () => {
    const first = validResult();
    const second = {
      ...validResult(),
      generatedAt: '2026-07-25T00:01:00.000Z',
    };
    const merged = mergePerformanceResults([first, second]);

    expect(merged.scenarios['cold-materialize'].measuredRuns).toBe(2);
    expect(merged.scenarios['cold-materialize'].warmupRuns).toBe(2);
    expect(merged.scenarios['cold-materialize'].cpuTotalMs.samples)
      .toEqual([100, 100]);
    expect(() => mergePerformanceResults([
      first,
      { ...second, commit: 'different' },
    ])).toThrow('different commits');
  });
});

function validResult(): PerformanceResult {
  return {
    commit: '0123456789abcdef',
    environment: {
      architecture: 'x64',
      cpuCount: 4,
      cpuModel: 'fixture cpu',
      git: 'git version 2.50.0',
      gitCas: '6.5.3',
      node: 'v22.17.0',
      platform: 'linux',
      runner: 'test',
    },
    generatedAt: '2026-07-25T00:00:00.000Z',
    instrumentation: {
      corpusSetup: 'excluded',
      cpuScope: 'process-and-descendants',
      gitCommands: 'timed-operation-plumbing-calls',
      memoryScope: 'worker-lifecycle',
      wallClock: 'materialize-operation',
    },
    scenarios: {
      'cold-materialize': scenarioResult('cold-materialize'),
      'incremental-materialize': scenarioResult('incremental-materialize'),
      'warm-materialize': scenarioResult('warm-materialize'),
    },
    schemaVersion: 1,
  };
}

function scenarioResult(scenario: PerformanceScenarioName): ScenarioResult {
  const measured = sample(scenario);
  return {
    corpus: corpus(scenario),
    cpuSystemMs: distribution(measured.cpuSystemMs),
    cpuTotalMs: distribution(measured.cpuTotalMs),
    cpuUserMs: distribution(measured.cpuUserMs),
    gitCommandCount: distribution(measured.gitCommandCount),
    maxRssBytes: distribution(measured.maxRssBytes),
    measuredRuns: 1,
    peakHeapUsedBytes: distribution(measured.peakHeapUsedBytes),
    samples: [measured],
    scenario,
    throughputPerSecond: distribution(measured.throughputPerSecond),
    wallMs: distribution(measured.wallMs),
    warmupRuns: 1,
  };
}

function sample(scenario: PerformanceScenarioName): PerformanceSample {
  const incremental = scenario === 'incremental-materialize';
  const warm = scenario === 'warm-materialize';
  return {
    cpuSystemMs: 25,
    cpuTotalMs: 100,
    cpuUserMs: 75,
    gitCommandCount: 10,
    gitCommandHistogram: { 'cat-file:blob': 10 },
    maxRssBytes: 128 * 1024 * 1024,
    observation: {
      materialization: {
        exactHits: warm ? 1 : 0,
        exactLookups: 1,
        predecessorHits: incremental ? 1 : 0,
        predecessorLookups: incremental ? 1 : 0,
        replayedPatches: warm ? 0 : 1,
        retainRequests: warm ? 0 : 1,
      },
      semantic: {
        edgeCount: incremental ? 4 : 3,
        fingerprint: (incremental ? 'b' : 'a').repeat(64),
        nodeCount: incremental ? 5 : 4,
        propertyCount: incremental ? 5 : 4,
        targetPropertyBytes: 64,
      },
    },
    peakHeapUsedBytes: 64 * 1024 * 1024,
    throughputPerSecond: 10,
    wallMs: 200,
    workerLifecycleWallMs: 250,
  };
}

function corpus(scenario: PerformanceScenarioName): CorpusProfile {
  const suffixNodeCount = scenario === 'incremental-materialize' ? 1 : 0;
  const nodeCount = 4 + suffixNodeCount;
  return {
    baseNodeCount: 4,
    edgeCount: nodeCount - 1,
    format: 'git-warp.performance.corpus/v1',
    logicalPropertyBytes: nodeCount * 64,
    nodeCount,
    propertyBytesPerNode: 64,
    propertyCount: nodeCount,
    seed: 0x19c0ffee,
    suffixNodeCount,
    topology: 'directed-chain',
    version: 1,
  };
}

function distribution(value: number): Distribution {
  return {
    mad: 0,
    maximum: value,
    median: value,
    minimum: value,
    samples: [value],
  };
}

function replaceSample(
  result: PerformanceResult,
  scenario: PerformanceScenarioName,
  sampleValue: unknown,
): unknown {
  const current = result.scenarios[scenario];
  return {
    ...result,
    scenarios: {
      ...result.scenarios,
      [scenario]: {
        ...current,
        samples: [sampleValue],
      },
    },
  };
}

function replaceDistribution(
  result: PerformanceResult,
  scenario: PerformanceScenarioName,
  metric: 'cpuTotalMs'
    | 'gitCommandCount'
    | 'maxRssBytes'
    | 'peakHeapUsedBytes'
    | 'wallMs',
  value: Distribution,
): PerformanceResult {
  const current = result.scenarios[scenario];
  return {
    ...result,
    scenarios: {
      ...result.scenarios,
      [scenario]: {
        ...current,
        [metric]: value,
      },
    },
  };
}

function policy(): PerformancePolicy {
  return {
    absolute: {
      cpuTotalMedianMs: {
        'cold-materialize': 1_000,
        'incremental-materialize': 1_000,
        'warm-materialize': 1_000,
      },
      gitCommandMedian: {
        'cold-materialize': 12,
        'incremental-materialize': 12,
        'warm-materialize': 12,
      },
      maxRssBytes: {
        'cold-materialize': 256 * 1024 * 1024,
        'incremental-materialize': 256 * 1024 * 1024,
        'warm-materialize': 256 * 1024 * 1024,
      },
      peakHeapUsedBytes: {
        'cold-materialize': 128 * 1024 * 1024,
        'incremental-materialize': 128 * 1024 * 1024,
        'warm-materialize': 128 * 1024 * 1024,
      },
    },
    relative: {
      cpuNoiseFloorMs: {
        'cold-materialize': 50,
        'incremental-materialize': 50,
        'warm-materialize': 50,
      },
      cpuRegressionRatio: 1.15,
      gitCommandRegressionRatio: 1.05,
    },
    schemaVersion: 2,
    streaming: {
      maxRssBytes: 256 * 1024 * 1024,
      peakHeapUsedBytes: 96 * 1024 * 1024,
    },
    wallTime: 'diagnostic',
  };
}

function streamingReport(metrics: Readonly<{
  maxRssBytes: number;
  peakHeapUsedBytes: number;
}>): StreamingPerformanceReport {
  return {
    fixture: {
      batchNodeCount: 1,
      expectedFingerprint: 'a'.repeat(64),
      graphName: 'performance',
      logicalPropertyBytes: 128 * 1024 * 1024,
      minimumLogicalToOldSpaceRatio: 4,
      minimumPropertyPages: 4,
      nodeCount: 4,
      persistenceMode: 'streaming-descriptor-checkpoint-v1',
      propertyBytesPerNode: 32 * 1024 * 1024,
      seed: 1,
      writerId: 'benchmark-writer',
    },
    generation: {
      maximumHeapUsedBytes: 96 * 1024 * 1024,
      maxRssBytes: 160 * 1024 * 1024,
      peakHeapUsedBytes: 60 * 1024 * 1024,
    },
    hostileControl: 'failed-with-memory-exhaustion',
    profile: 'proof',
    streaming: {
      config: {
        consumerDelayMs: 2,
        expectedReadingCount: 4,
        logicalPropertyBytes: 128 * 1024 * 1024,
        logicalToOldSpaceRatio: 4,
        maxOldSpaceBytes: 32 * 1024 * 1024,
        maximumRssBytes: 512 * 1024 * 1024,
        minimumPropertyPages: 4,
        observedHeapLimitBytes: 128 * 1024 * 1024,
      },
      evidence: {
        decodedReadings: 4,
        materializeCalls: 0,
        maximumPlanningLead: 1,
        plannedReadings: 4,
        uniquePropertyPages: 4,
        wholeIndexScans: 0,
      },
      metrics: {
        ...metrics,
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
        resultBytes: 128 * 1024 * 1024,
      },
    },
  };
}
