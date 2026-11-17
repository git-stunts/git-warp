import type PullRequestSnapshot from './PullRequestSnapshot.ts';

const MARKER_PREFIX = '<!-- git-warp pr-branch-update conflict head=';
const SHORT_OID_LENGTH = 9;

/**
 * The comment that tells an author that the updater could not merge the
 * base into a conflicting pull request. Its hidden marker names the head
 * commit, so the updater posts it once for each head and not on every push
 * to the base.
 */
export default class ConflictNotice {
  readonly #headOid: string;
  readonly #baseRefName: string;

  constructor(pullRequest: PullRequestSnapshot) {
    this.#headOid = pullRequest.headOid;
    this.#baseRefName = pullRequest.baseRefName;
    Object.freeze(this);
  }

  get marker(): string {
    return `${MARKER_PREFIX}${this.#headOid} -->`;
  }

  get body(): string {
    const base = `\`${this.#baseRefName}\``;
    const head = `\`${this.#headOid.slice(0, SHORT_OID_LENGTH)}\``;
    return [
      this.marker,
      `This pull request conflicts with ${base}, so the PR branch updater did not merge ${base} into it.`,
      '',
      `Merge ${base} into this branch and resolve the conflicts. The updater posts this notice once for each head commit (now ${head}).`,
    ].join('\n');
  }

  isPostedIn(commentBodies: readonly string[]): boolean {
    return commentBodies.some((body) => body.includes(this.marker));
  }
}
