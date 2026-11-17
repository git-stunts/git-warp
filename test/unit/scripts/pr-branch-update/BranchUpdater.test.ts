import { describe, expect, it } from 'vitest';

import BranchUpdater from '../../../../scripts/pr-branch-update/BranchUpdater.ts';
import type { BranchUpdateResult } from '../../../../scripts/pr-branch-update/BranchUpdateResult.ts';
import ConflictNotice from '../../../../scripts/pr-branch-update/ConflictNotice.ts';
import Mergeability from '../../../../scripts/pr-branch-update/Mergeability.ts';
import { HEAD_POLL, MERGEABILITY_POLL } from '../../../../scripts/pr-branch-update/PollSchedule.ts';
import PullRequestSnapshot, {
  type PullRequestSnapshotFields,
} from '../../../../scripts/pr-branch-update/PullRequestSnapshot.ts';
import SkipPullRequest from '../../../../scripts/pr-branch-update/SkipPullRequest.ts';
import SkipReason from '../../../../scripts/pr-branch-update/SkipReason.ts';
import UpdateBranch from '../../../../scripts/pr-branch-update/UpdateBranch.ts';
import InMemoryPullRequestHost, { mergedHeadOid } from './InMemoryPullRequestHost.ts';
import RecordingWait from './RecordingWait.ts';

// Oracle: issue #1131 sections 2b and 2d (merge, never rebase; skip drafts,
// forks and conflicts; comment once on a conflict; one update at a time),
// plus the GitHub Actions rule that GITHUB_TOKEN pushes create pull_request
// runs that wait for approval, so the updater dispatches the required-check
// workflows on each head that it updated.

const WORKFLOWS = ['ci.yml', 'links.yml'];

function pullRequest(overrides: Partial<PullRequestSnapshotFields> = {}): PullRequestSnapshot {
  const number = overrides.number ?? 100;
  return new PullRequestSnapshot({
    number,
    baseRefName: 'main',
    headRefName: `feat/pr-${number}`,
    headOid: 'a'.repeat(40),
    isDraft: false,
    isFork: false,
    mergeability: Mergeability.MERGEABLE,
    behindBy: 3,
    ...overrides,
  });
}

function updaterFor(host: InMemoryPullRequestHost, waiter = new RecordingWait()): BranchUpdater {
  return new BranchUpdater({ host, waiter, workflows: WORKFLOWS });
}

async function applyAll(host: InMemoryPullRequestHost, waiter = new RecordingWait()): Promise<readonly string[]> {
  const updater = updaterFor(host, waiter);
  return lines(await updater.apply(await updater.plan()));
}

async function previewAll(host: InMemoryPullRequestHost): Promise<readonly string[]> {
  const updater = updaterFor(host);
  return lines(await updater.preview(await updater.plan()));
}

function lines(results: readonly BranchUpdateResult[]): readonly string[] {
  return results.map((result) => result.line);
}

describe('BranchUpdater.apply', () => {
  it('updates eligible PRs one at a time and dispatches the required-check workflows on each new head', async () => {
    const host = new InMemoryPullRequestHost([[pullRequest({ number: 12 }), pullRequest({ number: 3 })]]);

    await applyAll(host);

    expect(host.events).toEqual([
      'list',
      'update #3',
      'dispatch ci.yml on feat/pr-3',
      'dispatch links.yml on feat/pr-3',
      'update #12',
      'dispatch ci.yml on feat/pr-12',
      'dispatch links.yml on feat/pr-12',
    ]);
  });

  it('reports the merge, the new head and the dispatched workflows of an updated PR', async () => {
    const host = new InMemoryPullRequestHost([[pullRequest({ number: 3, behindBy: 5 })]]);

    expect(await applyAll(host)).toEqual([
      `#3 merged main (5 commits behind) into feat/pr-3; new head ${mergedHeadOid(3).slice(0, 9)}; dispatched ci.yml, links.yml`,
    ]);
  });

  it('makes no write for a draft, a fork or an up-to-date PR', async () => {
    const host = new InMemoryPullRequestHost([[
      pullRequest({ number: 1, isDraft: true }),
      pullRequest({ number: 2, isFork: true }),
      pullRequest({ number: 3, behindBy: 0 }),
    ]]);

    await applyAll(host);

    expect(host.events).toEqual(['list']);
  });

  it('reports each skipped PR with its reason', async () => {
    const host = new InMemoryPullRequestHost([[pullRequest({ number: 1, isDraft: true })]]);

    expect(await applyAll(host)).toEqual([`#1 skipped: ${SkipReason.DRAFT.label}`]);
  });

  it('posts a conflict notice on a conflicting PR instead of updating it', async () => {
    const conflicting = pullRequest({ number: 4, mergeability: Mergeability.CONFLICTING });
    const host = new InMemoryPullRequestHost([[conflicting]]);

    await applyAll(host);

    expect(host.events).toEqual(['list', 'comment #4']);
    expect(host.commentsOn(4)).toEqual([new ConflictNotice(conflicting).body]);
  });

  it('does not post the conflict notice again for the same head', async () => {
    const conflicting = pullRequest({ number: 4, mergeability: Mergeability.CONFLICTING });
    const host = new InMemoryPullRequestHost([[conflicting]]);
    host.addComment(4, new ConflictNotice(conflicting).body);

    expect(await applyAll(host)).toEqual([
      `#4 conflicts with main; notice already posted for head ${'a'.repeat(9)}`,
    ]);
    expect(host.events).toEqual(['list']);
  });

  it('posts a new conflict notice when the conflicting head has changed', async () => {
    const earlier = pullRequest({ number: 4, headOid: 'b'.repeat(40), mergeability: Mergeability.CONFLICTING });
    const host = new InMemoryPullRequestHost([[pullRequest({ number: 4, mergeability: Mergeability.CONFLICTING })]]);
    host.addComment(4, new ConflictNotice(earlier).body);

    await applyAll(host);

    expect(host.events).toEqual(['list', 'comment #4']);
  });

  it('records a failure and goes on to the next PR when GitHub refuses an update', async () => {
    const host = new InMemoryPullRequestHost([[pullRequest({ number: 3 }), pullRequest({ number: 12 })]]);
    host.refuseUpdate(3);

    const results = await applyAll(host);

    expect(results[0]).toBe('#3 FAILED: could not merge main: HTTP 422: merge conflict between base and head');
    expect(host.events.slice(2)).toEqual([
      'update #12',
      'dispatch ci.yml on feat/pr-12',
      'dispatch links.yml on feat/pr-12',
    ]);
  });

  it('does not dispatch when the head does not move after an accepted update', async () => {
    const host = new InMemoryPullRequestHost([[pullRequest({ number: 3 })]]);
    host.keepHeadStill(3);
    const waiter = new RecordingWait();

    const results = await applyAll(host, waiter);

    expect(results).toEqual([
      `#3 FAILED: GitHub accepted the update, but the head did not move within ${HEAD_POLL.budgetMs} ms; no workflow dispatched`,
    ]);
    expect(host.events).toEqual(['list', 'update #3']);
    expect(waiter.waits).toEqual(Array.from({ length: HEAD_POLL.attempts }, () => HEAD_POLL.intervalMs));
  });

  it('records a failure that names the workflow when a dispatch is refused', async () => {
    const host = new InMemoryPullRequestHost([[pullRequest({ number: 3 })]]);
    host.refuseDispatch('links.yml');

    expect(await applyAll(host)).toEqual([
      `#3 FAILED: merged main into feat/pr-3 (new head ${mergedHeadOid(3).slice(0, 9)}), but could not dispatch links.yml: HTTP 422: Workflow does not have 'workflow_dispatch' trigger`,
    ]);
  });
});

describe('BranchUpdater.plan', () => {
  it('lists again after a wait while GitHub has not computed mergeability', async () => {
    const host = new InMemoryPullRequestHost([
      [pullRequest({ number: 3, mergeability: Mergeability.UNKNOWN })],
      [pullRequest({ number: 3 })],
    ]);
    const waiter = new RecordingWait();

    const decisions = await updaterFor(host, waiter).plan();

    expect(decisions.map((decision) => decision instanceof UpdateBranch)).toEqual([true]);
    expect(waiter.waits).toEqual([MERGEABILITY_POLL.intervalMs]);
  });

  it('skips a PR whose mergeability stays unknown for the whole poll budget', async () => {
    const host = new InMemoryPullRequestHost([[pullRequest({ number: 3, mergeability: Mergeability.UNKNOWN })]]);

    const [decision] = await updaterFor(host).plan();

    expect(decision instanceof SkipPullRequest && decision.reason).toBe(SkipReason.UNKNOWN_MERGEABILITY);
    expect(host.events).toEqual(Array.from({ length: MERGEABILITY_POLL.attempts }, () => 'list'));
  });

  it('lists once when GitHub already knows every mergeability', async () => {
    const host = new InMemoryPullRequestHost([[pullRequest({ number: 3 }), pullRequest({ number: 4, isDraft: true })]]);

    await updaterFor(host).plan();

    expect(host.events).toEqual(['list']);
  });
});

describe('BranchUpdater.preview', () => {
  it('makes no write to GitHub', async () => {
    const host = new InMemoryPullRequestHost([[
      pullRequest({ number: 3 }),
      pullRequest({ number: 4, mergeability: Mergeability.CONFLICTING }),
    ]]);

    await previewAll(host);

    expect(host.events).toEqual(['list']);
  });

  it('lists what it would update, report and skip', async () => {
    const host = new InMemoryPullRequestHost([[
      pullRequest({ number: 3, behindBy: 2 }),
      pullRequest({ number: 4, mergeability: Mergeability.CONFLICTING }),
      pullRequest({ number: 5, isFork: true }),
    ]]);

    expect(await previewAll(host)).toEqual([
      '#3 would merge main (2 commits behind) into feat/pr-3 and dispatch ci.yml, links.yml',
      '#4 conflicts with main; would post a conflict notice',
      `#5 skipped: ${SkipReason.FORK.label}`,
    ]);
  });

  it('says when the conflict notice for the current head is already posted', async () => {
    const conflicting = pullRequest({ number: 4, mergeability: Mergeability.CONFLICTING });
    const host = new InMemoryPullRequestHost([[conflicting]]);
    host.addComment(4, new ConflictNotice(conflicting).body);

    expect(await previewAll(host)).toEqual([
      `#4 conflicts with main; notice already posted for head ${'a'.repeat(9)}`,
    ]);
  });
});
