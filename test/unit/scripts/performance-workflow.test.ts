import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import z from 'zod';
import { PerformancePolicySchema }
  from '../../../scripts/performance/GatePerformance.ts';
import { PERFORMANCE_SCENARIOS }
  from '../../../scripts/performance/PerformanceModel.ts';
import { validatePerformanceExecutionOrder }
  from '../../../scripts/performance/PerformanceComparisonModel.ts';

const root = process.cwd();

/**
 * The calibration record, validated rather than asserted.
 *
 * These files are the evidence a threshold change is reviewed against, so a
 * malformed one should fail loudly here instead of silently satisfying a cast.
 */
const ObservedCountsSchema = z.object({
  gitCommandMedian: z.number().int().nonnegative(),
});

/**
 * Command counts per scenario.
 *
 * Keyed by the three scenario names rather than by string: the top-level
 * `observed` block also carries a `streaming` entry that has no command count,
 * and a permissive record would either reject it or let a missing scenario pass.
 */
const ScenarioCountsSchema = z.object({
  'cold-materialize': ObservedCountsSchema,
  'incremental-materialize': ObservedCountsSchema,
  'warm-materialize': ObservedCountsSchema,
});

const ScenarioCommandCeilingsSchema = z.object({
  'cold-materialize': z.number().int().positive(),
  'incremental-materialize': z.number().int().positive(),
  'warm-materialize': z.number().int().positive(),
});

const CalibrationSchema = z.object({
  corpus: z.object({
    baseNodeCount: z.number().int().positive(),
    basePatchCount: z.number().int().positive(),
    suffixNodeCount: z.number().int().positive(),
    suffixPatchCount: z.number().int().positive(),
  }),
  environment: z.object({
    gitCas: z.string(),
    node: z.string(),
    platform: z.string(),
    runner: z.string(),
  }),
  localCalibration: z.object({
    observed: ScenarioCountsSchema,
  }),
  observed: ScenarioCountsSchema,
  policyRationale: z.object({
    cpuRegressionRatio: z.number(),
    gitCommandRegressionRatio: z.number(),
    gitCommandMedian: ScenarioCommandCeilingsSchema,
    streamingMaxRssBytes: z.number(),
    streamingPeakHeapUsedBytes: z.number(),
  }),
  rejectedProfiles: z.array(z.object({
    baseNodeCount: z.number().int().positive(),
    reason: z.string().min(1),
  })),
});

function readBenchmarkJson(name: string): unknown {
  const text = readFileSync(resolve(root, `benchmarks/v19/${name}`), 'utf8');
  const parsed: unknown = JSON.parse(text);
  return parsed;
}

function readPolicy(): z.infer<typeof PerformancePolicySchema> {
  return PerformancePolicySchema.parse(readBenchmarkJson('policy.json'));
}

function readCalibration(): z.infer<typeof CalibrationSchema> {
  return CalibrationSchema.parse(readBenchmarkJson('calibration.json'));
}
const workflow = readFileSync(
  resolve(root, '.github/workflows/performance.yml'),
  'utf8',
);
const releaseWorkflow = readFileSync(
  resolve(root, '.github/workflows/release.yml'),
  'utf8',
);
const performanceRunner = readFileSync(
  resolve(root, 'scripts/performance/RunPerformance.ts'),
  'utf8',
);
const comparisonRunner = readFileSync(
  resolve(root, 'scripts/performance/RunPerformanceComparison.ts'),
  'utf8',
);

describe('v19 performance workflow', () => {
  it('runs exact base/head refs in one bounded pinned-toolchain job', () => {
    expect(workflow).toContain('name: Performance');
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('runs-on: ubuntu-24.04');
    expect(workflow).toContain('timeout-minutes: 45');
    expect(workflow).toContain('path: base');
    expect(workflow).toContain('path: head');
    expect(workflow).toContain(
      'actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd',
    );
    expect(workflow).toContain(
      'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
    );
    expect(workflow).not.toContain('continue-on-error');
  });

  it('requires complete counterbalanced execution evidence', () => {
    expect(() => validatePerformanceExecutionOrder([
      'base-materialization-a',
      'head-materialization-a',
      'head-materialization-b',
      'base-materialization-b',
      'head-streaming',
      'base-streaming',
    ])).not.toThrow();
    expect(() => validatePerformanceExecutionOrder([
      'base-materialization-a',
      'base-materialization-b',
      'head-materialization-a',
      'head-materialization-b',
      'head-streaming',
      'base-streaming',
    ])).toThrow('ABBA');
  });

  it('requires the checked-in comparison to exercise a checkpointed patch chain', () => {
    expect(performanceRunner).toContain('GIT_WARP_PERF_BASE_PATCHES');
    expect(performanceRunner).toContain('GIT_WARP_PERF_INCREMENTAL_PATCHES');
    expect(comparisonRunner).toContain('const CI_BASE_PATCHES = 65;');
    expect(comparisonRunner).toContain('const CI_INCREMENTAL_PATCHES = 5;');
    expect(comparisonRunner).toContain('GIT_WARP_PERF_BASE_PATCHES');
    expect(comparisonRunner).toContain('GIT_WARP_PERF_INCREMENTAL_PATCHES');
  });

  it('publishes summaries and raw commit-addressed evidence', () => {
    expect(workflow).toContain('RunPerformanceComparison.js');
    expect(workflow).toContain('--comparison performance-results/comparison.json');
    expect(workflow).toContain('|| gate_status=$?');
    expect(workflow).toContain('if [[ -f performance-results/summary.md ]]');
    expect(workflow).toContain('cat performance-results/summary.md >> "$GITHUB_STEP_SUMMARY"');
    expect(workflow).toContain(
      'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
    );
    expect(workflow).toContain('name: v19-performance-${{ github.sha }}');
    expect(workflow).toContain('retention-days: 90');
  });

  it('keeps calibration and threshold changes in ordinary source review', () => {
    const policy = readPolicy();
    const calibration = readCalibration();

    expect(policy.relative.cpuRegressionRatio).toBe(1.15);
    expect(policy.streaming).toEqual({
      maxRssBytes: 256 * 1024 * 1024,
      peakHeapUsedBytes: 96 * 1024 * 1024,
    });
    expect(calibration.corpus).toMatchObject({
      baseNodeCount: 65,
      basePatchCount: 65,
      suffixNodeCount: 5,
      suffixPatchCount: 5,
    });
    expect(calibration.environment).toMatchObject({
      gitCas: '6.5.7',
      node: 'v22.23.2',
      platform: 'linux',
      runner: 'github-hosted',
    });
    expect(calibration.policyRationale.cpuRegressionRatio).toBe(1.15);
    expect(calibration.policyRationale.gitCommandRegressionRatio)
      .toBe(policy.relative.gitCommandRegressionRatio);
    expect(calibration.policyRationale.gitCommandMedian)
      .toEqual(policy.absolute.gitCommandMedian);
    expect(calibration.policyRationale.streamingMaxRssBytes)
      .toBe(policy.streaming.maxRssBytes);
    expect(calibration.policyRationale.streamingPeakHeapUsedBytes)
      .toBe(policy.streaming.peakHeapUsedBytes);
    expect(calibration.rejectedProfiles).toHaveLength(1);
  });

  it('keeps every Git-command ceiling above both calibrated observations', () => {
    // The reference runner is primary: the gate runs there, so a ceiling below
    // the CI observation would pass a local-only check and then fail on merge.
    const policy = readPolicy();
    const calibration = readCalibration();

    // Iterating the canonical scenario list, not the policy's own keys, so a
    // scenario dropped from the policy fails here instead of silently passing.
    for (const scenario of PERFORMANCE_SCENARIOS) {
      const ceiling = policy.absolute.gitCommandMedian[scenario];
      expect(ceiling, `${scenario} ceiling clears the reference-runner count`)
        .toBeGreaterThan(calibration.observed[scenario].gitCommandMedian);
      expect(ceiling, `${scenario} ceiling clears the local count`)
        .toBeGreaterThan(calibration.localCalibration.observed[scenario].gitCommandMedian);
    }
  });

  it('requires current green main performance evidence for v19 releases', () => {
    expect(releaseWorkflow).toContain('actions: read');
    expect(releaseWorkflow).toContain('Verify current v19 performance evidence');
    expect(releaseWorkflow).toContain('actions/workflows/performance.yml/runs');
    expect(releaseWorkflow).toContain('-f head_sha="$HEAD_SHA"');
    expect(releaseWorkflow).toContain('-f event=push');
    expect(releaseWorkflow).toContain('-f status=success');
  });
});
