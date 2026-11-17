/** A release-PR input that the helper refuses, because the PR it opens would break the release contract. */
export default class ReleasePullRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleasePullRequestError';
  }
}
