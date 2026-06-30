/**
 * Type definitions for the `doctor` command.
 *
 * @module cli/commands/doctor/types
 */

import type { Persistence } from '../../types.ts';

// ── JSON-safe recursive value type ──────────────────────────────────────────

export type JsonValue = null | boolean | number | string | Array<unknown> | { [k: string]: unknown };

export type FindingEvidence = { [k: string]: JsonValue };

// ── Finding ─────────────────────────────────────────────────────────────────

export interface DoctorFinding {
  id: string;
  status: 'ok' | 'warn' | 'fail';
  code: string;
  impact: 'data_integrity' | 'security' | 'operability' | 'hygiene';
  message: string;
  fix?: string;
  helpUrl?: string;
  evidence?: FindingEvidence;
  durationMs?: number;
}

// ── Policy ──────────────────────────────────────────────────────────────────

export interface DoctorPolicy {
  strict: boolean;
  clockSkewMs: number;
  checkpointMaxAgeHours: number;
  globalDeadlineMs: number;
  checkTimeouts: { [checkId: string]: number };
}

// ── Payload ─────────────────────────────────────────────────────────────────

export interface DoctorPayload {
  doctorVersion: 1;
  repo: string;
  graph: string;
  checkedAt: string;
  health: 'ok' | 'degraded' | 'failed';
  policy: DoctorPolicy;
  summary: DoctorSummary;
  findings: DoctorFinding[];
  durationMs: number;
}

export interface DoctorSummary {
  checksRun: number;
  findingsTotal: number;
  ok: number;
  warn: number;
  fail: number;
  priorityActions: string[];
}

// ── Context passed to each check ────────────────────────────────────────────

export interface DoctorContext {
  persistence: Persistence;
  stateCache: any | null; // Using any to avoid complex dependency imports in CLI types
  graphName: string;
  writerHeads: Array<{ writerId: string; sha: string | null; ref: string }>;
  policy: DoctorPolicy;
  repoPath: string;
}

export type DoctorCheck = (ctx: DoctorContext) => Promise<DoctorFinding | DoctorFinding[] | null>;

// ── Exit codes ──────────────────────────────────────────────────────────────

export const DOCTOR_EXIT_CODES = {
  OK: 0,
  FINDINGS: 3,
  STRICT_FINDINGS: 4,
};
