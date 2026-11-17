import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import z from 'zod';

import { REQUIRED_CHECK_WORKFLOWS } from '../../../../scripts/pr-branch-update/RequiredCheckWorkflows.ts';

// Oracle: issue #1131 section 2d (least token permissions, never push to
// forks), and the GitHub Actions hardening guide: pin actions to a full
// commit SHA, do not run pull_request_target, do not check out untrusted
// code with a write token.

const WORKFLOW_PATH = '.github/workflows/pr-branch-update.yml';
const FULL_SHA_PIN = /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/u;

const StepSchema = z.object({
  name: z.string().optional(),
  uses: z.string().optional(),
  with: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])).optional(),
  env: z.record(z.string(), z.string()).optional(),
  run: z.string().optional(),
});

const JobSchema = z.object({
  'runs-on': z.string(),
  'timeout-minutes': z.number().int().positive(),
  permissions: z.record(z.string(), z.string()),
  steps: z.array(StepSchema),
});

const WorkflowSchema = z.object({
  name: z.string(),
  on: z.looseObject({}),
  permissions: z.record(z.string(), z.string()),
  concurrency: z.object({ group: z.string(), 'cancel-in-progress': z.boolean() }),
  jobs: z.record(z.string(), JobSchema),
});

const TriggerSchema = z.object({ on: z.looseObject({}) });

function readText(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const workflowText = readText(WORKFLOW_PATH);
const workflow = WorkflowSchema.parse(parse(workflowText));
const jobs = Object.values(workflow.jobs);
const steps = jobs.flatMap((job) => job.steps);

describe('pr-branch-update workflow', () => {
  it('runs on push to main and on no other event', () => {
    expect(workflow.on).toEqual({ push: { branches: ['main'] } });
  });

  it('never uses pull_request_target', () => {
    expect(workflowText).not.toContain('pull_request_target');
  });

  it('grants no token permission at the workflow level', () => {
    expect(workflow.permissions).toEqual({});
  });

  it('grants its one job only the write scopes that update-branch, comments and dispatch need', () => {
    expect(jobs.map((job) => job.permissions)).toEqual([
      { actions: 'write', contents: 'write', 'pull-requests': 'write' },
    ]);
  });

  it('runs one updater at a time and lets a running update finish', () => {
    expect(workflow.concurrency).toEqual({ group: 'pr-branch-update', 'cancel-in-progress': false });
  });

  it('pins every action to a full commit SHA', () => {
    const uses = steps.flatMap((step) => (step.uses === undefined ? [] : [step.uses]));

    expect(uses.length).toBeGreaterThan(0);
    expect(uses.filter((action) => !FULL_SHA_PIN.test(action))).toEqual([]);
  });

  it('checks out the pushed main commit, not a PR ref, and keeps no credential in the checkout', () => {
    const checkouts = steps.filter((step) => step.uses?.startsWith('actions/checkout@') === true);

    expect(checkouts.map((step) => step.with)).toEqual([{ 'persist-credentials': false }]);
  });

  it('installs no dependencies while it holds a write token', () => {
    const commands = steps.flatMap((step) => (step.run === undefined ? [] : [step.run])).join('\n');

    expect(commands).not.toMatch(/\b(npm|pnpm|yarn)\s+(ci|install|i)\b/u);
  });

  it('runs the updater script with the default GITHUB_TOKEN and no other secret', () => {
    const updater = steps.filter((step) => step.run?.includes('scripts/pr-branch-update/update-pr-branches.ts') === true);

    expect(updater.map((step) => step.env)).toEqual([
      { GH_TOKEN: '${{ github.token }}', REPOSITORY: '${{ github.repository }}' },
    ]);
    expect(workflowText).not.toContain('secrets.');
  });

  it.each(REQUIRED_CHECK_WORKFLOWS)('can dispatch %s, which reports required checks', (file) => {
    const triggers = TriggerSchema.parse(parse(readText(`.github/workflows/${file}`)));

    expect(Object.keys(triggers.on)).toContain('workflow_dispatch');
  });
});
