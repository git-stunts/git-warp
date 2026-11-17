import type PullRequestSnapshot from './PullRequestSnapshot.ts';

/** The GitHub operations that the PR branch updater needs. */
export interface PullRequestHostPort {
  /** Every open pull request that targets the base branch. */
  listOpenPullRequests(): Promise<readonly PullRequestSnapshot[]>;
  /** Merge the base into the head branch, if the head is still the snapshot's head. */
  updateBranch(pullRequest: PullRequestSnapshot): Promise<void>;
  readHeadOid(pullRequestNumber: number): Promise<string>;
  dispatchWorkflow(workflowFile: string, ref: string): Promise<void>;
  listCommentBodies(pullRequestNumber: number): Promise<readonly string[]>;
  createComment(pullRequestNumber: number, body: string): Promise<void>;
}
