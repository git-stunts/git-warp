import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PerformancePolicySchema }
  from '../../../scripts/performance/GatePerformance.ts';
import { validatePerformanceExecutionOrder }
  from '../../../scripts/performance/PerformanceComparisonModel.ts';

const root = process.cwd();
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
    const policy = PerformancePolicySchema.parse(JSON.parse(readFileSync(
      resolve(root, 'benchmarks/v19/policy.json'),
      'utf8',
    )) as unknown);
    const calibration = JSON.parse(readFileSync(
      resolve(root, 'benchmarks/v19/calibration.json'),
      'utf8',
    )) as {
      corpus?: { baseNodeCount?: number; suffixNodeCount?: number };
      environment?: { node?: string; platform?: string; runner?: string };
      localCalibration?: {
        observed?: Readonly<Record<string, { gitCommandMedian?: number }>>;
      };
      policyRationale?: {
        cpuRegressionRatio?: number;
        gitCommandRegressionRatio?: number;
        streamingMaxRssBytes?: number;
        streamingPeakHeapUsedBytes?: number;
      };
      rejectedProfiles?: readonly unknown[];
    };

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
    expect(calibration.policyRationale?.cpuRegressionRatio).toBe(1.15);
    expect(calibration.policyRationale?.gitCommandRegressionRatio)
      .toBe(policy.relative.gitCommandRegressionRatio);
    expect(calibration.policyRationale?.streamingMaxRssBytes)
      .toBe(policy.streaming.maxRssBytes);
    expect(calibration.policyRationale?.streamingPeakHeapUsedBytes)
      .toBe(policy.streaming.peakHeapUsedBytes);
    expect(calibration.rejectedProfiles).toHaveLength(1);
  });

  it('keeps every absolute Git-command ceiling above its calibrated observation', () => {
    const policy = PerformancePolicySchema.parse(JSON.parse(readFileSync(
      resolve(root, 'benchmarks/v19/policy.json'),
      'utf8',
    )) as unknown);
    const calibration = JSON.parse(readFileSync(
      resolve(root, 'benchmarks/v19/calibration.json'),
      'utf8',
    )) as {
      localCalibration?: {
        observed?: Readonly<Record<string, { gitCommandMedian?: number }>>;
      };
    };
    const observed = calibration.localCalibration?.observed;

    expect(observed).toBeDefined();
    for (const [scenario, ceiling] of Object.entries(policy.absolute.gitCommandMedian)) {
      const measured = observed?.[scenario]?.gitCommandMedian;
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
