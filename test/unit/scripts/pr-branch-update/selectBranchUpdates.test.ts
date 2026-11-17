import { describe, expect, it } from 'vitest';

import type { BranchUpdateDecision } from '../../../../scripts/pr-branch-update/BranchUpdateDecision.ts';
import Mergeability from '../../../../scripts/pr-branch-update/Mergeability.ts';
import PullRequestSnapshot, {
  type PullRequestSnapshotFields,
} from '../../../../scripts/pr-branch-update/PullRequestSnapshot.ts';
import ReportConflict from '../../../../scripts/pr-branch-update/ReportConflict.ts';
import selectBranchUpdates from '../../../../scripts/pr-branch-update/selectBranchUpdates.ts';
import SkipPullRequest from '../../../../scripts/pr-branch-update/SkipPullRequest.ts';
import SkipReason from '../../../../scripts/pr-branch-update/SkipReason.ts';
import UpdateBranch from '../../../../scripts/pr-branch-update/UpdateBranch.ts';

// Oracle for every expectation in this file: issue #1131 sections 2b and 2d.
// Update only open, non-draft, same-repository PRs that are behind the base
// and merge cleanly; skip drafts and forks; comment on conflicts.

const HEAD_OID = 'a'.repeat(40);

function pullRequest(overrides: Partial<PullRequestSnapshotFields> = {}): PullRequestSnapshot {
  return new PullRequestSnapshot({
    number: 100,
    baseRefName: 'main',
    headRefName: 'feat/example',
    headOid: HEAD_OID,
    isDraft: false,
    isFork: false,
    mergeability: Mergeability.MERGEABLE,
    behindBy: 3,
    ...overrides,
  });
}

/** One readable line per decision, so a failure shows the whole plan. */
function describeDecision(decision: BranchUpdateDecision): string {
  const number = decision.pullRequest.number;
  if (decision instanceof UpdateBranch) {
    return `#${number} update`;
  }
  if (decision instanceof ReportConflict) {
    return `#${number} report conflict`;
  }
  return `#${number} skip: ${decision.reason.label}`;
}

function plan(pullRequests: readonly PullRequestSnapshot[]): readonly string[] {
  return selectBranchUpdates(pullRequests).map(describeDecision);
}

describe('selectBranchUpdates', () => {
  it('updates a ready PR that is behind the base and merges cleanly', () => {
    expect(plan([pullRequest({ number: 1 })])).toEqual(['#1 update']);
  });

  it('skips a PR whose head already contains the base', () => {
    expect(plan([pullRequest({ number: 2, behindBy: 0 })])).toEqual([
      `#2 skip: ${SkipReason.UP_TO_DATE.label}`,
    ]);
  });

  it('skips a draft that is behind and merges cleanly', () => {
    expect(plan([pullRequest({ number: 3, isDraft: true })])).toEqual([
      `#3 skip: ${SkipReason.DRAFT.label}`,
    ]);
  });

  it('reports a conflict for a ready PR that is behind and conflicts', () => {
    expect(plan([pullRequest({ number: 4, mergeability: Mergeability.CONFLICTING })])).toEqual([
      '#4 report conflict',
    ]);
  });

  it('skips a fork PR that is behind and merges cleanly', () => {
    expect(plan([pullRequest({ number: 5, isFork: true })])).toEqual([
      `#5 skip: ${SkipReason.FORK.label}`,
    ]);
  });

  it('skips a PR whose mergeability GitHub has not computed yet', () => {
    expect(plan([pullRequest({ number: 6, mergeability: Mergeability.UNKNOWN })])).toEqual([
      `#6 skip: ${SkipReason.UNKNOWN_MERGEABILITY.label}`,
    ]);
  });

  it('skips a conflicting draft without reporting the conflict', () => {
    expect(plan([pullRequest({ number: 7, isDraft: true, mergeability: Mergeability.CONFLICTING })])).toEqual([
      `#7 skip: ${SkipReason.DRAFT.label}`,
    ]);
  });

  it('skips a conflicting fork PR without reporting the conflict', () => {
    expect(plan([pullRequest({ number: 8, isFork: true, mergeability: Mergeability.CONFLICTING })])).toEqual([
      `#8 skip: ${SkipReason.FORK.label}`,
    ]);
  });

  it('skips an up-to-date PR even when its mergeability is not computed yet', () => {
    expect(plan([pullRequest({ number: 9, behindBy: 0, mergeability: Mergeability.UNKNOWN })])).toEqual([
      `#9 skip: ${SkipReason.UP_TO_DATE.label}`,
    ]);
  });

  it('orders the plan by PR number so that the oldest PR is updated first', () => {
    expect(plan([pullRequest({ number: 12 }), pullRequest({ number: 3 }), pullRequest({ number: 7 })])).toEqual([
      '#3 update',
      '#7 update',
      '#12 update',
    ]);
  });

  it('decides every PR of a mixed open-PR fixture list', () => {
    const fixture = [
      pullRequest({ number: 1202, behindBy: 4 }),
      pullRequest({ number: 1206, isDraft: true, behindBy: 9 }),
      pullRequest({ number: 1116, mergeability: Mergeability.CONFLICTING, behindBy: 30 }),
      pullRequest({ number: 1082, behindBy: 0 }),
      pullRequest({ number: 1300, isFork: true, behindBy: 2 }),
      pullRequest({ number: 1301, mergeability: Mergeability.UNKNOWN, behindBy: 1 }),
    ];

    expect(plan(fixture)).toEqual([
      `#1082 skip: ${SkipReason.UP_TO_DATE.label}`,
      '#1116 report conflict',
      '#1202 update',
      `#1206 skip: ${SkipReason.DRAFT.label}`,
      `#1300 skip: ${SkipReason.FORK.label}`,
      `#1301 skip: ${SkipReason.UNKNOWN_MERGEABILITY.label}`,
    ]);
  });

  it('returns an empty plan when no PR is open', () => {
    expect(plan([])).toEqual([]);
  });
});

describe('PullRequestSnapshot', () => {
  it('refuses a head object id that is not 40 hex characters', () => {
    expect(() => pullRequest({ headOid: 'abc123' })).toThrow(/headOid must be a 40-character hex object id/u);
  });

  it('refuses a negative behind count', () => {
    expect(() => pullRequest({ behindBy: -1 })).toThrow(/behindBy must be an integer of at least 0/u);
  });

  it('refuses a PR number below 1', () => {
    expect(() => pullRequest({ number: 0 })).toThrow(/number must be an integer of at least 1/u);
  });

  it('refuses an empty head branch name', () => {
    expect(() => pullRequest({ headRefName: '' })).toThrow(/headRefName must not be empty/u);
  });

  it('is frozen after construction', () => {
    expect(Object.isFrozen(pullRequest())).toBe(true);
  });
});

describe('SkipPullRequest', () => {
  it('keeps the reason it was given', () => {
    expect(new SkipPullRequest(pullRequest(), SkipReason.FORK).reason).toBe(SkipReason.FORK);
  });
});
