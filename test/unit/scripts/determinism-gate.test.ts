import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { DeterminismBan } from '../../../scripts/determinism/DeterminismBan.ts';
import { DeterminismScan } from '../../../scripts/determinism/DeterminismScan.ts';
import { DeterminismScanRefusal } from '../../../scripts/determinism/DeterminismScanRefusal.ts';
import { DeterminismViolation } from '../../../scripts/determinism/DeterminismViolation.ts';
import { DOMAIN_DETERMINISM_BANS } from '../../../scripts/determinism/DomainDeterminismBans.ts';
import { DomainDeterminismGate } from '../../../scripts/determinism/DomainDeterminismGate.ts';
import { InlineQuarantine } from '../../../scripts/determinism/InlineQuarantine.ts';
import { listDomainFiles } from '../../../scripts/determinism/listDomainFiles.ts';
import { runDeterminismGate } from '../../../scripts/determinism/runDeterminismGate.ts';

const JSON_LABEL = 'JSON.stringify() — use canonicalStringify for deterministic output';
const JSON_RULE = 'ts-no-json-stringify-in-core';

// Oracle: docs/ANTI_SLUDGE_POLICY.md section 9 (wall clock, randomness, timers,
// env) plus the gate's pre-TypeScript pattern table, one sample line per ban.
const BAN_SAMPLES: readonly (readonly [label: string, sample: string])[] = [
  ['Date.now()', 'const at = Date.now();'],
  ['new Date()', 'const at = new Date();'],
  ['performance.now()', 'const t = performance.now();'],
  ['Math.random()', 'const r = Math.random();'],
  ['crypto.randomUUID()', 'const id = crypto.randomUUID();'],
  ['crypto.getRandomValues()', 'crypto.getRandomValues(bytes);'],
  [JSON_LABEL, 'const text = JSON.stringify(value);'],
  ['process.env', 'const home = process.env.HOME;'],
  ['process.pid', 'const pid = process.pid;'],
  ['process.hrtime', 'const t = process.hrtime.bigint();'],
  ['setTimeout — use ClockPort', 'setTimeout(tick, 10);'],
  ['setInterval — use ClockPort', 'setInterval(tick, 10);'],
];

// Every extension a JavaScript or TypeScript source can carry, plus none.
const SOURCE_FILE_NAMES = [
  'Probe.ts', 'Probe.mts', 'Probe.cts', 'Probe.tsx', 'Probe.d.ts',
  'Probe.js', 'Probe.mjs', 'Probe.cjs', 'Probe.jsx', 'Probe',
];

const fixtureRoots: string[] = [];

function createRoot(files: readonly (readonly [path: string, source: string])[]): string {
  const root = mkdtempSync(join(tmpdir(), 'git-warp-determinism-unit-'));
  fixtureRoots.push(root);
  for (const [path, source] of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  return root;
}

function brokenLabels(line: string): string[] {
  return DOMAIN_DETERMINISM_BANS.filter((ban) => ban.isBrokenBy(line)).map((ban) => ban.label);
}

function scanOf(root: string): DeterminismScan | DeterminismScanRefusal {
  return new DomainDeterminismGate(root, DOMAIN_DETERMINISM_BANS).scan();
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('DOMAIN_DETERMINISM_BANS', () => {
  it('holds exactly the twelve documented bans, in report order', () => {
    expect(DOMAIN_DETERMINISM_BANS.map((ban) => ban.label)).toEqual(BAN_SAMPLES.map(([label]) => label));
  });

  it.each(BAN_SAMPLES)('the %s sample breaks that ban and no other', (label, sample) => {
    expect(brokenLabels(sample)).toEqual([label]);
  });

  it('flags a comment that names a banned clock API, because the match is textual', () => {
    expect(brokenLabels('// never call Date.now here')).toEqual(['Date.now()']);
  });
});

describe('JSON.stringify ban under the ts-no-json-stringify-in-core inline quarantine', () => {
  it('exempts a call whose line carries the rule marker and a ticket', () => {
    expect(brokenLabels(`return JSON.stringify(value); // nosemgrep: ${JSON_RULE} -- 0025B`)).toEqual([]);
  });

  it('does not exempt a call whose marker has no ticket', () => {
    expect(brokenLabels(`return JSON.stringify(value); // nosemgrep: ${JSON_RULE}`)).toEqual([JSON_LABEL]);
  });

  it('does not exempt a call whose marker names another rule', () => {
    expect(brokenLabels('return JSON.stringify(value); // nosemgrep: ts-no-json-parse-in-core -- 0025B'))
      .toEqual([JSON_LABEL]);
  });

  it('does not exempt a call whose marker names a list of rules', () => {
    expect(brokenLabels(`return JSON.stringify(value); // nosemgrep: ts-no-fetch-in-core, ${JSON_RULE} -- 0025B`))
      .toEqual([JSON_LABEL]);
  });

  it('keeps every other ban on a line that carries the JSON marker', () => {
    expect(brokenLabels(`return JSON.stringify(Date.now()); // nosemgrep: ${JSON_RULE} -- 0025B`))
      .toEqual(['Date.now()']);
  });

  it('ignores prose that names JSON.stringify without calling it, as the Semgrep rule does', () => {
    expect(brokenLabels(' * Matches JSON.stringify semantics: a JSON.stringify-and-pray replacer')).toEqual([]);
  });
});

describe('determinism value objects', () => {
  it('refuses a ban without a label', () => {
    expect(() => DeterminismBan.absolute('', /x/)).toThrow(RangeError);
  });

  it.each([/x/g, /x/y])('refuses a stateful %s pattern', (pattern) => {
    expect(() => DeterminismBan.absolute('x', pattern)).toThrow(/global or sticky/);
  });

  it.each(['', 'ts.no.json', 'a b', 'Rule-Upper', 'a--b'])('refuses the inline quarantine rule id %j', (rule) => {
    expect(() => new InlineQuarantine(rule)).toThrow(RangeError);
  });

  it.each([0, 1.5])('refuses violation line number %d', (lineNumber) => {
    const ban = DeterminismBan.absolute('x', /x/);
    expect(() => new DeterminismViolation(ban, { path: 'src/domain/A.ts', lineNumber, lineText: 'x' }))
      .toThrow(/Line numbers start at 1/);
  });

  it('refuses a scan that read no file', () => {
    expect(() => new DeterminismScan(0, [])).toThrow(/at least one file/);
  });

  it('refuses a refusal without a reason', () => {
    expect(() => new DeterminismScanRefusal('')).toThrow(RangeError);
  });

  it('refuses a gate without bans', () => {
    expect(() => new DomainDeterminismGate('.', [])).toThrow(/at least one ban/);
  });
});

describe('listDomainFiles', () => {
  it('lists nested files of every extension as sorted repository-relative paths', () => {
    // An unsorted walk lists src/domain/zed.js first: it finds top-level files before it descends.
    const root = createRoot([['src/domain/zed.js', ''], ['src/domain/a/Two.ts', ''], ['src/domain/a/c/README', '']]);

    expect(listDomainFiles(root, 'src/domain')).toEqual(['src/domain/a/Two.ts', 'src/domain/a/c/README', 'src/domain/zed.js']);
  });

  it('refuses a symbolic link instead of skipping it', () => {
    const root = createRoot([['src/domain/Real.ts', '']]);
    symlinkSync(join(root, 'src/domain/Real.ts'), join(root, 'src/domain/Link.ts'));

    const listing = listDomainFiles(root, 'src/domain');

    expect(listing).toBeInstanceOf(DeterminismScanRefusal);
    expect(listing).toHaveProperty('reason', 'src/domain/Link.ts is neither a regular file nor a directory');
  });
});

describe('DomainDeterminismGate', () => {
  it.each(SOURCE_FILE_NAMES)('refuses a banned call in src/domain/nested/%s', (name) => {
    const root = createRoot([['src/domain/Clean.ts', 'export const ok = 1;\n'], [`src/domain/nested/${name}`, 'x();\nconst at = Date.now();\n']]);

    const scan = scanOf(root);

    expect(scan).toBeInstanceOf(DeterminismScan);
    expect(scan.reportLines()).toContain(`BANNED Date.now(): src/domain/nested/${name}:2: const at = Date.now();`);
    expect(scan.exitCode).toBe(1);
  });

  it('counts lines across CRLF line endings', () => {
    const root = createRoot([['src/domain/Windows.ts', 'a();\r\nb();\r\nMath.random();\r\n']]);

    expect(scanOf(root).reportLines()[0]).toBe('BANNED Math.random(): src/domain/Windows.ts:3: Math.random();');
  });

  it('reports every violation and a plural count', () => {
    const root = createRoot([['src/domain/Two.ts', 'Date.now();\nsetTimeout(f);\n']]);

    expect(scanOf(root).reportLines()).toEqual([
      'BANNED Date.now(): src/domain/Two.ts:1: Date.now();',
      'BANNED setTimeout — use ClockPort: src/domain/Two.ts:2: setTimeout(f);',
      'ban-nondeterminism: FAILED (2 violations, 1 domain file scanned).',
      'Move the effect behind a port (ClockPort, RandomPort) or pass the value in. There is no allowlist.',
    ]);
  });

  it('passes the quarantined JSON.stringify call shapes found in src/domain', () => {
    const root = createRoot([['src/domain/Frontier.ts', `return JSON.stringify(sorted); // nosemgrep: ${JSON_RULE} -- 0025B\n`]]);

    expect(scanOf(root).reportLines()).toEqual(['ban-nondeterminism: PASSED (1 domain file scanned).']);
  });

  it('still reports a clock read on a line that carries the JSON quarantine marker', () => {
    const root = createRoot([['src/domain/Stamp.ts', `return JSON.stringify(Date.now()); // nosemgrep: ${JSON_RULE} -- 0025B\n`]]);

    expect(scanOf(root).reportLines()[0])
      .toBe(`BANNED Date.now(): src/domain/Stamp.ts:1: return JSON.stringify(Date.now()); // nosemgrep: ${JSON_RULE} -- 0025B`);
  });

  it('refuses when src/domain is missing', () => {
    expect(scanOf(createRoot([['src/Other.ts', '']]))).toStrictEqual(new DeterminismScanRefusal('src/domain is not a directory'));
  });

  it('refuses when src/domain holds only empty directories', () => {
    const root = createRoot([]);
    mkdirSync(join(root, 'src/domain/empty'), { recursive: true });

    expect(scanOf(root)).toStrictEqual(new DeterminismScanRefusal('src/domain scanned no files'));
  });

  it('passes up a listing refusal', () => {
    const root = createRoot([['src/domain/Real.ts', '']]);
    symlinkSync(join(root, 'src/domain/Real.ts'), join(root, 'src/domain/Link.ts'));

    expect(scanOf(root)).toStrictEqual(
      new DeterminismScanRefusal('src/domain/Link.ts is neither a regular file nor a directory'),
    );
  });
});

describe('runDeterminismGate', () => {
  it('reports the scanned directory, every violation and the verdict, with exit code 1', () => {
    const root = createRoot([['src/domain/One.ts', 'crypto.randomUUID();\n']]);

    expect(runDeterminismGate(root)).toStrictEqual({
      reportLines: [
        'ban-nondeterminism: scanning src/domain',
        'BANNED crypto.randomUUID(): src/domain/One.ts:1: crypto.randomUUID();',
        'ban-nondeterminism: FAILED (1 violation, 1 domain file scanned).',
        'Move the effect behind a port (ClockPort, RandomPort) or pass the value in. There is no allowlist.',
      ],
      exitCode: 1,
    });
  });

  it('reports a pass and the scanned file count, with exit code 0', () => {
    const root = createRoot([['src/domain/A.ts', 'export const a = 1;\n'], ['src/domain/b/B.ts', 'export const b = 2;\n']]);

    expect(runDeterminismGate(root)).toStrictEqual({
      reportLines: ['ban-nondeterminism: scanning src/domain', 'ban-nondeterminism: PASSED (2 domain files scanned).'],
      exitCode: 0,
    });
  });

  it('reports a refusal and its reason, with exit code 2', () => {
    expect(runDeterminismGate(createRoot([]))).toStrictEqual({
      reportLines: [
        'ban-nondeterminism: scanning src/domain',
        'ban-nondeterminism: REFUSED: src/domain is not a directory.',
      ],
      exitCode: 2,
    });
  });
});
