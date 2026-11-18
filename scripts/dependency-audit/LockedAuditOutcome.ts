// SPDX-License-Identifier: Apache-2.0

import { DISPOSITION } from './AuditDisposition.ts';
import { AUDIT_EXCEPTIONS_PATH } from './AuditExceptionList.ts';
import { GATE_LABEL } from './AuditGateLabel.ts';
import type { AuditReport } from './AuditReport.ts';
import { AUDIT_LEVEL } from './AuditSeverity.ts';
import type { AuditVerdict } from './AuditVerdict.ts';
import { renderVerdictTable } from './VerdictTable.ts';

const PASSED_EXIT_CODE = 0;
const FAILED_EXIT_CODE = 1;

export type LockedAuditOutcomeFields = {
  readonly published: AuditReport;
  readonly full: AuditReport;
  readonly exceptionCount: number;
  readonly verdicts: readonly AuditVerdict[];
};

/** The gate's complete result: one verdict for each advisory and for each stale exception. */
export class LockedAuditOutcome {
  readonly published: AuditReport;
  readonly full: AuditReport;
  readonly exceptionCount: number;
  /** Failures first, then by advisory and package. */
  readonly verdicts: readonly AuditVerdict[];

  constructor(fields: LockedAuditOutcomeFields) {
    this.published = fields.published;
    this.full = fields.full;
    this.exceptionCount = fields.exceptionCount;
    this.verdicts = Object.freeze([...fields.verdicts].sort((left, right) => (orderOf(left) < orderOf(right) ? -1 : 1)));
    Object.freeze(this);
  }

  get failures(): number {
    return this.verdicts.filter((verdict) => !verdict.passed).length;
  }

  /** 0 when every verdict passes, otherwise 1. */
  get exitCode(): number {
    return this.failures === 0 ? PASSED_EXIT_CODE : FAILED_EXIT_CODE;
  }

  reportLines(): readonly string[] {
    return [this.scopeLine(), ...renderVerdictTable(this.verdicts), this.resultLine()];
  }

  private scopeLine(): string {
    const { published, full } = this;
    return `${GATE_LABEL}: audit level ${AUDIT_LEVEL}. `
      + `Published tree (npm audit --omit=dev): advisories ${published.advisories.length}, vulnerable packages ${published.vulnerablePackages}. `
      + `Full tree (npm audit): advisories ${full.advisories.length}, vulnerable packages ${full.vulnerablePackages}, locked packages ${full.lockedPackages}. `
      + `Exceptions in ${AUDIT_EXCEPTIONS_PATH}: ${this.exceptionCount}.`;
  }

  private resultLine(): string {
    if (this.failures > 0) {
      return `${GATE_LABEL}: FAILED: ${this.failures} of ${this.verdicts.length} rows failed. `
        + 'Run npm audit for the dependency paths; the rules are in docs/operations/dependency-audit.md.';
    }
    const excepted = this.verdicts.filter((verdict) => verdict.disposition === DISPOSITION.EXCEPTED).length;
    return `${GATE_LABEL}: PASSED: excepted ${excepted}, below the audit level ${this.verdicts.length - excepted}, failed 0.`;
  }
}

function orderOf(verdict: AuditVerdict): string {
  return `${verdict.passed ? 'pass' : 'fail'} ${verdict.advisory} ${verdict.packageName}`;
}
