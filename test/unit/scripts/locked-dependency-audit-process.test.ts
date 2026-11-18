import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import packageJson from '../../../package.json' with { type: 'json' };
import { decodeAuditExceptions, readAuditExceptions } from '../../../scripts/dependency-audit/adapters/AuditExceptionFile.ts';
import { ExecFileCommandRunner } from '../../../scripts/dependency-audit/adapters/ExecFileCommandRunner.ts';
import { MAX_EXCEPTION_DAYS } from '../../../scripts/dependency-audit/AuditException.ts';
import { AuditExceptionList } from '../../../scripts/dependency-audit/AuditExceptionList.ts';
import { CalendarDate } from '../../../scripts/dependency-audit/CalendarDate.ts';
import { runLockedAudit } from '../../../scripts/dependency-audit/runLockedAudit.ts';
import { exceptionsText, NPM_COMMAND, PICOMATCH_EXCEPTION, RecordedNpm } from './lockedDependencyAuditFixtures.ts';

const TODAY = CalendarDate.containing(Date.UTC(2026, 10, 18));
const COMMITTED_EXCEPTIONS = readFileSync(new URL('../../../policy/audit-exceptions.json', import.meta.url), 'utf8');
const roots: string[] = [];

function scratchRoot(exceptions: string | null): string {
  const root = mkdtempSync(join(tmpdir(), 'git-warp-locked-audit-'));
  roots.push(root);
  if (exceptions !== null) {
    mkdirSync(join(root, 'policy'));
    writeFileSync(join(root, 'policy', 'audit-exceptions.json'), exceptions);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('ExecFileCommandRunner', () => {
  it('returns the output of a command that exits 0', async () => {
    const runner = new ExecFileCommandRunner(scratchRoot(null));
    const result = await runner.run(process.execPath, ['-e', 'process.stdout.write("out"); process.stderr.write("err")']);
    expect(result).toEqual({ exitCode: 0, stdout: 'out', stderr: 'err' });
  });

  it('returns a nonzero exit code as a result, because npm audit exits 1 when it finds advisories', async () => {
    const runner = new ExecFileCommandRunner(scratchRoot(null));
    const result = await runner.run(process.execPath, ['-e', 'process.stdout.write("{}"); process.exit(3)']);
    expect(result).toEqual({ exitCode: 3, stdout: '{}', stderr: '' });
  });

  it('runs the command in its working directory', async () => {
    const runner = new ExecFileCommandRunner(scratchRoot(null));
    const result = await runner.run(process.execPath, ['-e', 'process.stdout.write(process.cwd())']);
    expect(result).toMatchObject({ exitCode: 0, stdout: expect.stringContaining('git-warp-locked-audit-') });
  });

  it('refuses a command that does not start', async () => {
    const runner = new ExecFileCommandRunner(scratchRoot(null));
    const result = await runner.run('git-warp-no-such-command-5c1d', []);
    expect(result).toMatchObject({ exitCode: 2 });
    expect(result).toHaveProperty('reason', expect.stringMatching(/^git-warp-no-such-command-5c1d did not exit normally: .*ENOENT/u));
  });

  it('refuses a command that a signal stops', async () => {
    const runner = new ExecFileCommandRunner(scratchRoot(null));
    const result = await runner.run(process.execPath, ['-e', 'process.kill(process.pid, "SIGKILL")']);
    expect(result).toHaveProperty('reason', expect.stringContaining('did not exit normally'));
  });
});

describe('readAuditExceptions', () => {
  it('reads policy/audit-exceptions.json under the root', async () => {
    const list = await readAuditExceptions(scratchRoot(exceptionsText([PICOMATCH_EXCEPTION])));
    expect(list).toBeInstanceOf(AuditExceptionList);
    expect(list).toMatchObject({ exceptions: [{ advisory: 'GHSA-fc5q-39xc-vjpf' }] });
  });

  it('refuses when the file is missing', async () => {
    const refusal = await readAuditExceptions(scratchRoot(null));
    expect(refusal).toHaveProperty('reason', expect.stringMatching(/^cannot read policy\/audit-exceptions\.json: Error: ENOENT/u));
  });
});

describe('runLockedAudit', () => {
  it('passes the recorded lock with the committed exception list', async () => {
    const npm = new RecordedNpm();
    const run = await runLockedAudit({ root: scratchRoot(COMMITTED_EXCEPTIONS), today: TODAY, runner: npm });
    expect(run.exitCode).toBe(0);
    expect(run.reportLines.at(-1)).toBe('audit:locked: PASSED: excepted 1, below the audit level 0, failed 0.');
    expect(npm.commands).toEqual([NPM_COMMAND.PUBLISHED, NPM_COMMAND.FULL, NPM_COMMAND.LATEST, NPM_COMMAND.RANGE]);
  });

  it('refuses before it runs npm when the exception list cannot be read', async () => {
    const npm = new RecordedNpm();
    const run = await runLockedAudit({ root: scratchRoot('[]'), today: TODAY, runner: npm });
    expect(run.exitCode).toBe(2);
    expect(run.reportLines).toEqual([
      'audit:locked: REFUSED: policy/audit-exceptions.json is invalid: Invalid input: expected object, received array',
    ]);
    expect(npm.commands).toEqual([]);
  });
});

describe('committed exception list', () => {
  const committed = decodeAuditExceptions(COMMITTED_EXCEPTIONS);

  it('decodes', () => {
    expect(committed).toBeInstanceOf(AuditExceptionList);
  });

  // No wall clock here: whether an exception has expired is the gate's job in CI.
  it(`gives every exception an expiry from 0 to ${MAX_EXCEPTION_DAYS} days after it was added`, () => {
    const exceptions = committed instanceof AuditExceptionList ? committed.exceptions : [];
    const windows = exceptions.map((exception) => exception.added.daysUntil(exception.expires));
    expect(windows.filter((days) => days < 0 || days > MAX_EXCEPTION_DAYS)).toEqual([]);
  });
});

describe('wiring', () => {
  it('npm run audit:locked runs the gate script', () => {
    expect(packageJson.scripts['audit:locked']).toBe('node scripts/dependency-audit/check-locked-audit.ts');
  });
});
