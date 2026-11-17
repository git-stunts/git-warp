/** What the updater did, or in a dry run would do, with one pull request. */
export default class BranchUpdateOutcome {
  readonly pullRequestNumber: number;
  readonly summary: string;

  constructor(pullRequestNumber: number, summary: string) {
    this.pullRequestNumber = pullRequestNumber;
    this.summary = summary;
    Object.freeze(this);
  }

  get line(): string {
    return `#${this.pullRequestNumber} ${this.summary}`;
  }
}
