import type ReleaseGoalpost from './ReleaseGoalpost.ts';
import ReleasePullRequestError from './ReleasePullRequestError.ts';

// The `v{version}` tag form of .continuum/release.yml, checked as ReleaseNotesComposer checks it.
const RELEASE_TAG = /^v\d+\.\d+\.\d+(?:-[\w.]+)?$/u;

/** The release-prep PR from `release/<tag>` to `main`. */
export default class ReleasePullRequest {
  readonly tag: string;
  readonly goalpost: ReleaseGoalpost;

  constructor({ tag, goalpost }: { readonly tag: string; readonly goalpost: ReleaseGoalpost }) {
    if (!RELEASE_TAG.test(tag)) {
      throw new ReleasePullRequestError(`invalid release tag: '${tag}'`);
    }
    this.tag = tag;
    this.goalpost = goalpost;
    Object.freeze(this);
  }

  /**
   * The PR body. Its `## Issue` section satisfies the required PR Issue Reference check when the
   * PR opens. It has no closing keyword, so the merge does not close the goalpost.
   */
  body(): string {
    return [
      '## Summary',
      '',
      `- Prepare the \`${this.tag}\` release from \`release/${this.tag}\`.`,
      '',
      '## Issue',
      '',
      `Goalpost: ${this.goalpost.reference()}`,
      '',
      'The goalpost stays open until the registry verification and the retrospective are recorded.',
      '',
      '## Test plan',
      '',
      '- `npm run release:prep`',
      '',
    ].join('\n');
  }
}
