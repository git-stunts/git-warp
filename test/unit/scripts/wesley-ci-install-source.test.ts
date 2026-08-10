import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CI_WORKFLOW = readFileSync(
  join(ROOT, '.github/workflows/ci.yml'),
  'utf8',
);
const WESLEY_INSTALL_STEP_NAME =
  "- name: 'Gate 5a: Install pinned Wesley generator'";
const NEXT_STEP_NAME = "- name: 'Gate 5b: Wesley vocabulary IR drift'";

function wesleyInstallStep(): string {
  const start = CI_WORKFLOW.indexOf(WESLEY_INSTALL_STEP_NAME);
  const end = CI_WORKFLOW.indexOf(NEXT_STEP_NAME, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return CI_WORKFLOW.slice(start, end);
}

describe('Wesley CI install source', () => {
  it('installs the exact released CLI from crates.io', () => {
    const step = wesleyInstallStep();

    expect(step).toContain('cargo install');
    expect(step).toContain('--version 0.3.0-alpha.1');
    expect(step).toContain('--locked');
    expect(step).toContain('wesley-cli');
    expect(step).not.toContain('--git');
    expect(step).not.toContain('--rev');
  });
});
