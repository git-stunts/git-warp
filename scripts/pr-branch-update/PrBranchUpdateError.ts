/**
 * A refusal from the PR branch updater: GitHub returned data that breaks the
 * updater's contract, or a request to GitHub failed.
 */
export default class PrBranchUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrBranchUpdateError';
  }
}
