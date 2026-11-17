import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import packageJson from '../../../package.json' with { type: 'json' };

// Oracle: docs/ANTI_SLUDGE_DECISIONS.md section 5 puts the determinism gate in
// the pre-push hook and CI; both reach it through `npm run lint`.
const CI_WORKFLOW = readFileSync(fileURLToPath(new URL('../../../.github/workflows/ci.yml', import.meta.url)), 'utf8');
const PRE_PUSH_HOOK = readFileSync(fileURLToPath(new URL('../../../scripts/hooks/pre-push', import.meta.url)), 'utf8');
const LINT_JOB_START = '\n  type-firewall-lint:\n';
const NEXT_JOB = /\n {2}[a-z][\w-]*:\n/g;

function ciLintJob(): string {
  const start = CI_WORKFLOW.indexOf(LINT_JOB_START);
  expect(start).toBeGreaterThanOrEqual(0);
  NEXT_JOB.lastIndex = start + LINT_JOB_START.length;
  const end = NEXT_JOB.exec(CI_WORKFLOW)?.index ?? CI_WORKFLOW.length;
  return CI_WORKFLOW.slice(start, end);
}

describe('determinism gate wiring', () => {
  it('npm run lint:determinism runs scripts/ban-nondeterminism.ts', () => {
    expect(packageJson.scripts['lint:determinism']).toBe('node scripts/ban-nondeterminism.ts');
  });

  it('npm run lint chains npm run lint:determinism', () => {
    expect(packageJson.scripts.lint).toContain('&& npm run lint:determinism');
  });

  it('the CI lint job runs npm run lint', () => {
    expect(ciLintJob()).toMatch(/\n\s+run: npm run lint\n/);
  });

  it('the pre-push hook runs npm run lint', () => {
    expect(PRE_PUSH_HOOK).toContain('run_tool "$NPM_LAUNCHER" "$NPM_BIN" run lint &');
  });
});
