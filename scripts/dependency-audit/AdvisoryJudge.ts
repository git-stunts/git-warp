// SPDX-License-Identifier: Apache-2.0

import type { AuditAdvisory } from './AuditAdvisory.ts';
import { DISPOSITION, type AuditDisposition } from './AuditDisposition.ts';
import type { AuditException, ExceptionProblem } from './AuditException.ts';
import { AUDIT_EXCEPTIONS_PATH, type AuditExceptionList } from './AuditExceptionList.ts';
import { AuditRefusal } from './AuditRefusal.ts';
import { AUDIT_LEVEL, meetsAuditLevel } from './AuditSeverity.ts';
import { AUDIT_TREE, AuditVerdict, type AuditTree } from './AuditVerdict.ts';
import type { CalendarDate } from './CalendarDate.ts';
import type { PackageRegistry } from './PackageRegistry.ts';
import type { PublishedVersions } from './PublishedVersions.ts';

export type AdvisoryJudgeContext = {
  /** Keys of the advisories that the published-tree audit found. */
  readonly publishedKeys: ReadonlySet<string>;
  readonly exceptions: AuditExceptionList;
  readonly today: CalendarDate;
  readonly registry: PackageRegistry;
};

type Finding = {
  readonly disposition: AuditDisposition;
  readonly details: readonly string[];
};

/** Applies the exception rules to each advisory, and finds exceptions that match no advisory. */
export class AdvisoryJudge {
  private readonly context: AdvisoryJudgeContext;

  constructor(context: AdvisoryJudgeContext) {
    this.context = context;
    Object.freeze(this);
  }

  /** One verdict for each advisory, in order, or the first registry refusal. */
  async judgeAll(advisories: readonly AuditAdvisory[]): Promise<readonly AuditVerdict[] | AuditRefusal> {
    const verdicts: AuditVerdict[] = [];
    for (const advisory of advisories) {
      const verdict = await this.judge(advisory);
      if (verdict instanceof AuditRefusal) {
        return verdict;
      }
      verdicts.push(verdict);
    }
    return verdicts;
  }

  /** A stale verdict for each exception that covers no advisory at or above the audit level. */
  staleExceptions(advisories: readonly AuditAdvisory[]): readonly AuditVerdict[] {
    const findings = advisories.filter((advisory) => meetsAuditLevel(advisory.severity));
    return this.context.exceptions.exceptions
      .filter((exception) => !findings.some((advisory) => exception.covers(advisory)))
      .map((exception) => new AuditVerdict({
        advisory: exception.advisory,
        packageName: exception.packageName,
        severity: '-',
        tree: AUDIT_TREE.NONE,
        disposition: DISPOSITION.STALE,
        details: [`no advisory at or above ${AUDIT_LEVEL} matches; remove the exception`, `owner ${exception.owner}`],
      }));
  }

  private async judge(advisory: AuditAdvisory): Promise<AuditVerdict | AuditRefusal> {
    const tree = this.context.publishedKeys.has(advisory.key) ? AUDIT_TREE.PUBLISHED : AUDIT_TREE.DEVELOPMENT;
    const exception = this.context.exceptions.find(advisory);
    if (!meetsAuditLevel(advisory.severity)) {
      return verdictFor(advisory, tree, { disposition: DISPOSITION.BELOW_LEVEL, details: [`below the audit level (${AUDIT_LEVEL})`] });
    }
    if (tree === AUDIT_TREE.PUBLISHED) {
      return verdictFor(advisory, tree, { disposition: DISPOSITION.PUBLISHED, details: publishedDetails(advisory, exception) });
    }
    if (exception === undefined) {
      return verdictFor(advisory, tree, { disposition: DISPOSITION.UNLISTED, details: [advisory.title, `no exception in ${AUDIT_EXCEPTIONS_PATH}`] });
    }
    return await this.judgeException(advisory, exception);
  }

  private async judgeException(advisory: AuditAdvisory, exception: AuditException): Promise<AuditVerdict | AuditRefusal> {
    const versions = await this.context.registry.publishedVersions(advisory.packageName, advisory.vulnerableRange);
    if (versions instanceof AuditRefusal) {
      return versions;
    }
    const problems = [...exception.problemsOn(this.context.today), ...patchProblems(advisory, versions)];
    const first = problems[0];
    const finding: Finding = first === undefined
      ? { disposition: DISPOSITION.EXCEPTED, details: exceptedDetails(advisory, exception, { versions, today: this.context.today }) }
      : { disposition: first.disposition, details: [...problems.map((problem) => problem.detail), `owner ${exception.owner}`] };
    return verdictFor(advisory, AUDIT_TREE.DEVELOPMENT, finding);
  }
}

function verdictFor(advisory: AuditAdvisory, tree: AuditTree, finding: Finding): AuditVerdict {
  return new AuditVerdict({
    advisory: advisory.id,
    packageName: advisory.packageName,
    severity: advisory.severity,
    tree,
    ...finding,
  });
}

function publishedDetails(advisory: AuditAdvisory, exception: AuditException | undefined): readonly string[] {
  const listed = exception === undefined ? [] : [`${AUDIT_EXCEPTIONS_PATH} lists it, but no exception applies to the published tree`];
  return [advisory.title, 'reaches the published tree', ...listed];
}

function patchProblems(advisory: AuditAdvisory, versions: PublishedVersions): readonly ExceptionProblem[] {
  return versions.patchPublished
    ? [{
      disposition: DISPOSITION.PATCHED,
      detail: `${advisory.packageName} ${versions.latest} is published outside ${advisory.vulnerableRange}; fix the dependency instead`,
    }]
    : [];
}

function exceptedDetails(
  advisory: AuditAdvisory,
  exception: AuditException,
  facts: { readonly versions: PublishedVersions; readonly today: CalendarDate },
): readonly string[] {
  return [
    `expires ${exception.expires.iso} (${facts.today.daysUntil(exception.expires)} days left)`,
    `owner ${exception.owner}`,
    `latest ${advisory.packageName} ${facts.versions.latest} is inside ${advisory.vulnerableRange}`,
    `reason: ${exception.reason}`,
  ];
}
