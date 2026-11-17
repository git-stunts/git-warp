import type PullRequestSnapshot from './PullRequestSnapshot.ts';
import type SkipReason from './SkipReason.ts';

/** Decision: leave this pull request alone, for the stated reason. */
export default class SkipPullRequest {
  readonly #pullRequest: PullRequestSnapshot;
  readonly #reason: SkipReason;

  constructor(pullRequest: PullRequestSnapshot, reason: SkipReason) {
    this.#pullRequest = pullRequest;
    this.#reason = reason;
    Object.freeze(this);
  }

  get pullRequest(): PullRequestSnapshot {
    return this.#pullRequest;
  }

  get reason(): SkipReason {
    return this.#reason;
  }
}
