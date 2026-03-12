/**
 * SyncTrustGate -- Encapsulates trust evaluation for sync operations.
 *
 * Evaluates whether inbound patch authors are trusted according to the
 * trust record chain. Used by SyncController to validate HTTP sync
 * responses before applying patches.
 *
 * Trust-gates on `writersApplied` (patch authors being ingested), not
 * frontier keys (which are claims, not effects).
 *
 * @module domain/services/SyncTrustGate
 * @see B1 -- Signed sync ingress
 */

import nullLogger from '../utils/nullLogger.js';

/**
 * @typedef {'enforce'|'log-only'|'off'} TrustMode
 */

/**
 * @typedef {Object} TrustGateResult
 * @property {boolean} allowed - Whether the writers are trusted
 * @property {string[]} untrustedWriters - Writers that failed trust evaluation
 * @property {string} verdict - Human-readable verdict
 */

/** @type {() => TrustGateResult} */
const PASS = () => ({ allowed: true, untrustedWriters: [], verdict: 'pass' });

export default class SyncTrustGate {
  /**
   * @param {{ trustEvaluator?: {evaluateWriters: (writerIds: string[]) => Promise<{trusted: Set<string>}>}, trustMode?: TrustMode, logger?: import('../../ports/LoggerPort.js').default }} [options]
   */
  constructor(options = undefined) {
    const { trustEvaluator, trustMode = 'off', logger } = options || {};
    this._evaluator = trustEvaluator || null;
    this._mode = trustMode;
    this._logger = logger || nullLogger;
  }

  /**
   * Evaluates whether the given patch writers are trusted.
   *
   * @param {string[]} writerIds - Writer IDs from patches being applied
   * @param {{ graphName?: string, peerId?: string }} [context] - Additional context for logging
   * @returns {Promise<TrustGateResult>}
   */
  async evaluate(writerIds, context = {}) {
    if (this._mode === 'off' || !this._evaluator) {
      return { allowed: true, untrustedWriters: [], verdict: 'trust_disabled' };
    }
    if (writerIds.length === 0) {
      return { allowed: true, untrustedWriters: [], verdict: 'no_writers' };
    }

    try {
      const result = await this._evaluator.evaluateWriters(writerIds);
      const untrusted = writerIds.filter((id) => !result.trusted.has(id));
      return this._decide(untrusted, writerIds, context);
    } catch (err) {
      return this._handleError(err, writerIds, context);
    }
  }

  /**
   * Decides the gate result based on untrusted writers and mode.
   * @param {string[]} untrusted
   * @param {string[]} writerIds
   * @param {Record<string, unknown>} context
   * @returns {TrustGateResult}
   * @private
   */
  _decide(untrusted, writerIds, context) {
    this._logger.info('Trust gate decision', {
      code: 'SYNC_TRUST_GATE',
      mode: this._mode,
      writersApplied: writerIds,
      untrustedWriters: untrusted,
      verdict: untrusted.length === 0 ? 'pass' : 'fail',
      ...context,
    });

    if (untrusted.length === 0) {
      return PASS();
    }

    if (this._mode === 'enforce') {
      this._logger.warn('Trust gate rejected untrusted writers', {
        code: 'SYNC_TRUST_REJECTED',
        untrustedWriters: untrusted,
        ...context,
      });
      return { allowed: false, untrustedWriters: untrusted, verdict: 'rejected' };
    }

    this._logger.warn('Trust gate: untrusted writers allowed (log-only mode)', {
      code: 'SYNC_TRUST_WARN',
      untrustedWriters: untrusted,
      ...context,
    });
    return { allowed: true, untrustedWriters: untrusted, verdict: 'warn_allowed' };
  }

  /**
   * Handles trust evaluation errors with fail-open/fail-closed semantics.
   * @param {unknown} err
   * @param {string[]} writerIds
   * @param {Record<string, unknown>} context
   * @returns {TrustGateResult}
   * @private
   */
  _handleError(err, writerIds, context) {
    this._logger.error('Trust gate evaluation failed', {
      code: 'SYNC_TRUST_ERROR',
      error: err instanceof Error ? err.message : String(err),
      ...context,
    });

    if (this._mode === 'enforce') {
      return { allowed: false, untrustedWriters: writerIds, verdict: 'error_rejected' };
    }
    return { allowed: true, untrustedWriters: [], verdict: 'error_allowed' };
  }

  /**
   * Extracts writer IDs from patches in a sync response.
   * These are the actual data authors being ingested — the trust target.
   *
   * @param {Array<{writerId: string}>} patches - Patches from sync response
   * @returns {string[]} Deduplicated writer IDs
   */
  static extractWritersFromPatches(patches) {
    const writers = new Set();
    for (const { writerId } of patches) {
      if (writerId) {
        writers.add(writerId);
      }
    }
    return [...writers];
  }
}
