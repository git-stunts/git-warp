import { describe, expect, it } from 'vitest';

import {
  evaluateMigratedReadPerformance,
} from '../../../scripts/v18-to-v19/performance/GateMigratedReadPerformance.ts';
import type {
  MigratedReadPerformancePolicy,
  MigratedReadRuntime,
  MigratedReadSample,
} from '../../../scripts/v18-to-v19/performance/MigratedReadPerformanceModel.ts';
import {
  MigratedReadPerformanceReportSchema,
} from '../../../scripts/v18-to-v19/performance/MigratedReadPerformanceModel.ts';
import {
  summarizeMigratedReadRuntime,
} from '../../../scripts/v18-to-v19/performance/MigratedReadPerformanceStatistics.ts';

const POLICY: MigratedReadPerformancePolicy = {
  cpuNoiseFloorMs: 100,
  maximumCpuRatio: 1.15,
  maximumHeapRatio: 1.25,
  maximumRssRatio: 1.25,
  minimumGitCommandImprovementRatio: 0.2,
  minimumWallImprovementMs: 100,
  minimumWallImprovementRatio: 0.2,
  schemaVersion: 1,
};

describe('migrated v18-to-v19 retained-read performance', () => {
  it('passes a material wall-time and Git-command improvement', () => {
    const samples = comparisonSamples({
      v18Commands: 40,
      v18WallMs: 800,
      v19Commands: 25,
      v19WallMs: 550,
    });
    expect(evaluateMigratedReadPerformance(
      summarizeMigratedReadRuntime('v18', samples),
      summarizeMigratedReadRuntime('v19', samples),
      POLICY,
    )).toEqual([]);
  });

  it('rejects a v19-to-v19-style no-regression result', () => {
    const samples = comparisonSamples({
      v18Commands: 40,
      v18WallMs: 800,
      v19Commands: 39,
      v19WallMs: 790,
    });
    expect(evaluateMigratedReadPerformance(
      summarizeMigratedReadRuntime('v18', samples),
      summarizeMigratedReadRuntime('v19', samples),
      POLICY,
    )).toEqual(expect.arrayContaining([
      expect.stringContaining('wall improvement'),
      expect.stringContaining('Git command improvement'),
    ]));
  });

  it('fails closed when retained storage evidence is absent', () => {
    const samples = comparisonSamples({
      v18Commands: 40,
      v18WallMs: 800,
      v19Commands: 25,
      v19WallMs: 550,
    }).map((sample) => sample.runtime === 'v19'
      ? { ...sample, supportStatus: 'checkpoint-tail' as const }
      : sample);
    expect(evaluateMigratedReadPerformance(
      summarizeMigratedReadRuntime('v18', samples),
      summarizeMigratedReadRuntime('v19', samples),
      POLICY,
    )).toContain('cold v19 retained evidence is incomplete');
  });

  it('rejects semantic result drift at the report boundary', () => {
    const samples = comparisonSamples({
      v18Commands: 40,
      v18WallMs: 800,
      v19Commands: 25,
      v19WallMs: 550,
    });
    const v18 = summarizeMigratedReadRuntime('v18', samples);
    const v19 = summarizeMigratedReadRuntime('v19', samples);
    const report = {
      environment: {
        architecture: 'x64',
        git: 'git version 2.50.0',
        node: 'v22.0.0',
        platform: 'linux',
        v18GitCas: '6.0.0',
        v18GitWarp: '18.2.1',
        v19Commit: 'a'.repeat(40),
        v19GitCas: '6.5.5',
        v19PackageVersion: '19.0.0',
      },
      executionOrder: [
        { measured: true, round: 0, runtime: 'v19' },
        { measured: true, round: 0, runtime: 'v18' },
      ],
      failures: [],
      fixture: {
        bundleBytes: 2 * 1024 * 1024,
        fixtureId: 'v18-retained-substrate-medium-001',
        graph: 'v18-medium-retained-substrate',
        patchCount: 18,
      },
      generatedAt: new Date().toISOString(),
      measuredRuns: 1,
      migration: { status: 'migrated', wallMs: 15_000 },
      policy: POLICY,
      result: 'PASS',
      runtimes: { v18, v19 },
      schemaVersion: 1,
      warmupRuns: 0,
    };
    const drifted = JSON.parse(JSON.stringify(report)) as {
      runtimes: {
        v19: {
          cold: {
            samples: Array<{ value: number }>;
          };
        };
      };
    };
    drifted.runtimes.v19.cold.samples[0] = {
      ...drifted.runtimes.v19.cold.samples[0],
      value: 14,
    };
    expect(() => MigratedReadPerformanceReportSchema.parse(drifted)).toThrow();
  });
});

function comparisonSamples(options: Readonly<{
  v18Commands: number;
  v18WallMs: number;
  v19Commands: number;
  v19WallMs: number;
}>): MigratedReadSample[] {
  return (['v18', 'v19'] as const).flatMap((runtime) =>
    (['cold', 'warm'] as const).map((scenario) => sample(
      runtime,
      scenario,
      runtime === 'v18' ? options.v18WallMs : options.v19WallMs,
      runtime === 'v18' ? options.v18Commands : options.v19Commands,
    ))
  );
}

function sample(
  runtime: MigratedReadRuntime,
  scenario: 'cold' | 'warm',
  wallMs: number,
  gitCommandCount: number,
): MigratedReadSample {
  return {
    basisId: runtime === 'v18' ? 'checkpoint-sha' : 'evidence:opaque',
    basisKind: runtime === 'v18' ? 'checkpoint-tail' : 'opaque-evidence',
    cpuSystemMs: 100,
    cpuTotalMs: 300,
    cpuUserMs: 200,
    gitCommandCount,
    gitCommandHistogram: { show: gitCommandCount },
    key: 'ordinal',
    maxRssBytes: 128 * 1024 * 1024,
    peakHeapUsedBytes: 32 * 1024 * 1024,
    receiptStatus: runtime === 'v18' ? null : 'completed',
    runtime,
    scenario,
    subject: 'medium:document:015',
    supportStatus: runtime === 'v18' ? 'checkpoint-tail' : 'supported',
    value: 15,
    wallMs,
    workerLifecycleWallMs: wallMs + 200,
  };
}
