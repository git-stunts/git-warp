/**
 * Auxiliary doctor checks: clock-skew and hooks-installed.
 * Extracted from checks.ts to keep file size under 500 LOC.
 */
import { createHookInstaller } from '../../shared.ts';
import { CODES } from './codes.ts';
import type { DoctorFinding, DoctorContext } from './types.ts';
import type { Persistence } from '../../types.ts';

/** Wrap an unexpected exception as an internal-error finding. */
function internalError(id: string, err: unknown): DoctorFinding {
  return {
    id,
    status: 'fail',
    code: 'CHECK_INTERNAL_ERROR',
    impact: 'operability',
    message: err instanceof Error ? err.message : String(err),
  };
}

// ── clock-skew ──────────────────────────────────────────────────────────────

/** Collect parsed commit dates from writer head commits. */
async function collectWriterDates(ctx: DoctorContext): Promise<Array<{ writerId: string; ms: number }>> {
  const dates: Array<{ writerId: string; ms: number }> = [];
  for (const head of ctx.writerHeads) {
    if (typeof head.sha !== 'string' || head.sha.length === 0) {
      continue;
    }
    const entry = await parseWriterDate(ctx.persistence, { writerId: head.writerId, sha: head.sha });
    if (entry !== null) {
      dates.push(entry);
    }
  }
  return dates;
}

/** Parse the commit date from a single writer head. */
async function parseWriterDate(persistence: Persistence, head: { writerId: string; sha: string }): Promise<{ writerId: string; ms: number } | null> {
  const info = await persistence.getNodeInfo(head.sha);
  const raw = typeof info.date === 'string' && info.date.length > 0 ? info.date : '';
  const ms = raw.length > 0 ? Date.parse(raw) : NaN;
  return Number.isNaN(ms) ? null : { writerId: head.writerId, ms };
}

/** Build the skew finding from the computed spread. */
function buildSkewFinding(spreadMs: number, ctx: DoctorContext): DoctorFinding {
  if (spreadMs > ctx.policy.clockSkewMs) {
    return {
      id: 'clock-skew', status: 'warn', code: CODES.CLOCK_SKEW_EXCEEDED,
      impact: 'operability',
      message: `Clock skew is ${Math.round(spreadMs / 1000)}s (threshold: ${Math.round(ctx.policy.clockSkewMs / 1000)}s)`,
      evidence: { spreadMs, thresholdMs: ctx.policy.clockSkewMs },
    };
  }
  return {
    id: 'clock-skew', status: 'ok', code: CODES.CLOCK_SYNCED,
    impact: 'operability',
    message: `Clock skew is within threshold (${Math.round(spreadMs / 1000)}s)`,
    evidence: { spreadMs },
  };
}

/** Detect excessive clock skew between writer head commits. */
export async function checkClockSkew(ctx: DoctorContext): Promise<DoctorFinding> {
  try {
    if (ctx.writerHeads.length < 2) {
      return {
        id: 'clock-skew', status: 'ok', code: CODES.CLOCK_SYNCED,
        impact: 'operability', message: 'Clock skew check skipped (fewer than 2 writers)',
      };
    }
    const dates = await collectWriterDates(ctx);
    if (dates.length < 2) {
      return {
        id: 'clock-skew', status: 'ok', code: CODES.CLOCK_SYNCED,
        impact: 'operability', message: 'Clock skew check skipped (insufficient date data)',
      };
    }
    const spreadMs = Math.max(...dates.map((d) => d.ms)) - Math.min(...dates.map((d) => d.ms));
    return buildSkewFinding(spreadMs, ctx);
  } catch (err) {
    return internalError('clock-skew', err);
  }
}

// ── hooks-installed ─────────────────────────────────────────────────────────

/** Check whether the warp post-merge hook is installed and current. */
export async function checkHooksInstalled(ctx: DoctorContext): Promise<DoctorFinding> {
  try {
    const installer = createHookInstaller();
    const s = installer.getHookStatus(ctx.repoPath);
    return await Promise.resolve(buildHookFinding(s));
  } catch (err) {
    return internalError('hooks-installed', err);
  }
}

/** Builds a hook finding based on hook installation status. */
function buildHookFinding(s: { installed: boolean; version?: string; current?: boolean; foreign?: boolean; hookPath: string }): DoctorFinding {
  if (!s.installed) {
    return buildUninstalledHookFinding(Boolean(s.foreign));
  }
  return buildInstalledHookFinding(s);
}

/** Builds a finding for an installed hook, flagging if it is outdated. */
function buildInstalledHookFinding(s: { version?: string; current?: boolean }): DoctorFinding {
  if (s.current !== true) {
    return {
      id: 'hooks-installed', status: 'warn', code: CODES.HOOKS_OUTDATED,
      impact: 'hygiene', message: `Hook is outdated (v${s.version})`,
      fix: 'Run `git warp install-hooks` to upgrade',
      evidence: { version: s.version ?? null },
    };
  }
  return {
    id: 'hooks-installed', status: 'ok', code: CODES.HOOKS_OK,
    impact: 'hygiene', message: `Hook is installed and current (v${s.version})`,
  };
}

/** Builds a finding for a missing hook, distinguishing foreign hooks. */
function buildUninstalledHookFinding(isForeign: boolean): DoctorFinding {
  if (isForeign) {
    return {
      id: 'hooks-installed', status: 'warn', code: CODES.HOOKS_MISSING,
      impact: 'hygiene', message: 'Foreign hook present; warp hook not installed',
      fix: 'Run `git warp install-hooks` (use --force to replace existing hook)',
    };
  }
  return {
    id: 'hooks-installed', status: 'warn', code: CODES.HOOKS_MISSING,
    impact: 'hygiene', message: 'Post-merge hook is not installed',
    fix: 'Run `git warp install-hooks`',
  };
}
