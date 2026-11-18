import { describe, expect, it } from 'vitest';

import { NpmCli } from '../../../scripts/dependency-audit/adapters/NpmCli.ts';
import type { AuditExceptionList } from '../../../scripts/dependency-audit/AuditExceptionList.ts';
import { AuditRefusal } from '../../../scripts/dependency-audit/AuditRefusal.ts';
import { CalendarDate } from '../../../scripts/dependency-audit/CalendarDate.ts';
import { LockedAuditGate } from '../../../scripts/dependency-audit/LockedAuditGate.ts';
import { LockedAuditOutcome } from '../../../scripts/dependency-audit/LockedAuditOutcome.ts';
import {
  exceptionList,
  exited,
  NPM_COMMAND,
  PICOMATCH_ADVISORY,
  PICOMATCH_EXCEPTION,
  RECORDED,
  RecordedNpm,
  SYNTHETIC,
} from './lockedDependencyAuditFixtures.ts';

// Oracle for every case: the gate rules in docs/operations/dependency-audit.md
// ("Development-dependency exceptions"), written before these tests.
const TODAY = CalendarDate.containing(Date.UTC(2026, 10, 18));
const DAY_AFTER_EXPIRY = CalendarDate.containing(Date.UTC(2026, 11, 18));
const EXPIRY_DAY = CalendarDate.containing(Date.UTC(2026, 11, 17));

/** An info-severity advisory that no real lock carries; synthetic. */
const INFO_ADVISORY = 'GHSA-2222-3333-4444';
const INFO_REPORT = JSON.stringify({
  auditReportVersion: 2,
  vulnerabilities: {
    'example-info': {
      name: 'example-info',
      severity: 'info',
      via: [{
        source: 1,
        name: 'example-info',
        title: 'Informational notice',
        url: `https://github.com/advisories/${INFO_ADVISORY}`,
        severity: 'info',
        range: '<1.0.0',
      }],
    },
  },
  metadata: { vulnerabilities: { total: 1 }, dependencies: { total: 3 } },
});

async function evaluate(npm: RecordedNpm, exceptions: AuditExceptionList, today: CalendarDate = TODAY) {
  const cli = new NpmCli(npm);
  return await new LockedAuditGate({ audits: cli, registry: cli }).evaluate(exceptions, today);
}

async function outcomeOf(npm: RecordedNpm, exceptions: AuditExceptionList, today: CalendarDate = TODAY) {
  const result = await evaluate(npm, exceptions, today);
  expect(result).toBeInstanceOf(LockedAuditOutcome);
  if (!(result instanceof LockedAuditOutcome)) {
    throw new Error(`expected an outcome, received a refusal: ${result.reason}`);
  }
  return result;
}

describe('locked dependency audit on the recorded origin/main lock', () => {
  it('fails without an exception, as the unchanged gate does on main (RED)', async () => {
    const outcome = await outcomeOf(new RecordedNpm(), exceptionList([]));
    expect(outcome.exitCode).toBe(1);
    expect(outcome.verdicts).toMatchObject([
      { advisory: PICOMATCH_ADVISORY, packageName: 'picomatch', severity: 'high', tree: 'development', disposition: 'unlisted' },
    ]);
  });

  it('passes with the picomatch exception while no patched picomatch is published (GREEN)', async () => {
    const outcome = await outcomeOf(new RecordedNpm(), exceptionList([PICOMATCH_EXCEPTION]));
    expect(outcome.exitCode).toBe(0);
    expect(outcome.verdicts).toMatchObject([{ advisory: PICOMATCH_ADVISORY, tree: 'development', disposition: 'excepted' }]);
    expect(outcome.verdicts[0]?.details).toEqual([
      'expires 2026-12-17 (29 days left)',
      'owner git-stunts/git-warp#1194',
      'latest picomatch 4.0.7 is inside <=4.0.7',
      'reason: dev-only toolchain; no patched picomatch version',
    ]);
  });

  it('asks the registry about an excepted advisory only', async () => {
    const npm = new RecordedNpm();
    await evaluate(npm, exceptionList([PICOMATCH_EXCEPTION]));
    expect(npm.commands).toEqual([NPM_COMMAND.PUBLISHED, NPM_COMMAND.FULL, NPM_COMMAND.LATEST, NPM_COMMAND.RANGE]);
  });

  it('does not ask the registry about an unlisted advisory', async () => {
    const npm = new RecordedNpm();
    await evaluate(npm, exceptionList([]));
    expect(npm.commands).toEqual([NPM_COMMAND.PUBLISHED, NPM_COMMAND.FULL]);
  });

  it('applies an exception on its expiry day', async () => {
    const outcome = await outcomeOf(new RecordedNpm(), exceptionList([PICOMATCH_EXCEPTION]), EXPIRY_DAY);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.verdicts[0]?.details[0]).toBe('expires 2026-12-17 (0 days left)');
  });

  it('applies an exception whose expiry is exactly 30 days after it was added', async () => {
    const outcome = await outcomeOf(new RecordedNpm(), exceptionList([{ ...PICOMATCH_EXCEPTION, added: '2026-11-18', expires: '2026-12-18' }]));
    expect(outcome.verdicts).toMatchObject([{ disposition: 'excepted' }]);
  });
});

describe('calibration: each rule fails the gate on its own', () => {
  it('(a) fails an advisory in the published tree even when an exception lists it', async () => {
    const npm = new RecordedNpm([[NPM_COMMAND.PUBLISHED, exited(SYNTHETIC.publishedTreePicomatch, 1)]]);
    const outcome = await outcomeOf(npm, exceptionList([PICOMATCH_EXCEPTION]));
    expect(outcome.exitCode).toBe(1);
    expect(outcome.verdicts).toMatchObject([{ advisory: PICOMATCH_ADVISORY, tree: 'published', disposition: 'published' }]);
    expect(outcome.verdicts[0]?.details).toEqual([
      'picomatch vulnerable to ReDoS through single-branch repeated extglobs',
      'reaches the published tree',
      'policy/audit-exceptions.json lists it, but no exception applies to the published tree',
    ]);
  });

  it('(a) fails an advisory in the published tree that no exception lists', async () => {
    const npm = new RecordedNpm([[NPM_COMMAND.PUBLISHED, exited(SYNTHETIC.publishedTreePicomatch, 1)]]);
    const outcome = await outcomeOf(npm, exceptionList([]));
    expect(outcome.exitCode).toBe(1);
    expect(outcome.verdicts).toMatchObject([{ disposition: 'published', details: ['picomatch vulnerable to ReDoS through single-branch repeated extglobs', 'reaches the published tree'] }]);
  });

  it('(b) fails a development advisory that no exception lists', async () => {
    const outcome = await outcomeOf(new RecordedNpm(), exceptionList([]));
    expect(outcome.exitCode).toBe(1);
    expect(outcome.verdicts[0]?.details).toEqual([
      'picomatch vulnerable to ReDoS through single-branch repeated extglobs',
      'no exception in policy/audit-exceptions.json',
    ]);
  });

  it('(c) fails an exception on the day after its expiry', async () => {
    const outcome = await outcomeOf(new RecordedNpm(), exceptionList([PICOMATCH_EXCEPTION]), DAY_AFTER_EXPIRY);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.verdicts).toMatchObject([{ disposition: 'expired', details: ['expired after 2026-12-17', 'owner git-stunts/git-warp#1194'] }]);
  });

  it('(d) fails an exception once the registry publishes a version outside the advisory range', async () => {
    // Synthetic registry answer: a picomatch 4.0.8 that the recorded <=4.0.7 range does not cover.
    const npm = new RecordedNpm([[NPM_COMMAND.LATEST, exited('"4.0.8"\n', 0)]]);
    const outcome = await outcomeOf(npm, exceptionList([PICOMATCH_EXCEPTION]));
    expect(outcome.exitCode).toBe(1);
    expect(outcome.verdicts).toMatchObject([{
      disposition: 'patched',
      details: ['picomatch 4.0.8 is published outside <=4.0.7; fix the dependency instead', 'owner git-stunts/git-warp#1194'],
    }]);
  });

  it('(e) fails an exception that matches no advisory', async () => {
    const npm = new RecordedNpm([[NPM_COMMAND.FULL, exited(SYNTHETIC.fullTreeClean, 0)]]);
    const outcome = await outcomeOf(npm, exceptionList([PICOMATCH_EXCEPTION]));
    expect(outcome.exitCode).toBe(1);
    expect(outcome.verdicts).toMatchObject([{
      advisory: PICOMATCH_ADVISORY,
      packageName: 'picomatch',
      severity: '-',
      tree: '-',
      disposition: 'stale',
      details: ['no advisory at or above low matches; remove the exception', 'owner git-stunts/git-warp#1194'],
    }]);
  });

  it('(f) fails an exception whose expiry is more than 30 days after it was added', async () => {
    const outcome = await outcomeOf(new RecordedNpm(), exceptionList([{ ...PICOMATCH_EXCEPTION, expires: '2026-12-18' }]));
    expect(outcome.exitCode).toBe(1);
    expect(outcome.verdicts).toMatchObject([{
      disposition: 'invalid-window',
      details: ['expires 31 days after it was added; the limit is 30', 'owner git-stunts/git-warp#1194'],
    }]);
  });

  it('fails an exception that was added after today', async () => {
    const outcome = await outcomeOf(new RecordedNpm(), exceptionList([{ ...PICOMATCH_EXCEPTION, added: '2026-11-19', expires: '2026-11-30' }]));
    expect(outcome.verdicts).toMatchObject([{ disposition: 'invalid-window', details: ['added 2026-11-19, which is after today (2026-11-18)', 'owner git-stunts/git-warp#1194'] }]);
  });

  it('reports every problem, window problems first, when an exception expires before it was added', async () => {
    const outcome = await outcomeOf(new RecordedNpm(), exceptionList([{ ...PICOMATCH_EXCEPTION, expires: '2026-11-16' }]));
    expect(outcome.verdicts).toMatchObject([{
      disposition: 'invalid-window',
      details: ['expires 2026-11-16, before it was added (2026-11-17)', 'expired after 2026-11-16', 'owner git-stunts/git-warp#1194'],
    }]);
  });
});

describe('advisories below the audit level', () => {
  it('passes an info advisory, as npm audit --audit-level=low does', async () => {
    const npm = new RecordedNpm([[NPM_COMMAND.FULL, exited(INFO_REPORT, 1)]]);
    const outcome = await outcomeOf(npm, exceptionList([]));
    expect(outcome.exitCode).toBe(0);
    expect(outcome.verdicts).toMatchObject([{ advisory: INFO_ADVISORY, severity: 'info', disposition: 'below-level', details: ['below the audit level (low)'] }]);
  });

  it('fails an exception for an info advisory as stale', async () => {
    const npm = new RecordedNpm([[NPM_COMMAND.FULL, exited(INFO_REPORT, 1)]]);
    const outcome = await outcomeOf(npm, exceptionList([{ ...PICOMATCH_EXCEPTION, advisory: INFO_ADVISORY, package: 'example-info' }]));
    expect(outcome.exitCode).toBe(1);
    expect(outcome.verdicts.map((verdict) => verdict.disposition)).toEqual(['stale', 'below-level']);
  });

  it('passes a lock with no advisories and no exceptions', async () => {
    const npm = new RecordedNpm([[NPM_COMMAND.FULL, exited(SYNTHETIC.fullTreeClean, 0)]]);
    const outcome = await outcomeOf(npm, exceptionList([]));
    expect(outcome.exitCode).toBe(0);
    expect(outcome.verdicts).toEqual([]);
  });
});

describe('refusals', () => {
  it('refuses when npm cannot reach the audit endpoint', async () => {
    const npm = new RecordedNpm([[NPM_COMMAND.PUBLISHED, exited(RECORDED.networkFailure, 1)]]);
    const result = await evaluate(npm, exceptionList([PICOMATCH_EXCEPTION]));
    expect(result).toBeInstanceOf(AuditRefusal);
    expect(result.exitCode).toBe(2);
    expect(result.reportLines()).toEqual([
      'audit:locked: REFUSED: npm audit --json --omit=dev did not print an audit report: '
      + 'request to http://127.0.0.1:9/-/npm/v1/security/audits/quick failed, reason: connect ECONNREFUSED 127.0.0.1:9',
    ]);
  });

  it('refuses when the full audit does not run', async () => {
    const npm = new RecordedNpm([[NPM_COMMAND.FULL, new AuditRefusal('npm did not exit normally: spawn npm ENOENT')]]);
    const result = await evaluate(npm, exceptionList([PICOMATCH_EXCEPTION]));
    expect(result).toMatchObject({ reason: 'npm did not exit normally: spawn npm ENOENT', exitCode: 2 });
  });

  it('refuses when the registry cannot name the latest version', async () => {
    const npm = new RecordedNpm([[NPM_COMMAND.LATEST, new AuditRefusal('npm did not exit normally: killed')]]);
    const result = await evaluate(npm, exceptionList([PICOMATCH_EXCEPTION]));
    expect(result).toMatchObject({ reason: 'npm did not exit normally: killed' });
  });

  it('refuses when the registry cannot list the versions inside the advisory range', async () => {
    // The recorded E404 answer stands in for any registry failure of the range query.
    const npm = new RecordedNpm([[NPM_COMMAND.RANGE, exited(RECORDED.viewNoMatch, 1)]]);
    const result = await evaluate(npm, exceptionList([PICOMATCH_EXCEPTION]));
    expect(result).toMatchObject({
      reason: 'npm view picomatch@<=4.0.7 version --json failed with exit code 1: No match found for version >=99.0.0',
    });
  });
});

describe('report', () => {
  it('prints the audit scope, a table with one row for each verdict, and the result', async () => {
    const outcome = await outcomeOf(new RecordedNpm(), exceptionList([PICOMATCH_EXCEPTION]));
    const lines = outcome.reportLines();
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('audit:locked: audit level low. '
      + 'Published tree (npm audit --omit=dev): advisories 0, vulnerable packages 0. '
      + 'Full tree (npm audit): advisories 1, vulnerable packages 15, locked packages 547. '
      + 'Exceptions in policy/audit-exceptions.json: 1.');
    expect(lines[1]).toBe('RESULT  ADVISORY             PACKAGE    SEVERITY  TREE         DISPOSITION  DETAIL');
    expect(lines[2]).toBe('PASS    GHSA-fc5q-39xc-vjpf  picomatch  high      development  excepted     '
      + 'expires 2026-12-17 (29 days left); owner git-stunts/git-warp#1194; latest picomatch 4.0.7 is inside <=4.0.7; '
      + 'reason: dev-only toolchain; no patched picomatch version');
    expect(lines[3]).toBe('audit:locked: PASSED: excepted 1, below the audit level 0, failed 0.');
  });

  it('ends a failed run with the failure count', async () => {
    const outcome = await outcomeOf(new RecordedNpm(), exceptionList([]));
    expect(outcome.reportLines().at(-1)).toBe('audit:locked: FAILED: 1 of 1 rows failed. '
      + 'Run npm audit for the dependency paths; the rules are in docs/operations/dependency-audit.md.');
  });
});
