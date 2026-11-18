// SPDX-License-Identifier: Apache-2.0

import { AdvisoryJudge } from './AdvisoryJudge.ts';
import type { AuditAdvisory } from './AuditAdvisory.ts';
import type { AuditExceptionList } from './AuditExceptionList.ts';
import { AuditRefusal } from './AuditRefusal.ts';
import type { AuditReport } from './AuditReport.ts';
import type { AuditSource } from './AuditSource.ts';
import type { CalendarDate } from './CalendarDate.ts';
import { LockedAuditOutcome } from './LockedAuditOutcome.ts';
import type { PackageRegistry } from './PackageRegistry.ts';

export type LockedAuditPorts = {
  readonly audits: AuditSource;
  readonly registry: PackageRegistry;
};

/**
 * The locked dependency audit (docs/operations/dependency-audit.md). An
 * advisory in the published tree always fails. A development-only advisory
 * passes only while a valid exception lists it and no patched version is
 * published. An exception that matches no advisory fails as stale.
 */
export class LockedAuditGate {
  private readonly ports: LockedAuditPorts;

  constructor(ports: LockedAuditPorts) {
    this.ports = ports;
    Object.freeze(this);
  }

  async evaluate(exceptions: AuditExceptionList, today: CalendarDate): Promise<LockedAuditOutcome | AuditRefusal> {
    const published = await this.ports.audits.auditPublishedTree();
    if (published instanceof AuditRefusal) {
      return published;
    }
    const full = await this.ports.audits.auditFullTree();
    if (full instanceof AuditRefusal) {
      return full;
    }
    const publishedKeys = new Set(published.advisories.map((advisory) => advisory.key));
    const judge = new AdvisoryJudge({ publishedKeys, exceptions, today, registry: this.ports.registry });
    const advisories = advisoriesIn(published, full);
    const verdicts = await judge.judgeAll(advisories);
    if (verdicts instanceof AuditRefusal) {
      return verdicts;
    }
    return new LockedAuditOutcome({
      published,
      full,
      exceptionCount: exceptions.exceptions.length,
      verdicts: [...verdicts, ...judge.staleExceptions(advisories)],
    });
  }
}

/** Every advisory that either audit found, each advisory and package once. */
function advisoriesIn(published: AuditReport, full: AuditReport): readonly AuditAdvisory[] {
  const unique = new Map([...published.advisories, ...full.advisories].map((advisory) => [advisory.key, advisory]));
  return [...unique.values()];
}
