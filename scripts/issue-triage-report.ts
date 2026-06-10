#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

const GH_TIMEOUT_MS = 30_000;
const LABEL_STATUS_ACTIVE = 'status:active';
const LABEL_TYPE_DEBT = 'type:debt';
const LABEL_WORK_IN_PROGRESS = 'work-in-progress';
const ACTIVE_LABELS = new Set([LABEL_STATUS_ACTIVE, LABEL_WORK_IN_PROGRESS]);

function isBrokenPipe(error: Error): boolean {
  return Reflect.get(error, 'code') === 'EPIPE';
}

process.stdout.on('error', (error: Error) => {
  if (isBrokenPipe(error)) {
    process.exit(0);
  }
  throw error;
});

export type IssueLabelInput = {
  readonly name: string;
};

export type IssueInput = {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly labels: readonly IssueLabelInput[];
};

export type ClosingIssueInput = {
  readonly number: number;
  readonly title: string;
  readonly url: string;
};

export type PullRequestInput = {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly isDraft: boolean;
  readonly closingIssuesReferences: readonly ClosingIssueInput[];
};

export type IssueTriageReport = {
  readonly rawOpenIssueCount: number;
  readonly prCoveredOpenIssueCount: number;
  readonly activeOpenIssueCount: number;
  readonly availableOpenIssueCount: number;
  readonly prCoveredIssueNumbers: readonly number[];
  readonly activeIssueNumbers: readonly number[];
  readonly availableIssueNumbers: readonly number[];
  readonly rawLabelCounts: readonly LabelCount[];
  readonly availableLabelCounts: readonly LabelCount[];
  readonly prCoverage: readonly PullRequestCoverage[];
  readonly debtCandidates: readonly IssueSummary[];
};

export type LabelCount = {
  readonly label: string;
  readonly count: number;
};

export type IssueSummary = {
  readonly number: number;
  readonly title: string;
  readonly url: string;
};

export type PullRequestCoverage = {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly isDraft: boolean;
  readonly closes: readonly IssueSummary[];
};

type CliOptions = {
  readonly format: 'json' | 'text';
  readonly limit: string;
};

function issueSummary(issue: IssueInput | ClosingIssueInput): IssueSummary {
  return {
    number: issue.number,
    title: issue.title,
    url: issue.url,
  };
}

function issueLabels(issue: IssueInput): readonly string[] {
  return issue.labels.map((label) => label.name).sort(compareStrings);
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function compareIssues(left: IssueSummary, right: IssueSummary): number {
  return compareNumbers(left.number, right.number);
}

function labelCounts(issues: readonly IssueInput[]): readonly LabelCount[] {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    for (const label of issueLabels(issue)) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => compareStrings(left.label, right.label));
}

function hasAnyLabel(issue: IssueInput, labels: ReadonlySet<string>): boolean {
  return issueLabels(issue).some((label) => labels.has(label));
}

function hasLabel(issue: IssueInput, label: string): boolean {
  return issueLabels(issue).includes(label);
}

function issueNumberSet(issues: readonly IssueInput[]): ReadonlySet<number> {
  return new Set(issues.map((issue) => issue.number));
}

function coveredOpenIssueNumbers(
  openIssues: readonly IssueInput[],
  pullRequests: readonly PullRequestInput[],
): ReadonlySet<number> {
  const openNumbers = issueNumberSet(openIssues);
  const covered = new Set<number>();
  for (const pr of pullRequests) {
    for (const issue of pr.closingIssuesReferences) {
      if (openNumbers.has(issue.number)) {
        covered.add(issue.number);
      }
    }
  }
  return covered;
}

function sortedIssueNumbers(issues: readonly IssueInput[]): readonly number[] {
  return issues.map((issue) => issue.number).sort(compareNumbers);
}

function prCoverage(
  openIssues: readonly IssueInput[],
  pullRequests: readonly PullRequestInput[],
): readonly PullRequestCoverage[] {
  const openNumbers = issueNumberSet(openIssues);
  return pullRequests
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      url: pr.url,
      isDraft: pr.isDraft,
      closes: pr.closingIssuesReferences
        .filter((issue) => openNumbers.has(issue.number))
        .map(issueSummary)
        .sort(compareIssues),
    }))
    .filter((pr) => pr.closes.length > 0)
    .sort((left, right) => compareNumbers(left.number, right.number));
}

export function buildIssueTriageReport(
  openIssues: readonly IssueInput[],
  pullRequests: readonly PullRequestInput[],
): IssueTriageReport {
  const coveredNumbers = coveredOpenIssueNumbers(openIssues, pullRequests);
  const activeIssues = openIssues.filter((issue) => hasAnyLabel(issue, ACTIVE_LABELS));
  const availableIssues = openIssues.filter((issue) => !coveredNumbers.has(issue.number) && !hasAnyLabel(issue, ACTIVE_LABELS));
  const debtCandidates = availableIssues
    .filter((issue) => hasLabel(issue, LABEL_TYPE_DEBT))
    .map(issueSummary)
    .sort(compareIssues);

  return {
    rawOpenIssueCount: openIssues.length,
    prCoveredOpenIssueCount: coveredNumbers.size,
    activeOpenIssueCount: activeIssues.length,
    availableOpenIssueCount: availableIssues.length,
    prCoveredIssueNumbers: [...coveredNumbers].sort(compareNumbers),
    activeIssueNumbers: sortedIssueNumbers(activeIssues),
    availableIssueNumbers: sortedIssueNumbers(availableIssues),
    rawLabelCounts: labelCounts(openIssues),
    availableLabelCounts: labelCounts(availableIssues),
    prCoverage: prCoverage(openIssues, pullRequests),
    debtCandidates,
  };
}

export function formatIssueTriageReport(report: IssueTriageReport): string {
  const lines = [
    'Issue triage report',
    '',
    `open.raw ${report.rawOpenIssueCount}`,
    `open.pr_covered ${report.prCoveredOpenIssueCount}`,
    `open.active ${report.activeOpenIssueCount}`,
    `open.available ${report.availableOpenIssueCount}`,
    '',
    'PR-covered issues',
    ...formatIssueNumbers(report.prCoveredIssueNumbers),
    '',
    'Available debt candidates',
    ...report.debtCandidates.map((issue) => `#${issue.number} ${issue.title}`),
    '',
    'Available label counts',
    ...report.availableLabelCounts.map((entry) => `${entry.label} ${entry.count}`),
  ];
  return `${lines.join('\n')}\n`;
}

function formatIssueNumbers(numbers: readonly number[]): readonly string[] {
  if (numbers.length === 0) {
    return ['none'];
  }
  return numbers.map((number) => `#${number}`);
}

function parseArgs(args: readonly string[]): CliOptions {
  let format: CliOptions['format'] = 'text';
  let limit = '1000';
  for (const arg of args) {
    if (arg === '--json') {
      format = 'json';
      continue;
    }
    if (arg === '--text') {
      format = 'text';
      continue;
    }
    if (arg.startsWith('--limit=')) {
      limit = arg.slice('--limit='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { format, limit };
}

async function ghJson<T>(args: readonly string[]): Promise<T> {
  try {
    const { stdout } = await execFile('gh', args, { encoding: 'utf8', timeout: GH_TIMEOUT_MS });
    return JSON.parse(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`ghJson failed for gh ${args.join(' ')}: ${message}`);
  }
}

async function main(args: readonly string[]): Promise<void> {
  const options = parseArgs(args);
  const issues = await ghJson<readonly IssueInput[]>([
    'issue',
    'list',
    '--state',
    'open',
    '--limit',
    options.limit,
    '--json',
    'number,title,url,labels',
  ]);
  const pullRequests = await ghJson<readonly PullRequestInput[]>([
    'pr',
    'list',
    '--state',
    'open',
    '--limit',
    '100',
    '--json',
    'number,title,url,isDraft,closingIssuesReferences',
  ]);
  const report = buildIssueTriageReport(issues, pullRequests);
  const output = options.format === 'json'
    ? `${JSON.stringify(report, null, 2)}\n`
    : formatIssueTriageReport(report);
  process.stdout.write(output);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error: Error) => {
    console.error(`issue-triage-report: ${error.message}`);
    process.exit(1);
  });
}
