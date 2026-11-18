import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDocument, type Document } from 'yaml';

import HostedIssueReferencePolicy from '../../helpers/HostedIssueReferencePolicy.ts';

const REPOSITORY = 'git-stunts/git-warp';
const OWN_NUMBER = 99_999;
const ISSUE = 804;
const WORKFLOW = '.github/workflows/pr-issue-reference.yml';
const JOB = Object.freeze(['jobs', 'require-issue-reference']);
const STEPS = Object.freeze([...JOB, 'steps']);
const POLICY_STEP = Object.freeze([...STEPS, 0]);
const SHAPE_REFUSAL = 'no longer has the shape that the harness models';
const hosted = HostedIssueReferencePolicy.fromWorkflow();

function pullRequest(body: string, number = OWN_NUMBER) {
  return { number, title: 'Release v21.0.0', body };
}

/** The checked-in workflow after one edit, written back out as YAML text. */
function editedWorkflow(edit: (document: Document) => void): string {
  const document = parseDocument(readFileSync(WORKFLOW, 'utf8'));
  edit(document);
  return String(document);
}

function policyRun(document: Document): string {
  return String(document.getIn([...POLICY_STEP, 'run']));
}

const RUN_WRAPPER_START = "set -euo pipefail\n\nnode <<'NODE'\n";
const RUN_WRAPPER_END = '\nNODE\n';

/** Replaces the Node program inside the unchanged shell wrapper of the policy step. */
function editProgram(document: Document, edit: (program: string) => string): void {
  const run = policyRun(document);
  const program = run.slice(RUN_WRAPPER_START.length, run.length - RUN_WRAPPER_END.length);
  document.setIn([...POLICY_STEP, 'run'], `${RUN_WRAPPER_START}${edit(program)}${RUN_WRAPPER_END}`);
}

// Each edit changes what the hosted job does outside the Node program, which the harness cannot run.
const UNMODELLED_EDITS: readonly (readonly [string, (document: Document) => void])[] = [
  ['a shell line runs after the policy script', (document) => {
    document.setIn([...POLICY_STEP, 'run'], `${policyRun(document)}exit 1\n`);
  }],
  ['a shell line runs before the policy script', (document) => {
    document.setIn([...POLICY_STEP, 'run'], `exit 1\n${policyRun(document)}`);
  }],
  ['the job gains a second step', (document) => {
    document.addIn([...STEPS], document.createNode({ name: 'extra', shell: 'bash', run: 'exit 1\n' }));
  }],
  ['the policy step gains a setting', (document) => {
    document.setIn([...POLICY_STEP, 'continue-on-error'], true);
  }],
  ['the policy step runs under another shell', (document) => {
    document.setIn([...POLICY_STEP, 'shell'], 'sh');
  }],
  ['the policy step gains an environment variable', (document) => {
    // Node 22 refuses `-p` in NODE_OPTIONS before the policy script runs.
    document.setIn([...POLICY_STEP, 'env', 'NODE_OPTIONS'], '-p');
  }],
  ['the policy step binds another token', (document) => {
    document.setIn([...POLICY_STEP, 'env', 'GITHUB_TOKEN'], '${{ secrets.OTHER_TOKEN }}');
  }],
  ['the policy step environment is not a mapping', (document) => {
    document.setIn([...POLICY_STEP, 'env'], 'GITHUB_TOKEN=unset');
  }],
  ['the job gains a condition', (document) => {
    // GitHub skips a job whose `if` is false and reports the check as skipped, not failed.
    document.setIn([...JOB, 'if'], false);
  }],
  ['the job steps are not a list', (document) => {
    // A mapping that holds the real step, so a harness that reads mappings as steps would accept it.
    document.setIn([...STEPS], document.createNode({ policy: document.getIn([...POLICY_STEP]) }));
  }],
  // Bash ends a <<'NODE' heredoc at the first line that is exactly NODE and runs the lines after it as shell.
  ['the program holds a NODE line, so bash runs the rest as shell', (document) => {
    editProgram(document, (program) => `var NODE;\n${program}\nNODE\nfalse`);
  }],
  ['the program holds a NODE line inside a comment', (document) => {
    editProgram(document, (program) => `${program}\n/*\nNODE\n*/`);
  }],
];

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
    expect(() => HostedIssueReferencePolicy.fromWorkflow('jobs: {}\n')).toThrow(SHAPE_REFUSAL);
  });

  it.each(UNMODELLED_EDITS)('fails closed when %s', (_case, edit) => {
    expect(() => HostedIssueReferencePolicy.fromWorkflow(editedWorkflow(edit))).toThrow(SHAPE_REFUSAL);
  });

  it('fails closed when the workflow has a YAML error, such as a second top-level jobs key', () => {
    // The yaml parser records the duplicate key as an error and still returns a document.
    const duplicated = `${readFileSync(WORKFLOW, 'utf8')}\njobs:\n  other:\n    runs-on: ubuntu-latest\n    steps:\n      - run: exit 1\n`;

    expect(() => HostedIssueReferencePolicy.fromWorkflow(duplicated)).toThrow(SHAPE_REFUSAL);
  });

  it('accepts the checked-in workflow after a YAML round trip, so only the edits cause those refusals', () => {
    expect(HostedIssueReferencePolicy.fromWorkflow(editedWorkflow(() => undefined)))
      .toBeInstanceOf(HostedIssueReferencePolicy);
  });

  it('accepts a changed program whose lines only mention NODE, which bash does not treat as the heredoc end', () => {
    const workflow = editedWorkflow((document) => {
      editProgram(document, (program) => `// NODE ends the heredoc only on a line of its own.\n${program}`);
    });

    expect(HostedIssueReferencePolicy.fromWorkflow(workflow)).toBeInstanceOf(HostedIssueReferencePolicy);
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
