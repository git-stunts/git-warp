import { readFileSync } from 'node:fs';

import { decodeAuditExceptions } from '../../../scripts/dependency-audit/adapters/AuditExceptionFile.ts';
import type { CommandResult, CommandRunner } from '../../../scripts/dependency-audit/adapters/CommandRunner.ts';
import type { AuditExceptionList } from '../../../scripts/dependency-audit/AuditExceptionList.ts';
import { AuditRefusal } from '../../../scripts/dependency-audit/AuditRefusal.ts';

const FIXTURE_DIRECTORY = new URL('../../fixtures/dependency-audit/', import.meta.url);

function npmFixture(name: string): string {
  return readFileSync(new URL(name, FIXTURE_DIRECTORY), 'utf8');
}

/**
 * Recorded on 2026-11-18 (UTC) in the COPY-based Docker test image (Node
 * 22.23.4, npm 10.9.9) from the lock at origin/main
 * 46379ff4863c353d759a483451610fafe3dc95a2. Each file is the exact standard
 * output of its command.
 */
export const RECORDED = Object.freeze({
  /** `npm audit --json`: 15 vulnerable packages, all from one advisory, picomatch GHSA-fc5q-39xc-vjpf `<=4.0.7`. */
  fullTree: npmFixture('npm-audit-full-tree.json'),
  /** `npm audit --json --omit=dev`: no vulnerable package. */
  publishedTree: npmFixture('npm-audit-published-tree.json'),
  /** `npm audit --json --registry=http://127.0.0.1:9 --fetch-retries=0`: the audit endpoint is unreachable. */
  networkFailure: npmFixture('npm-audit-network-failure.json'),
  /** `npm view picomatch version --json`: "4.0.7". */
  viewLatest: npmFixture('npm-view-latest.json'),
  /** `npm view picomatch@<=4.0.7 version --json`: 35 versions, 4.0.7 among them. */
  viewRange: npmFixture('npm-view-range.json'),
  /** `npm view picomatch@>=99.0.0 version --json`: E404, no match. */
  viewNoMatch: npmFixture('npm-view-no-match.json'),
});

/** Synthetic: derived by hand from the recorded picomatch entry, for states the current lock cannot produce. */
export const SYNTHETIC = Object.freeze({
  /** The recorded picomatch vulnerability, moved into the published tree. */
  publishedTreePicomatch: npmFixture('synthetic-npm-audit-published-tree-picomatch.json'),
  /** The recorded full-tree metadata with no vulnerability. */
  fullTreeClean: npmFixture('synthetic-npm-audit-full-tree-clean.json'),
});

/** The command lines that the npm adapter runs for the recorded lock. */
export const NPM_COMMAND = Object.freeze({
  PUBLISHED: 'npm audit --json --omit=dev',
  FULL: 'npm audit --json',
  LATEST: 'npm view picomatch version --json',
  RANGE: 'npm view picomatch@<=4.0.7 version --json',
});

export const PICOMATCH_ADVISORY = 'GHSA-fc5q-39xc-vjpf';

/** A finished command with this output and exit code, and nothing on standard error. */
export function exited(stdout: string, exitCode: number): CommandResult {
  return { exitCode, stdout, stderr: '' };
}

/** Answers each command from recorded output, and keeps the command lines in the order it was asked. */
export class RecordedNpm implements CommandRunner {
  readonly commands: string[] = [];
  private readonly outputs: ReadonlyMap<string, CommandResult | AuditRefusal>;

  /** The recorded origin/main outputs, with `overrides` replacing single commands. */
  constructor(overrides: readonly (readonly [string, CommandResult | AuditRefusal])[] = []) {
    this.outputs = new Map<string, CommandResult | AuditRefusal>([
      [NPM_COMMAND.PUBLISHED, exited(RECORDED.publishedTree, 0)],
      [NPM_COMMAND.FULL, exited(RECORDED.fullTree, 1)],
      [NPM_COMMAND.LATEST, exited(RECORDED.viewLatest, 0)],
      [NPM_COMMAND.RANGE, exited(RECORDED.viewRange, 0)],
      ...overrides,
    ]);
  }

  run(command: string, args: readonly string[]): Promise<CommandResult | AuditRefusal> {
    const line = [command, ...args].join(' ');
    this.commands.push(line);
    return Promise.resolve(this.outputs.get(line) ?? new AuditRefusal(`no recorded output for ${line}`));
  }
}

/** The picomatch exception as committed, which a test overrides one field at a time. */
export const PICOMATCH_EXCEPTION = Object.freeze({
  advisory: PICOMATCH_ADVISORY,
  package: 'picomatch',
  reason: 'dev-only toolchain; no patched picomatch version',
  added: '2026-11-17',
  expires: '2026-12-17',
  owner: 'git-stunts/git-warp#1194',
});

export function exceptionsText(entries: readonly object[]): string {
  return JSON.stringify({ exceptions: entries });
}

/** Decodes an exception list that the test expects to be well formed. */
export function exceptionList(entries: readonly object[]): AuditExceptionList {
  const decoded = decodeAuditExceptions(exceptionsText(entries));
  if (decoded instanceof AuditRefusal) {
    throw new Error(`test exception list is malformed: ${decoded.reason}`);
  }
  return decoded;
}
