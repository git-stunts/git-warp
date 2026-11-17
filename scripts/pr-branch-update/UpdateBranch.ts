import type PullRequestSnapshot from './PullRequestSnapshot.ts';

/** Decision: merge the base into this pull request's head branch. */
export default class UpdateBranch {
  readonly #pullRequest: PullRequestSnapshot;

  constructor(pullRequest: PullRequestSnapshot) {
    this.#pullRequest = pullRequest;
    Object.freeze(this);
  }

  get pullRequest(): PullRequestSnapshot {
    return this.#pullRequest;
  }
}
