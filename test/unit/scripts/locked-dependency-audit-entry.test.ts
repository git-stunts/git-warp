import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LockedAuditContext } from '../../../scripts/dependency-audit/runLockedAudit.ts';

// The entry point only composes the clock, the repository root and the command
// runner, prints the report and sets the exit code. The composition it calls
// is replaced here so that importing the entry runs no npm command.
const composition = vi.hoisted(() => ({ contexts: new Array<LockedAuditContext>() }));

vi.mock('../../../scripts/dependency-audit/runLockedAudit.ts', () => ({
  runLockedAudit: (context: LockedAuditContext) => {
    composition.contexts.push(context);
    return Promise.resolve({ reportLines: ['audit:locked: first line', 'audit:locked: FAILED'], exitCode: 1 });
  },
}));

const exitCodeBefore = process.exitCode;

afterEach(() => {
  process.exitCode = exitCodeBefore;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('check-locked-audit entry point', () => {
  it('prints the report, sets the exit code, and checks exceptions against the UTC day of the clock', async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 18, 23, 59, 59) });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await import('../../../scripts/dependency-audit/check-locked-audit.ts');

    expect(log).toHaveBeenCalledWith('audit:locked: first line\naudit:locked: FAILED');
    expect(process.exitCode).toBe(1);
    expect(composition.contexts).toHaveLength(1);
    expect(composition.contexts[0]?.today.iso).toBe('2026-11-18');
    expect(composition.contexts[0]?.root).toBe(fileURLToPath(new URL('../../../', import.meta.url)));
  });
});
