/**
 * GitHub's verdict on whether a pull request merges cleanly into its base.
 *
 * UNKNOWN means that GitHub has not finished computing the verdict. GitHub
 * recomputes it for every open pull request after each push to the base.
 */
export default class Mergeability {
  static readonly MERGEABLE = new Mergeability('merges cleanly');
  static readonly CONFLICTING = new Mergeability('conflicts');
  static readonly UNKNOWN = new Mergeability('not yet computed');

  readonly label: string;

  private constructor(label: string) {
    this.label = label;
    Object.freeze(this);
  }
}
