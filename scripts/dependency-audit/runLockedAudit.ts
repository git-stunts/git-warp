// SPDX-License-Identifier: Apache-2.0

import { readAuditExceptions } from './adapters/AuditExceptionFile.ts';
import type { CommandRunner } from './adapters/CommandRunner.ts';
import { NpmCli } from './adapters/NpmCli.ts';
import { AuditRefusal } from './AuditRefusal.ts';
import type { CalendarDate } from './CalendarDate.ts';
import { LockedAuditGate } from './LockedAuditGate.ts';

export type LockedAuditContext = {
  /** The repository root: npm runs there, and the exception list is read from there. */
  readonly root: string;
  /** The UTC day against which exception windows are checked. */
  readonly today: CalendarDate;
  readonly runner: CommandRunner;
};

/** The gate's report and the process exit code that goes with it. */
export type LockedAuditRun = {
  readonly reportLines: readonly string[];
  /** 0 passed; 1 at least one advisory or exception failed; 2 refused. */
  readonly exitCode: number;
};

/** Composes the npm adapter with the gate and runs it once. */
export async function runLockedAudit(context: LockedAuditContext): Promise<LockedAuditRun> {
  const exceptions = await readAuditExceptions(context.root);
  const npm = new NpmCli(context.runner);
  const outcome = exceptions instanceof AuditRefusal
    ? exceptions
    : await new LockedAuditGate({ audits: npm, registry: npm }).evaluate(exceptions, context.today);
  return Object.freeze({ reportLines: Object.freeze([...outcome.reportLines()]), exitCode: outcome.exitCode });
}
