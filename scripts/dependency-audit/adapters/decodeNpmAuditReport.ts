// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

import { AuditAdvisory } from '../AuditAdvisory.ts';
import { AuditRefusal } from '../AuditRefusal.ts';
import { AuditReport } from '../AuditReport.ts';
import { AUDIT_SEVERITIES } from '../AuditSeverity.ts';
import { npmFailureText } from './npmFailureText.ts';
import { parseJsonText } from './parseJsonText.ts';

const SEVERITY = z.enum(AUDIT_SEVERITIES);

/** An advisory object in a vulnerability's `via` list. A string `via` names another vulnerable package. */
const ADVISORY = z.object({
  source: z.number().int(),
  name: z.string().min(1),
  title: z.string(),
  url: z.string(),
  severity: SEVERITY,
  range: z.string().min(1),
});

const VULNERABILITY = z.object({
  name: z.string().min(1),
  severity: SEVERITY,
  via: z.array(z.union([z.string().min(1), ADVISORY])).min(1),
});

/** `npm audit --json` report version 2 (npm 7 and later). Unlisted fields are ignored. */
const REPORT = z.object({
  auditReportVersion: z.literal(2),
  vulnerabilities: z.record(z.string(), VULNERABILITY),
  metadata: z.object({
    vulnerabilities: z.object({ total: z.number().int().nonnegative() }),
    dependencies: z.object({ total: z.number().int().nonnegative() }),
  }),
});

type ReportData = z.infer<typeof REPORT>;
type VulnerabilityData = z.infer<typeof VULNERABILITY>;

/** Decodes the standard output of `npm audit --json`. Anything but a consistent report is a refusal. */
export function decodeNpmAuditReport(stdout: string, command: string): AuditReport | AuditRefusal {
  const parsed = parseJsonText(stdout);
  if (parsed === null) {
    return new AuditRefusal(`${command} did not print JSON`);
  }
  const report = REPORT.safeParse(parsed.value);
  if (!report.success) {
    return new AuditRefusal(`${command} did not print an audit report: ${npmFailureText(parsed.value)}`);
  }
  return reportFrom(report.data, command);
}

function reportFrom(data: ReportData, command: string): AuditReport | AuditRefusal {
  const vulnerabilities = Object.values(data.vulnerabilities);
  const inconsistency = inconsistencyIn(data, vulnerabilities);
  if (inconsistency !== null) {
    return new AuditRefusal(`${command} printed an inconsistent report: ${inconsistency}`);
  }
  return new AuditReport({
    advisories: vulnerabilities.flatMap(advisoriesOf),
    lockedPackages: data.metadata.dependencies.total,
    vulnerablePackages: vulnerabilities.length,
  });
}

/** A report must count what it lists, name only listed packages, and cover at least one package. */
function inconsistencyIn(data: ReportData, vulnerabilities: readonly VulnerabilityData[]): string | null {
  const counted = data.metadata.vulnerabilities.total;
  if (counted !== vulnerabilities.length) {
    return `metadata counts ${counted} vulnerable packages, but ${vulnerabilities.length} are listed`;
  }
  const dangling = vulnerabilities.flatMap((vulnerability) => vulnerability.via)
    .find((via) => typeof via === 'string' && !Object.hasOwn(data.vulnerabilities, via));
  if (typeof dangling === 'string') {
    return `a vulnerability is reached through ${dangling}, which the report does not list`;
  }
  return data.metadata.dependencies.total === 0 ? 'it audited no locked package' : null;
}

function advisoriesOf(vulnerability: VulnerabilityData): readonly AuditAdvisory[] {
  return vulnerability.via.flatMap((via) => (typeof via === 'string' ? [] : [new AuditAdvisory({
    source: via.source,
    url: via.url,
    packageName: via.name,
    severity: via.severity,
    vulnerableRange: via.range,
    title: via.title,
  })]));
}
