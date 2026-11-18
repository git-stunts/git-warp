import type { BranchUpdateDecision } from './BranchUpdateDecision.ts';
import Mergeability from './Mergeability.ts';
import type PullRequestSnapshot from './PullRequestSnapshot.ts';
import ReportConflict from './ReportConflict.ts';
import SkipPullRequest from './SkipPullRequest.ts';
import SkipReason from './SkipReason.ts';
import UpdateBranch from './UpdateBranch.ts';

type SkipRule = {
  readonly reason: SkipReason;
  readonly applies: (pullRequest: PullRequestSnapshot) => boolean;
};

/**
 * The first matching rule names the skip. Drafts and forks come first, so
 * the updater never comments on them. An up-to-date head needs no merge,
 * whatever its mergeability.
 */
const SKIP_RULES: readonly SkipRule[] = Object.freeze([
  { reason: SkipReason.DRAFT, applies: (pullRequest) => pullRequest.isDraft },
  { reason: SkipReason.FORK, applies: (pullRequest) => pullRequest.isFork },
  { reason: SkipReason.UP_TO_DATE, applies: (pullRequest) => pullRequest.behindBy === 0 },
  {
    reason: SkipReason.UNKNOWN_MERGEABILITY,
    applies: (pullRequest) => pullRequest.mergeability === Mergeability.UNKNOWN,
  },
]);

/**
 * Decide, for each open pull request, whether the updater merges the base
 * into its branch, reports a conflict, or skips it (#1131). The plan is in
 * ascending PR number order, so the oldest pull request is updated first.
 */
export default function selectBranchUpdates(
  pullRequests: readonly PullRequestSnapshot[],
): readonly BranchUpdateDecision[] {
  return [...pullRequests]
    .sort((left, right) => left.number - right.number)
    .map(decide);
}

function decide(pullRequest: PullRequestSnapshot): BranchUpdateDecision {
  const skip = SKIP_RULES.find((rule) => rule.applies(pullRequest));
  if (skip !== undefined) {
    return new SkipPullRequest(pullRequest, skip.reason);
  }
  if (pullRequest.mergeability === Mergeability.CONFLICTING) {
    return new ReportConflict(pullRequest);
  }
  return new UpdateBranch(pullRequest);
}
