import type ReportConflict from './ReportConflict.ts';
import type SkipPullRequest from './SkipPullRequest.ts';
import type UpdateBranch from './UpdateBranch.ts';

/** What the updater does with one open pull request. */
export type BranchUpdateDecision = UpdateBranch | ReportConflict | SkipPullRequest;
