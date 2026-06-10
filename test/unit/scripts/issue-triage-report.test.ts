import { describe, expect, it } from 'vitest';

import {
  buildIssueTriageReport,
  formatIssueTriageReport,
  type IssueInput,
  type PullRequestInput,
} from '../../../scripts/issue-triage-report.ts';

function issue(
  number: number,
  title: string,
  labels: readonly string[],
): IssueInput {
  return {
    number,
    title,
    url: `https://example.invalid/issues/${number}`,
    labels: labels.map((name) => ({ name })),
  };
}

function pr(
  number: number,
  closes: readonly IssueInput[],
  options: { readonly isDraft?: boolean } = {},
): PullRequestInput {
  return {
    number,
    title: `PR ${number}`,
    url: `https://example.invalid/pull/${number}`,
    isDraft: options.isDraft ?? false,
    closingIssuesReferences: closes.map((item) => ({
      number: item.number,
      title: item.title,
      url: item.url,
    })),
  };
}

describe('issue-triage-report', () => {
  it('subtracts PR-covered and active issues from available counts', () => {
    const coveredDebt = issue(10, 'covered debt', ['type:debt', 'priority:next']);
    const activeDebt = issue(11, 'active debt', ['type:debt', 'status:active']);
    const availableDebt = issue(12, 'available debt', ['type:debt', 'priority:next']);
    const feature = issue(13, 'feature', ['type:feature', 'priority:later']);

    const report = buildIssueTriageReport(
      [feature, availableDebt, activeDebt, coveredDebt],
      [pr(99, [coveredDebt])],
    );

    expect(report.rawOpenIssueCount).toBe(4);
    expect(report.prCoveredOpenIssueCount).toBe(1);
    expect(report.activeOpenIssueCount).toBe(1);
    expect(report.availableOpenIssueCount).toBe(2);
    expect(report.prCoveredIssueNumbers).toEqual([10]);
    expect(report.activeIssueNumbers).toEqual([11]);
    expect(report.availableIssueNumbers).toEqual([12, 13]);
    expect(report.debtCandidates.map((candidate) => candidate.number)).toEqual([12]);
  });

  it('emits deterministic label counts for raw and PR-adjusted issue sets', () => {
    const coveredDebt = issue(20, 'covered debt', ['type:debt', 'area:query']);
    const availableDebt = issue(21, 'available debt', ['type:debt', 'area:api']);
    const availableFeature = issue(22, 'available feature', ['type:feature', 'area:api']);

    const report = buildIssueTriageReport(
      [coveredDebt, availableFeature, availableDebt],
      [pr(100, [coveredDebt])],
    );

    expect(report.rawLabelCounts).toEqual([
      { label: 'area:api', count: 2 },
      { label: 'area:query', count: 1 },
      { label: 'type:debt', count: 2 },
      { label: 'type:feature', count: 1 },
    ]);
    expect(report.availableLabelCounts).toEqual([
      { label: 'area:api', count: 2 },
      { label: 'type:debt', count: 1 },
      { label: 'type:feature', count: 1 },
    ]);
  });

  it('formats a stable text report for humans and agents', () => {
    const coveredDebt = issue(30, 'covered debt', ['type:debt']);
    const availableDebt = issue(31, 'available debt', ['type:debt']);
    const report = buildIssueTriageReport(
      [coveredDebt, availableDebt],
      [pr(101, [coveredDebt], { isDraft: true })],
    );

    expect(formatIssueTriageReport(report)).toBe([
      'Issue triage report',
      '',
      'open.raw 2',
      'open.pr_covered 1',
      'open.active 0',
      'open.available 1',
      '',
      'PR-covered issues',
      '#30',
      '',
      'Available debt candidates',
      '#31 available debt',
      '',
      'Available label counts',
      'type:debt 1',
      '',
    ].join('\n'));
  });
});
