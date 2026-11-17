import { describe, expect, it } from 'vitest';

import ReleaseGoalpost from '../../../scripts/release-pr/ReleaseGoalpost.ts';
import ReleasePullRequest from '../../../scripts/release-pr/ReleasePullRequest.ts';
import ReleasePullRequestError from '../../../scripts/release-pr/ReleasePullRequestError.ts';
import HostedIssueReferencePolicy from '../../helpers/HostedIssueReferencePolicy.ts';

const REPOSITORY = 'git-stunts/git-warp';
const TAG = 'v21.0.0';
const GOALPOST = 804;
// GitHub PR numbers come from the issue sequence, so a new release PR never has its goalpost's number.
const RELEASE_PR_NUMBER = 99_999;
const hosted = HostedIssueReferencePolicy.fromWorkflow();

function releasePullRequest(): ReleasePullRequest {
  return new ReleasePullRequest({ tag: TAG, goalpost: new ReleaseGoalpost(String(GOALPOST)) });
}

/** The PR that the runbook opens: title "Release <tag>" and the generated body. */
function openedReleasePullRequest() {
  return { number: RELEASE_PR_NUMBER, title: `Release ${TAG}`, body: releasePullRequest().body() };
}

describe('generated release PR body', () => {
  it('passes the hosted PR Issue Reference policy through its goalpost', async () => {
    // Only the goalpost resolves to an issue, so no other number can satisfy the policy in its place.
    const verdict = await hosted.evaluate(REPOSITORY, openedReleasePullRequest(), { issues: [GOALPOST], pullRequests: [] });

    expect(verdict.output).toEqual(['Found issue reference #804: Issue 804']);
    expect(verdict.exitCode).toBe(0);
  });

  it('references no number other than the goalpost', async () => {
    // With no issue resolving, the hosted policy looks up every candidate it finds.
    const verdict = await hosted.evaluate(REPOSITORY, openedReleasePullRequest(), { issues: [], pullRequests: [] });

    expect(verdict.lookedUp).toEqual([GOALPOST]);
  });

  it('has no closing keyword, so merging the release PR leaves the goalpost open', () => {
    // Oracle: GitHub's closing keywords are close, closes, closed, fix, fixes, fixed, resolve, resolves, resolved.
    expect(releasePullRequest().body()).not.toMatch(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b/iu);
  });

  it('names the release tag and its release branch', () => {
    expect(releasePullRequest().body()).toContain('`v21.0.0` release from `release/v21.0.0`');
  });
});

describe('release PR inputs', () => {
  // Oracle: the hosted policy reads a reference number as [1-9]\d* and keeps it only if it is a safe integer.
  it.each([
    [''], ['0'], ['-1'], ['+1'], ['#804'], ['GH-804'], ['804a'], [' 804'], ['804 '], ['0804'], ['1e3'], ['8.04'],
    ['9007199254740992'],
  ])('refuses the goalpost %j because it is not an exact issue number', (goalpost) => {
    expect(() => new ReleaseGoalpost(goalpost)).toThrow(ReleasePullRequestError);
    expect(() => new ReleaseGoalpost(goalpost)).toThrow(`not '${goalpost}'`);
  });

  it.each([['1', 1], ['804', 804], ['9007199254740991', Number.MAX_SAFE_INTEGER]])(
    'keeps the goalpost %j as issue number %d', (goalpost, issueNumber) => {
      expect(new ReleaseGoalpost(goalpost).issueNumber).toBe(issueNumber);
    },
  );

  it.each([['21.0.0'], ['v21'], ['v21.0'], ['release/v21.0.0'], ['v21.0.0 ']])('refuses the tag %j', (tag) => {
    const goalpost = new ReleaseGoalpost('804');

    expect(() => new ReleasePullRequest({ tag, goalpost })).toThrow(ReleasePullRequestError);
    expect(() => new ReleasePullRequest({ tag, goalpost })).toThrow(`invalid release tag: '${tag}'`);
  });

  it.each([['v21.0.0'], ['v21.0.0-rc.1']])('keeps the tag %j', (tag) => {
    expect(new ReleasePullRequest({ tag, goalpost: new ReleaseGoalpost('804') }).tag).toBe(tag);
  });
});
