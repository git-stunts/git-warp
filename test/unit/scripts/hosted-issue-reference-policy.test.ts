import { describe, expect, it } from 'vitest';

import HostedIssueReferencePolicy from '../../helpers/HostedIssueReferencePolicy.ts';

const REPOSITORY = 'git-stunts/git-warp';
const OWN_NUMBER = 99_999;
const ISSUE = 804;
const hosted = HostedIssueReferencePolicy.fromWorkflow();

function pullRequest(body: string, number = OWN_NUMBER) {
  return { number, title: 'Release v21.0.0', body };
}

describe('hosted PR Issue Reference policy, run locally', () => {
  // Oracle: the hosted script's refusal names its accepted forms:
  // "#123, GH-123, <owner>/<repo>#123, or https://github.com/<owner>/<repo>/issues/123".
  it.each([
    ['#804'],
    ['GH-804'],
    ['gh-804'],
    ['git-stunts/git-warp#804'],
    ['Git-Stunts/Git-Warp#804'],
    ['https://github.com/git-stunts/git-warp/issues/804'],
  ])('accepts the same-repository reference form %s', async (reference) => {
    const verdict = await hosted.evaluate(REPOSITORY, pullRequest(`Goalpost: ${reference}`), { issues: [ISSUE], pullRequests: [] });

    expect(verdict.exitCode).toBe(0);
    expect(verdict.lookedUp).toEqual([ISSUE]);
    expect(verdict.output).toEqual(['Found issue reference #804: Issue 804']);
  });

  it.each([
    ['another repository', 'other/repo#804'],
    ['a fork of this repository', 'git-stunts/git-warp-fork#804'],
    ['a word before the hash', 'goalpost#804'],
    ['a slash before the hash', 'see /#804'],
    ['a hyphen before the hash', 'see -#804'],
    ['a leading zero', '#0804'],
    ['a pull request URL', 'https://github.com/git-stunts/git-warp/pull/804'],
    ['a word before GH-', 'XGH-804'],
    ['a bare number', 'Goalpost: 804'],
  ])('finds no reference in %s', async (_case, text) => {
    const verdict = await hosted.evaluate(REPOSITORY, pullRequest(text), { issues: [ISSUE], pullRequests: [] });

    expect(verdict.exitCode).toBe(1);
    expect(verdict.lookedUp).toEqual([]);
    expect(verdict.output[0]).toBe('This PR must reference at least one same-repository GitHub Issue.');
  });

  it('refuses a reference that resolves to a pull request', async () => {
    const verdict = await hosted.evaluate(REPOSITORY, pullRequest('Goalpost: #804'), { issues: [], pullRequests: [ISSUE] });

    expect(verdict.exitCode).toBe(1);
    expect(verdict.output).toContain('Ignoring #804: it is a pull request, not an issue.');
  });

  it("does not count the pull request's own number", async () => {
    const verdict = await hosted.evaluate(REPOSITORY, pullRequest('Goalpost: #804', ISSUE), { issues: [ISSUE], pullRequests: [] });

    expect(verdict.exitCode).toBe(1);
    expect(verdict.lookedUp).toEqual([]);
  });
});

describe('hosted policy harness', () => {
  it('records nothing after the first exit, as a real process.exit would', async () => {
    // Oracle: Node's process.exit ends the process, so the hosted check never looks past the first issue it finds.
    const verdict = await hosted.evaluate(REPOSITORY, pullRequest('Goalpost: #804, see also #900'), { issues: [ISSUE, 900], pullRequests: [] });

    expect(verdict.exitCode).toBe(0);
    expect(verdict.lookedUp).toEqual([ISSUE]);
    expect(verdict.output).toEqual(['Found issue reference #804: Issue 804']);
  });

  it('fails closed when the workflow no longer holds the policy script', () => {
    expect(() => HostedIssueReferencePolicy.fromWorkflow('jobs: {}\n'))
      .toThrow("has no node <<'NODE' policy script in its first step");
  });

  it('fails closed when the script never exits', async () => {
    await expect(new HostedIssueReferencePolicy('').evaluate(REPOSITORY, pullRequest('#804'), { issues: [], pullRequests: [] }))
      .rejects.toThrow('finished without calling process.exit');
  });

  it('fails closed when the script needs a module that is not stubbed', async () => {
    const policy = new HostedIssueReferencePolicy("require('node:child_process');");

    await expect(policy.evaluate(REPOSITORY, pullRequest('#804'), { issues: [], pullRequests: [] }))
      .rejects.toThrow('the hosted policy needs an unstubbed module: node:child_process');
  });
});
