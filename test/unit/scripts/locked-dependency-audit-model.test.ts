import { describe, expect, it } from 'vitest';

import { decodeAuditExceptions } from '../../../scripts/dependency-audit/adapters/AuditExceptionFile.ts';
import { decodeNpmAuditReport } from '../../../scripts/dependency-audit/adapters/decodeNpmAuditReport.ts';
import { decodeNpmViewVersion, decodeNpmViewVersionList } from '../../../scripts/dependency-audit/adapters/decodeNpmView.ts';
import { npmFailureText } from '../../../scripts/dependency-audit/adapters/npmFailureText.ts';
import { AuditAdvisory, type AuditAdvisoryFields } from '../../../scripts/dependency-audit/AuditAdvisory.ts';
import { DISPOSITION, dispositionPasses, type AuditDisposition } from '../../../scripts/dependency-audit/AuditDisposition.ts';
import { AuditException } from '../../../scripts/dependency-audit/AuditException.ts';
import { AuditExceptionList } from '../../../scripts/dependency-audit/AuditExceptionList.ts';
import { AuditRefusal } from '../../../scripts/dependency-audit/AuditRefusal.ts';
import { AuditReport } from '../../../scripts/dependency-audit/AuditReport.ts';
import { AUDIT_SEVERITIES, meetsAuditLevel } from '../../../scripts/dependency-audit/AuditSeverity.ts';
import { AUDIT_TREE, AuditVerdict } from '../../../scripts/dependency-audit/AuditVerdict.ts';
import { CalendarDate } from '../../../scripts/dependency-audit/CalendarDate.ts';
import { LockedAuditOutcome } from '../../../scripts/dependency-audit/LockedAuditOutcome.ts';
import { PublishedVersions } from '../../../scripts/dependency-audit/PublishedVersions.ts';
import { renderVerdictTable } from '../../../scripts/dependency-audit/VerdictTable.ts';
import { exceptionsText, exited, PICOMATCH_EXCEPTION, RECORDED } from './lockedDependencyAuditFixtures.ts';

const DAY = CalendarDate.containing(Date.UTC(2026, 10, 17));
const COMMAND = 'npm audit --json';

function advisory(overrides: Partial<AuditAdvisoryFields> = {}): AuditAdvisory {
  return new AuditAdvisory({
    source: 1247710,
    url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
    packageName: 'picomatch',
    severity: 'high',
    vulnerableRange: '<=4.0.7',
    title: 'picomatch ReDoS',
    ...overrides,
  });
}

function verdict(fields: { advisory: string; disposition: AuditDisposition }): AuditVerdict {
  return new AuditVerdict({ packageName: 'example', severity: 'high', tree: AUDIT_TREE.DEVELOPMENT, details: ['detail'], ...fields });
}

function report(vulnerabilities: Record<string, object>, total: number, dependencies = 3): string {
  return JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities,
    metadata: { vulnerabilities: { total }, dependencies: { total: dependencies } },
  });
}

const HIGH_VIA = { source: 7, name: 'example', title: 'Example', url: 'https://example.com/advisories/7', severity: 'high', range: '<2.0.0' };

describe('CalendarDate', () => {
  it('reads a YYYY-MM-DD day and counts whole days between days', () => {
    const added = CalendarDate.parse('2026-11-17');
    const expires = CalendarDate.parse('2026-12-17');
    expect(added?.iso).toBe('2026-11-17');
    expect(added?.daysUntil(expires ?? DAY)).toBe(30);
    expect(expires?.daysUntil(added ?? DAY)).toBe(-30);
  });

  it.each(['2026-11-7', '2026-11-17T00:00:00Z', '17/11/2026', '', '2026-02-30', '2026-13-01', '0099-01-01'])(
    'refuses %j, which is not an existing YYYY-MM-DD day',
    (text) => {
      expect(CalendarDate.parse(text)).toBeNull();
    },
  );

  it('names the UTC day of an instant, whatever the time of day', () => {
    expect(CalendarDate.containing(Date.UTC(2026, 10, 17, 23, 59, 59, 999)).iso).toBe('2026-11-17');
    expect(CalendarDate.containing(Date.UTC(2026, 10, 18)).iso).toBe('2026-11-18');
  });

  it('refuses an instant that is not finite', () => {
    expect(() => CalendarDate.containing(Number.NaN)).toThrow(RangeError);
  });
});

describe('AuditSeverity and AuditDisposition', () => {
  it('fails every severity from low upwards, like npm audit --audit-level=low', () => {
    expect(AUDIT_SEVERITIES.map((severity) => [severity, meetsAuditLevel(severity)])).toEqual([
      ['info', false], ['low', true], ['moderate', true], ['high', true], ['critical', true],
    ]);
  });

  it('passes only excepted and below-level verdicts', () => {
    const passing = Object.values(DISPOSITION).filter((disposition) => dispositionPasses(disposition));
    expect(passing).toEqual(['excepted', 'below-level']);
  });
});

describe('AuditAdvisory', () => {
  it('takes its identifier from the GitHub advisory URL', () => {
    expect(advisory().id).toBe('GHSA-fc5q-39xc-vjpf');
    expect(advisory().key).toBe('GHSA-fc5q-39xc-vjpf picomatch');
  });

  it.each([
    'https://www.npmjs.com/advisories/1247710',
    'https://github.com/advisories/GHSA-0000-0000-0000',
    'https://github.com/advisories/GHSA-fc5q-39xc-vjpf/extra',
  ])('falls back to npm\'s numeric identifier for %s, so no exception can name it', (url) => {
    expect(advisory({ url }).id).toBe('npm-advisory-1247710');
  });

  it('refuses an advisory without a package or a range', () => {
    expect(() => advisory({ packageName: '' })).toThrow(RangeError);
    expect(() => advisory({ vulnerableRange: '' })).toThrow(RangeError);
  });
});

describe('value invariants', () => {
  it('a report must cover at least one locked package, and lists each advisory and package once', () => {
    expect(() => new AuditReport({ advisories: [], lockedPackages: 0, vulnerablePackages: 0 })).toThrow(RangeError);
    const twice = new AuditReport({ advisories: [advisory(), advisory(), advisory({ packageName: 'other' })], lockedPackages: 2, vulnerablePackages: 2 });
    expect(twice.advisories.map((entry) => entry.key)).toEqual(['GHSA-fc5q-39xc-vjpf picomatch', 'GHSA-fc5q-39xc-vjpf other']);
  });

  it('an exception needs a reason that is not blank', () => {
    const fields = { advisory: 'GHSA-fc5q-39xc-vjpf', packageName: 'picomatch', reason: '  ', added: DAY, expires: DAY, owner: 'o/r#1' };
    expect(() => new AuditException(fields)).toThrow(RangeError);
  });

  it('published versions need a latest version, and a patch is published when the latest is outside the range', () => {
    expect(() => new PublishedVersions({ latest: '', vulnerable: [] })).toThrow(RangeError);
    expect(new PublishedVersions({ latest: '4.0.7', vulnerable: ['4.0.6', '4.0.7'] }).patchPublished).toBe(false);
    expect(new PublishedVersions({ latest: '4.0.8', vulnerable: ['4.0.6', '4.0.7'] }).patchPublished).toBe(true);
  });

  it('a verdict needs a detail, and a refusal needs a reason', () => {
    expect(() => new AuditVerdict({ advisory: 'a', packageName: 'p', severity: 'high', tree: AUDIT_TREE.NONE, disposition: DISPOSITION.STALE, details: [] }))
      .toThrow(RangeError);
    expect(() => new AuditRefusal('')).toThrow(RangeError);
  });
});

describe('AuditExceptionList', () => {
  it('refuses two exceptions for the same advisory and package', () => {
    const decoded = decodeAuditExceptions(exceptionsText([PICOMATCH_EXCEPTION, { ...PICOMATCH_EXCEPTION, reason: 'again' }]));
    expect(decoded).toMatchObject({ reason: 'policy/audit-exceptions.json lists GHSA-fc5q-39xc-vjpf picomatch more than once' });
  });

  it('finds the exception that covers an advisory, matching both advisory and package', () => {
    const list = decodeAuditExceptions(exceptionsText([PICOMATCH_EXCEPTION]));
    expect(list).toBeInstanceOf(AuditExceptionList);
    expect(list instanceof AuditExceptionList && list.find(advisory())?.owner).toBe('git-stunts/git-warp#1194');
    expect(list instanceof AuditExceptionList && list.find(advisory({ packageName: 'other' }))).toBeUndefined();
  });
});

describe('decodeAuditExceptions', () => {
  it('decodes the committed shape into exceptions with calendar dates', () => {
    const list = decodeAuditExceptions(exceptionsText([PICOMATCH_EXCEPTION]));
    expect(list).toMatchObject({ exceptions: [{ advisory: 'GHSA-fc5q-39xc-vjpf', packageName: 'picomatch', added: { iso: '2026-11-17' }, expires: { iso: '2026-12-17' } }] });
  });

  it('accepts an empty list, the normal state', () => {
    expect(decodeAuditExceptions(exceptionsText([]))).toMatchObject({ exceptions: [] });
  });

  it('refuses text that is not JSON', () => {
    expect(decodeAuditExceptions('{')).toMatchObject({ reason: 'policy/audit-exceptions.json is not JSON' });
  });

  it.each([
    ['an unknown top-level key', { exceptions: [], allow: true }, 'Unrecognized key: "allow"'],
    ['an unknown entry key', { exceptions: [{ ...PICOMATCH_EXCEPTION, severity: 'high' }] }, 'exceptions.0: Unrecognized key: "severity"'],
    ['a malformed GHSA identifier', { exceptions: [{ ...PICOMATCH_EXCEPTION, advisory: 'CVE-2026-0001' }] }, 'exceptions.0.advisory: must be a GHSA identifier such as GHSA-fc5q-39xc-vjpf'],
    ['a package name npm does not allow', { exceptions: [{ ...PICOMATCH_EXCEPTION, package: 'PicoMatch' }] }, 'exceptions.0.package: must be an npm package name'],
    ['a blank reason', { exceptions: [{ ...PICOMATCH_EXCEPTION, reason: ' ' }] }, 'exceptions.0.reason: must not be empty'],
    ['a day that does not exist', { exceptions: [{ ...PICOMATCH_EXCEPTION, expires: '2026-02-30' }] }, 'exceptions.0.expires: 2026-02-30 is not a calendar date (YYYY-MM-DD)'],
    ['an owner that is not owner/repo#N', { exceptions: [{ ...PICOMATCH_EXCEPTION, owner: '#1194' }] }, 'exceptions.0.owner: must be an owner/repo#N issue or pull request reference'],
    ['a missing field', { exceptions: [{ ...PICOMATCH_EXCEPTION, owner: undefined }] }, 'exceptions.0.owner: Invalid input: expected string, received undefined'],
  ])('refuses %s', (_name, document, issue) => {
    expect(decodeAuditExceptions(JSON.stringify(document))).toMatchObject({ reason: `policy/audit-exceptions.json is invalid: ${issue}` });
  });
});

describe('decodeNpmAuditReport', () => {
  it('reads the recorded full-tree report as one advisory over 15 vulnerable packages', () => {
    const decoded = decodeNpmAuditReport(RECORDED.fullTree, COMMAND);
    expect(decoded).toMatchObject({
      advisories: [{ id: 'GHSA-fc5q-39xc-vjpf', packageName: 'picomatch', severity: 'high', vulnerableRange: '<=4.0.7' }],
      lockedPackages: 547,
      vulnerablePackages: 15,
    });
  });

  it('refuses output that is not JSON', () => {
    expect(decodeNpmAuditReport('npm error', COMMAND)).toMatchObject({ reason: 'npm audit --json did not print JSON' });
  });

  it('refuses JSON that is not a report and carries no npm message', () => {
    expect(decodeNpmAuditReport('{"auditReportVersion":1}', COMMAND))
      .toMatchObject({ reason: 'npm audit --json did not print an audit report: npm printed no error message' });
  });

  it('refuses a report whose metadata count differs from its list', () => {
    expect(decodeNpmAuditReport(report({ example: { name: 'example', severity: 'high', via: [HIGH_VIA] } }, 2), COMMAND))
      .toMatchObject({ reason: 'npm audit --json printed an inconsistent report: metadata counts 2 vulnerable packages, but 1 are listed' });
  });

  it('refuses a report that reaches a vulnerability through a package it does not list', () => {
    expect(decodeNpmAuditReport(report({ example: { name: 'example', severity: 'high', via: ['missing'] } }, 1), COMMAND))
      .toMatchObject({ reason: 'npm audit --json printed an inconsistent report: a vulnerability is reached through missing, which the report does not list' });
  });

  it('refuses a report that audited no locked package', () => {
    expect(decodeNpmAuditReport(report({}, 0, 0), COMMAND))
      .toMatchObject({ reason: 'npm audit --json printed an inconsistent report: it audited no locked package' });
  });

  it('keeps an advisory without a GHSA URL under npm\'s numeric identifier', () => {
    expect(decodeNpmAuditReport(report({ example: { name: 'example', severity: 'high', via: [HIGH_VIA] } }, 1), COMMAND))
      .toMatchObject({ advisories: [{ id: 'npm-advisory-7', packageName: 'example' }] });
  });
});

describe('decodeNpmView', () => {
  it('reads the recorded latest version and the recorded versions inside the range', () => {
    expect(decodeNpmViewVersion(exited(RECORDED.viewLatest, 0), 'npm view')).toBe('4.0.7');
    const versions = decodeNpmViewVersionList(exited(RECORDED.viewRange, 0), 'npm view');
    expect(Array.isArray(versions) && versions.length).toBe(35);
    expect(Array.isArray(versions) && versions.includes('4.0.7')).toBe(true);
  });

  it('reads one matching version, which npm prints as a string, as a list of one', () => {
    expect(decodeNpmViewVersionList(exited('"4.0.7"\n', 0), 'npm view')).toEqual(['4.0.7']);
  });

  it('refuses the recorded no-match answer with npm\'s summary', () => {
    expect(decodeNpmViewVersionList(exited(RECORDED.viewNoMatch, 1), 'npm view'))
      .toMatchObject({ reason: 'npm view failed with exit code 1: No match found for version >=99.0.0' });
  });

  it('refuses output that is not JSON, even with exit code 0', () => {
    expect(decodeNpmViewVersion(exited('', 0), 'npm view'))
      .toMatchObject({ reason: 'npm view failed with exit code 0: npm printed no error message' });
  });

  it('refuses JSON that is not a version', () => {
    expect(decodeNpmViewVersion(exited('["4.0.7"]', 0), 'npm view')).toMatchObject({ reason: 'npm view did not print a version' });
    expect(decodeNpmViewVersionList(exited('[]', 0), 'npm view')).toMatchObject({ reason: 'npm view did not print a version' });
  });
});

describe('npmFailureText', () => {
  it.each([
    ['the top-level message', { message: 'request failed', error: { summary: 'ignored' } }, 'request failed'],
    ['the error summary when the message is empty', { message: '', error: { summary: 'No match' } }, 'No match'],
    ['a default when neither has text', { message: '', error: { summary: '' } }, 'npm printed no error message'],
    ['a default when there is no error object', {}, 'npm printed no error message'],
    ['a default for a value that is not an npm failure', 42, 'npm printed no error message'],
  ])('uses %s', (_name, value, expected) => {
    expect(npmFailureText(value)).toBe(expected);
  });
});

describe('LockedAuditOutcome and the verdict table', () => {
  const reports = {
    published: new AuditReport({ advisories: [], lockedPackages: 1, vulnerablePackages: 0 }),
    full: new AuditReport({ advisories: [], lockedPackages: 1, vulnerablePackages: 0 }),
  };

  it('lists failed verdicts first, each group by advisory', () => {
    const outcome = new LockedAuditOutcome({
      ...reports,
      exceptionCount: 0,
      verdicts: [
        verdict({ advisory: 'GHSA-b', disposition: DISPOSITION.EXCEPTED }),
        verdict({ advisory: 'GHSA-c', disposition: DISPOSITION.UNLISTED }),
        verdict({ advisory: 'GHSA-a', disposition: DISPOSITION.BELOW_LEVEL }),
        verdict({ advisory: 'GHSA-d', disposition: DISPOSITION.STALE }),
      ],
    });
    expect(outcome.verdicts.map((entry) => entry.advisory)).toEqual(['GHSA-c', 'GHSA-d', 'GHSA-a', 'GHSA-b']);
    expect(outcome.failures).toBe(2);
    expect(outcome.exitCode).toBe(1);
  });

  it('prints only the header for no verdicts', () => {
    expect(renderVerdictTable([])).toEqual(['RESULT  ADVISORY  PACKAGE  SEVERITY  TREE  DISPOSITION  DETAIL']);
  });

  it('pads each column to its widest cell and joins details with semicolons', () => {
    const wide = new AuditVerdict({
      advisory: 'GHSA-long-advisory',
      packageName: 'p',
      severity: 'high',
      tree: AUDIT_TREE.PUBLISHED,
      disposition: DISPOSITION.PUBLISHED,
      details: ['first', 'second'],
    });
    expect(renderVerdictTable([wide])).toEqual([
      'RESULT  ADVISORY            PACKAGE  SEVERITY  TREE       DISPOSITION  DETAIL',
      'FAIL    GHSA-long-advisory  p        high      published  published    first; second',
    ]);
  });
});
