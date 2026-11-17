/** Why the PR branch updater leaves a pull request alone. */
export default class SkipReason {
  /** Drafts merge the base themselves before review (AGENTS.md). */
  static readonly DRAFT = new SkipReason('draft');
  /** The updater never writes to a branch in another repository. */
  static readonly FORK = new SkipReason('head branch is in a fork');
  static readonly UP_TO_DATE = new SkipReason('already contains the base');
  /** GitHub has not computed mergeability, so a clean merge is not known. */
  static readonly UNKNOWN_MERGEABILITY = new SkipReason('mergeability not yet computed');

  readonly label: string;

  private constructor(label: string) {
    this.label = label;
    Object.freeze(this);
  }
}
