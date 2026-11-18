// SPDX-License-Identifier: Apache-2.0

/** The severities that `npm audit` reports, lowest first. */
export const AUDIT_SEVERITIES = Object.freeze(['info', 'low', 'moderate', 'high', 'critical'] as const);

export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

/** The gate's threshold. It is the same as `npm audit --audit-level=low`. */
export const AUDIT_LEVEL: AuditSeverity = 'low';

/** True when an advisory of this severity fails `npm audit --audit-level=low`. */
export function meetsAuditLevel(severity: AuditSeverity): boolean {
  return AUDIT_SEVERITIES.indexOf(severity) >= AUDIT_SEVERITIES.indexOf(AUDIT_LEVEL);
}
