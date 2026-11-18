import type PullRequestSnapshot from './PullRequestSnapshot.ts';

/**
 * Decision: this pull request is behind and conflicts with its base. The
 * updater does not merge; it tells the author once for each head commit.
 */
export default class ReportConflict {
  readonly #pullRequest: PullRequestSnapshot;

  constructor(pullRequest: PullRequestSnapshot) {
    this.#pullRequest = pullRequest;
    Object.freeze(this);
  }

  get pullRequest(): PullRequestSnapshot {
    return this.#pullRequest;
  }
}
