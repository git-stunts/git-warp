import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import GhCliPullRequestHost from '../../../../scripts/pr-branch-update/adapters/GhCliPullRequestHost.ts';
import Mergeability from '../../../../scripts/pr-branch-update/Mergeability.ts';
import PullRequestSnapshot from '../../../../scripts/pr-branch-update/PullRequestSnapshot.ts';
import ReportConflict from '../../../../scripts/pr-branch-update/ReportConflict.ts';
import selectBranchUpdates from '../../../../scripts/pr-branch-update/selectBranchUpdates.ts';
import UpdateBranch from '../../../../scripts/pr-branch-update/UpdateBranch.ts';

// Oracle: the GitHub REST and GraphQL contracts that the adapter calls
// through `gh api` (docs.github.com, "Update a pull request branch", "Create
// a workflow dispatch event", "Compare two commits", "Create an issue
// comment"), and issue #1131 for the plan that the fixture list must yield.

const LISTING = readFileSync(resolve(process.cwd(), 'test/fixtures/pr-branch-update/open-pull-requests.json'), 'utf8');
const BASE_OID = 'e'.repeat(40);
const BEHIND_BY = new Map([['1', 4], ['2', 0], ['3', 7], ['4', 12], ['5', 3], ['6', 1]]);

type GhCall = readonly string[];

/** A `gh` runner that answers from fixtures and records every call. */
class FixtureGh {
  readonly calls: GhCall[] = [];
  readonly #answers: ReadonlyMap<string, string>;
  readonly #listing: string;

  constructor(answers: ReadonlyMap<string, string> = new Map(), listing = LISTING) {
    this.#answers = answers;
    this.#listing = listing;
  }

  readonly run = (args: readonly string[]): Promise<string> => {
    this.calls.push(args);
    const endpoint = args[1] ?? '';
    if (endpoint === 'graphql') {
      return Promise.resolve(this.#listing);
    }
    const compare = /^repos\/git-stunts\/git-warp\/compare\/e{40}\.\.\.(?<head>[0-9a-f])[0-9a-f]{39}$/u.exec(endpoint);
    if (compare?.groups?.['head'] !== undefined) {
      return Promise.resolve(`{"behind_by":${BEHIND_BY.get(compare.groups['head']) ?? -1}}\n`);
    }
    return Promise.resolve(this.#answers.get(endpoint) ?? '');
  };
}

function behindPullRequest(): PullRequestSnapshot {
  return new PullRequestSnapshot({
    number: 2001,
    baseRefName: 'main',
    headRefName: 'feat/behind',
    headOid: '1'.repeat(40),
    isDraft: false,
    isFork: false,
    mergeability: Mergeability.MERGEABLE,
    behindBy: 4,
  });
}

function hostFor(gh: FixtureGh): GhCliPullRequestHost {
  return new GhCliPullRequestHost({ repository: 'git-stunts/git-warp', baseRefName: 'main' }, gh.run);
}

function describePlan(gh: FixtureGh): Promise<readonly string[]> {
  return hostFor(gh).listOpenPullRequests().then((pullRequests) => selectBranchUpdates(pullRequests).map((decision) => {
    if (decision instanceof UpdateBranch) {
      return `#${decision.pullRequest.number} update`;
    }
    if (decision instanceof ReportConflict) {
      return `#${decision.pullRequest.number} report conflict`;
    }
    return `#${decision.pullRequest.number} skip: ${decision.reason.label}`;
  }));
}

describe('GhCliPullRequestHost.listOpenPullRequests', () => {
  it('decides every PR of the fixture open-PR list: behind, up to date, draft, conflicting, fork and unknown', async () => {
    expect(await describePlan(new FixtureGh())).toEqual([
      '#2001 update',
      '#2002 skip: already contains the base',
      '#2003 skip: draft',
      '#2004 report conflict',
      '#2005 skip: head branch is in a fork',
      '#2006 skip: mergeability not yet computed',
    ]);
  });

  it('builds a snapshot from the GraphQL node and the compare count', async () => {
    const [first] = await hostFor(new FixtureGh()).listOpenPullRequests();

    expect(first).toMatchObject({
      number: 2001,
      baseRefName: 'main',
      headRefName: 'feat/behind',
      headOid: '1'.repeat(40),
      isDraft: false,
      isFork: false,
      mergeability: Mergeability.MERGEABLE,
      behindBy: 4,
    });
  });

  it('asks GraphQL for the open PRs that target the base branch', async () => {
    const gh = new FixtureGh();

    await hostFor(gh).listOpenPullRequests();

    expect(gh.calls[0]).toEqual(expect.arrayContaining(['-f', 'owner=git-stunts', '-f', 'name=git-warp', '-f', 'base=main', '-f', 'baseRef=refs/heads/main']));
  });

  it('measures each head against the base tip that the listing returned', async () => {
    const gh = new FixtureGh();

    await hostFor(gh).listOpenPullRequests();

    expect(gh.calls.slice(1).map((call) => call[1])).toEqual(
      ['1', '2', '3', '4', '5', '6'].map((digit) => `repos/git-stunts/git-warp/compare/${BASE_OID}...${digit.repeat(40)}`),
    );
  });

  it('refuses a listing that has a second page', async () => {
    const gh = new FixtureGh(new Map(), LISTING.replace('"hasNextPage": false', '"hasNextPage": true'));

    await expect(hostFor(gh).listOpenPullRequests()).rejects.toThrow(/more than 100 open pull requests/u);
  });

  it('refuses a mergeable value that GitHub does not document', async () => {
    const gh = new FixtureGh(new Map(), LISTING.replace('"mergeable": "UNKNOWN"', '"mergeable": "MAYBE"'));

    await expect(hostFor(gh).listOpenPullRequests()).rejects.toThrow(/mergeable value "MAYBE"/u);
  });

  it('refuses a listing whose base branch does not exist', async () => {
    const missingBase = LISTING.replace(/"ref": \{[^}]*\}\s*\}/u, '"ref": null');
    const gh = new FixtureGh(new Map(), missingBase);

    await expect(hostFor(gh).listOpenPullRequests()).rejects.toThrow(/base branch refs\/heads\/main does not exist/u);
  });

  it('refuses a response that lacks a field and names the field path', async () => {
    const gh = new FixtureGh(new Map(), '{"data":{"repository":{"pullRequests":{}}}}');

    await expect(hostFor(gh).listOpenPullRequests()).rejects.toThrow(/response\.data\.repository lacks field "ref"/u);
  });

  it('refuses a response that is not JSON', async () => {
    const gh = new FixtureGh(new Map(), 'gh: Bad credentials (HTTP 401)');

    await expect(hostFor(gh).listOpenPullRequests()).rejects.toThrow(/gh api graphql returned text that is not JSON/u);
  });
});

describe('GhCliPullRequestHost writes', () => {
  it('merges the base with update-branch, guarded by the expected head', async () => {
    const gh = new FixtureGh(new Map([['repos/git-stunts/git-warp/pulls/2001/update-branch', '{"message":"Updating pull request branch."}']]));

    await hostFor(gh).updateBranch(behindPullRequest());

    expect(gh.calls).toEqual([[
      'api', 'repos/git-stunts/git-warp/pulls/2001/update-branch', '--method', 'PUT', '-f', `expected_head_sha=${'1'.repeat(40)}`,
    ]]);
  });

  it('dispatches a workflow on the PR head branch', async () => {
    const gh = new FixtureGh();

    await hostFor(gh).dispatchWorkflow('ci.yml', 'feat/behind');

    expect(gh.calls).toEqual([[
      'api', 'repos/git-stunts/git-warp/actions/workflows/ci.yml/dispatches', '--method', 'POST', '-f', 'ref=feat/behind',
    ]]);
  });

  it('posts a comment on the PR conversation', async () => {
    const gh = new FixtureGh(new Map([['repos/git-stunts/git-warp/issues/2004/comments', '{"id":1}']]));

    await hostFor(gh).createComment(2004, 'notice body');

    expect(gh.calls).toEqual([[
      'api', 'repos/git-stunts/git-warp/issues/2004/comments', '--method', 'POST', '-f', 'body=notice body',
    ]]);
  });
});

describe('GhCliPullRequestHost reads', () => {
  it('reads the current head object id of a PR', async () => {
    const gh = new FixtureGh(new Map([['repos/git-stunts/git-warp/pulls/2001', `{"head":{"sha":"${'9'.repeat(40)}"}}`]]));

    expect(await hostFor(gh).readHeadOid(2001)).toBe('9'.repeat(40));
  });

  it('reads the comment bodies of every page', async () => {
    const pages = '[[{"body":"first"},{"body":"second"}],[{"body":"third"}]]';
    const gh = new FixtureGh(new Map([['repos/git-stunts/git-warp/issues/2004/comments', pages]]));

    expect(await hostFor(gh).listCommentBodies(2004)).toEqual(['first', 'second', 'third']);
    expect(gh.calls[0]).toEqual(['api', 'repos/git-stunts/git-warp/issues/2004/comments', '--method', 'GET', '--paginate', '--slurp']);
  });
});

describe('GhCliPullRequestHost construction', () => {
  it('refuses a repository that is not in owner/name form', () => {
    expect(() => new GhCliPullRequestHost({ repository: 'git-warp', baseRefName: 'main' })).toThrow(/owner\/name/u);
  });
});
