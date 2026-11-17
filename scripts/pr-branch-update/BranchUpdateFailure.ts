/** An update that the updater started for one pull request and could not finish. */
export default class BranchUpdateFailure {
  readonly pullRequestNumber: number;
  readonly reason: string;

  constructor(pullRequestNumber: number, reason: string) {
    this.pullRequestNumber = pullRequestNumber;
    this.reason = reason;
    Object.freeze(this);
  }

  get line(): string {
    return `#${this.pullRequestNumber} FAILED: ${this.reason}`;
  }
}
