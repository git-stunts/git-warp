import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const hookPath = fileURLToPath(new URL('../../../scripts/hooks/pre-push', import.meta.url));
const hookSource = readFileSync(hookPath, 'utf8');

describe('scripts/hooks/pre-push', () => {
  it('documents seven parallel gates before unit tests', () => {
    expect(hookSource).toContain('# Seven gates in parallel, then unit tests. ALL must pass or push is blocked.');
    expect(hookSource).toContain('echo "[Gates 1-7] Running lint + typecheck + policy + consumer type test + surface validator + markdown gates..."');
    expect(hookSource).toContain('echo "[Gate 8] Running unit tests..."');
  });

  it('keeps quick mode tied to Gate 8', () => {
    expect(hookSource).toContain('echo "WARP_QUICK_PUSH: quick mode active — Gate 8 (unit tests) will be skipped"');
    expect(hookSource).toContain('echo "[Gate 8] Skipped (WARP_QUICK_PUSH quick mode)"');
  });

  it('keeps explicit failure labels aligned for every gate', () => {
    expect(hookSource).toContain('BLOCKED — Gate 1 FAILED: TypeScript compiler (strict mode)');
    expect(hookSource).toContain('BLOCKED — Gate 2 FAILED: IRONCLAD policy (any/wildcard/ts-ignore ban)');
    expect(hookSource).toContain('BLOCKED — Gate 3 FAILED: Consumer type surface test');
    expect(hookSource).toContain('BLOCKED — Gate 4 FAILED: ESLint (includes no-explicit-any, no-unsafe-*)');
    expect(hookSource).toContain('BLOCKED — Gate 5 FAILED: Declaration surface validator');
    expect(hookSource).toContain('BLOCKED — Gate 6 FAILED: Markdown lint');
    expect(hookSource).toContain('BLOCKED — Gate 7 FAILED: Markdown JS/TS code-sample syntax check');
    expect(hookSource).toContain('BLOCKED — Gate 8 FAILED: Unit tests');
  });
});
