import ReleasePullRequestError from './ReleasePullRequestError.ts';

// The hosted PR Issue Reference policy reads a reference number as [1-9]\d* and keeps only safe integers.
const ISSUE_NUMBER = /^[1-9]\d*$/u;

/**
 * The release's goalpost: the same-repository issue that the release-prep PR must reference before
 * CI starts. The goalpost stays open after the merge, until registry verification and the retrospective.
 */
export default class ReleaseGoalpost {
  readonly issueNumber: number;

  constructor(issueNumber: string) {
    if (!ISSUE_NUMBER.test(issueNumber) || !Number.isSafeInteger(Number(issueNumber))) {
      throw new ReleasePullRequestError(
        `the goalpost must be the exact number of a same-repository issue, such as 804, not '${issueNumber}'`,
      );
    }
    this.issueNumber = Number(issueNumber);
    Object.freeze(this);
  }

  /** The bare `#N` form, which GitHub and the hosted policy resolve in the PR's own repository. */
  reference(): string {
    return `#${String(this.issueNumber)}`;
  }
}
