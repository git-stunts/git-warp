import { describe, expect, it } from 'vitest';

import ConflictNotice from '../../../../scripts/pr-branch-update/ConflictNotice.ts';
import Mergeability from '../../../../scripts/pr-branch-update/Mergeability.ts';
import PullRequestSnapshot from '../../../../scripts/pr-branch-update/PullRequestSnapshot.ts';

// Oracle: issue #1131 asks for one comment on a conflicting PR, not one on
// every push to main. The notice is keyed by the head commit.

function conflicting(headOid: string): PullRequestSnapshot {
  return new PullRequestSnapshot({
    number: 4,
    baseRefName: 'main',
    headRefName: 'feat/conflict',
    headOid,
    isDraft: false,
    isFork: false,
    mergeability: Mergeability.CONFLICTING,
    behindBy: 2,
  });
}

const HEAD = 'c'.repeat(40);
const OTHER_HEAD = 'd'.repeat(40);

describe('ConflictNotice', () => {
  it('opens its body with a hidden marker that names the full head object id', () => {
    const notice = new ConflictNotice(conflicting(HEAD));

    expect(notice.body.split('\n')[0]).toBe(`<!-- git-warp pr-branch-update conflict head=${HEAD} -->`);
  });

  it('tells the author to merge the base and resolve the conflicts', () => {
    expect(new ConflictNotice(conflicting(HEAD)).body).toContain('Merge `main` into this branch and resolve the conflicts.');
  });

  it('is found in a comment list that holds its own body', () => {
    const notice = new ConflictNotice(conflicting(HEAD));

    expect(notice.isPostedIn(['unrelated review comment', notice.body])).toBe(true);
  });

  it('is not found when only a notice for another head was posted', () => {
    const earlier = new ConflictNotice(conflicting(OTHER_HEAD));

    expect(new ConflictNotice(conflicting(HEAD)).isPostedIn([earlier.body])).toBe(false);
  });

  it('is not found in an empty comment list', () => {
    expect(new ConflictNotice(conflicting(HEAD)).isPostedIn([])).toBe(false);
  });
});
