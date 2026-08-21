import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import z from 'zod';
import { PerformancePolicySchema }
  from '../../../scripts/performance/GatePerformance.ts';
import { validatePerformanceExecutionOrder }
  from '../../../scripts/performance/PerformanceComparisonModel.ts';

const root = process.cwd();

/**
 * The calibration record, validated rather than asserted.
 *
 * These files are the evidence a threshold change is reviewed against, so a
 * malformed one should fail loudly here instead of silently satisfying a cast.
 */
const CalibrationSchema = z.object({
  corpus: z.object({
    baseNodeCount: z.number(),
    suffixNodeCount: z.number(),
  }),
  environment: z.object({
    node: z.string(),
    platform: z.string(),
    runner: z.string(),
  }),
  localCalibration: z.object({
    observed: z.record(z.string(), z.object({
      gitCommandMedian: z.number().int().nonnegative(),
    })),
  }),
  policyRationale: z.object({
    cpuRegressionRatio: z.number(),
    gitCommandRegressionRatio: z.number(),
    streamingMaxRssBytes: z.number(),
    streamingPeakHeapUsedBytes: z.number(),
  }),
  rejectedProfiles: z.array(z.unknown()),
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
      baseNodeCount: 25,
      suffixNodeCount: 5,
    });
    expect(calibration.environment).toMatchObject({
      node: 'v22.23.1',
      platform: 'linux',
      runner: 'github-hosted ubuntu-24.04',
    });
    expect(calibration.policyRationale.cpuRegressionRatio).toBe(1.15);
    expect(calibration.policyRationale.gitCommandRegressionRatio)
      .toBe(policy.relative.gitCommandRegressionRatio);
    expect(calibration.policyRationale.streamingMaxRssBytes)
      .toBe(policy.streaming.maxRssBytes);
    expect(calibration.policyRationale.streamingPeakHeapUsedBytes)
      .toBe(policy.streaming.peakHeapUsedBytes);
    expect(calibration.rejectedProfiles).toHaveLength(1);
  });

  it('keeps every absolute Git-command ceiling above its calibrated observation', () => {
    const policy = readPolicy();
    const observed = readCalibration().localCalibration.observed;

    for (const [scenario, ceiling] of Object.entries(policy.absolute.gitCommandMedian)) {
      const measured = observed[scenario]?.gitCommandMedian;
      expect(measured, `${scenario} has a calibrated Git-command count`)
        .toBeTypeOf('number');
      expect(ceiling, `${scenario} ceiling exceeds its calibrated count`)
        .toBeGreaterThan(measured ?? Number.POSITIVE_INFINITY);
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
