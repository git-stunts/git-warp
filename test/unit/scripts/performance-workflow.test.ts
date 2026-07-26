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
    expect(workflow).toContain('cat performance-results/summary.md >> "$GITHUB_STEP_SUMMARY"');
    expect(workflow).toContain(
      'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
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
      policyRationale?: { cpuRegressionRatio?: number };
      rejectedProfiles?: readonly unknown[];
    };

    expect(policy.relative.cpuRegressionRatio).toBe(1.15);
    expect(calibration.corpus).toMatchObject({
      baseNodeCount: 25,
      suffixNodeCount: 5,
    });
    expect(calibration.policyRationale?.cpuRegressionRatio).toBe(1.15);
    expect(calibration.rejectedProfiles).toHaveLength(1);
  });

  it('requires current green main performance evidence for v19 releases', () => {
    expect(releaseWorkflow).toContain('actions: read');
    expect(releaseWorkflow).toContain('Verify current v19 performance evidence');
    expect(releaseWorkflow).toContain('actions/workflows/performance.yml/runs');
    expect(releaseWorkflow).toContain('-f head_sha="$HEAD_SHA"');
    expect(releaseWorkflow).toContain('-f status=success');
  });
});
