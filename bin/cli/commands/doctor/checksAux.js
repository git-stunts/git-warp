/**
 * Auxiliary doctor checks: clock-skew and hooks-installed.
 * Extracted from checks.js to keep file size under 500 LOC.
 */
import { createHookInstaller } from '../../shared.js';
import { CODES } from './codes.js';

/** @typedef {import('./types.js').DoctorFinding} DoctorFinding */
/** @typedef {import('./types.js').DoctorContext} DoctorContext */

/**
 * Wrap an unexpected exception as an internal-error finding.
 * @param {string} id
 * @param {unknown} err
 * @returns {DoctorFinding}
 */
function internalError(id, err) {
  return /** @type {DoctorFinding} */ ({
    id,
    status: /** @type {'ok'|'warn'|'fail'} */ ('fail'),
    code: 'CHECK_INTERNAL_ERROR',
    impact: /** @type {'data_integrity'|'security'|'operability'|'hygiene'} */ ('operability'),
    message: err instanceof Error ? err.message : String(err),
  });
}

// ── clock-skew ──────────────────────────────────────────────────────────────

/**
 * Collect parsed commit dates from writer head commits.
 * @param {DoctorContext} ctx
 * @returns {Promise<Array<{writerId: string, ms: number}>>}
 */
async function collectWriterDates(ctx) {
  const dates = [];
  for (const head of ctx.writerHeads) {
    if (typeof head.sha !== 'string' || head.sha.length === 0) {
      continue;
    }
    const entry = await parseWriterDate(ctx.persistence, { writerId: head.writerId, sha: /** @type {string} */ (head.sha) });
    if (entry !== null) {
      dates.push(entry);
    }
  }
  return dates;
}

/**
 * Parse the commit date from a single writer head.
 * @param {import('../../types.js').Persistence} persistence
 * @param {{ writerId: string, sha: string }} head
 * @returns {Promise<{writerId: string, ms: number}|null>}
 */
async function parseWriterDate(persistence, head) {
  const info = await persistence.getNodeInfo(head.sha);
  const raw = typeof info.date === 'string' && info.date.length > 0 ? info.date : '';
  const ms = raw.length > 0 ? Date.parse(raw) : NaN;
  return Number.isNaN(ms) ? null : { writerId: head.writerId, ms };
}

/**
 * Build the skew finding from the computed spread.
 * @param {number} spreadMs
 * @param {DoctorContext} ctx
 * @returns {DoctorFinding}
 */
function buildSkewFinding(spreadMs, ctx) {
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

/**
 * Detect excessive clock skew between writer head commits.
 * @param {DoctorContext} ctx
 * @returns {Promise<DoctorFinding>}
 */
export async function checkClockSkew(ctx) {
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

/**
 * Check whether the warp post-merge hook is installed and current.
 * @param {DoctorContext} ctx
 * @returns {Promise<DoctorFinding>}
 */
export async function checkHooksInstalled(ctx) {
  try {
    const installer = createHookInstaller();
    const s = installer.getHookStatus(ctx.repoPath);
    return await Promise.resolve(buildHookFinding(s));
  } catch (err) {
    return internalError('hooks-installed', err);
  }
}

/**
 * Builds a hook finding based on hook installation status.
 *
 * @param {{ installed: boolean, version?: string, current?: boolean, foreign?: boolean, hookPath: string }} s
 * @returns {DoctorFinding}
 */
function buildHookFinding(s) {
  if (!s.installed) {
    return buildUninstalledHookFinding(Boolean(s.foreign));
  }
  return buildInstalledHookFinding(s);
}

/**
 * Builds a finding for an installed hook, flagging if it is outdated.
 *
 * @param {{ version?: string, current?: boolean }} s
 * @returns {DoctorFinding}
 */
function buildInstalledHookFinding(s) {
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

/**
 * Builds a finding for a missing hook, distinguishing foreign hooks.
 *
 * @param {boolean} isForeign
 * @returns {DoctorFinding}
 */
function buildUninstalledHookFinding(isForeign) {
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
