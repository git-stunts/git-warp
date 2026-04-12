/**
 * SyncTrustGate -- Encapsulates trust evaluation for sync operations.
 *
 * Evaluates whether inbound patch authors are trusted according to the
 * trust record chain. Used by SyncController to validate HTTP sync
 * responses before applying patches.
 *
 * @module domain/services/sync/SyncTrustGate
 * @see B1 -- Signed sync ingress
 */

import nullLogger from '../../utils/nullLogger.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';

export type TrustMode = 'enforce' | 'log-only' | 'off';

export interface TrustGateResult {
  allowed: boolean;
  untrustedWriters: string[];
  verdict: string;
}

export interface TrustEvaluator {
  evaluateWriters(writerIds: string[]): Promise<{ trusted: Set<string> }>;
}

const PASS = (): TrustGateResult => ({ allowed: true, untrustedWriters: [], verdict: 'pass' });

function resolveGateOptions(options: {
  trustEvaluator?: TrustEvaluator;
  trustMode?: TrustMode;
  logger?: LoggerPort;
} | undefined): { evaluator: TrustEvaluator | null; mode: TrustMode; logger: LoggerPort } {
  const resolved = options ?? {};
  return {
    evaluator: resolved.trustEvaluator ?? null,
    mode: resolved.trustMode ?? 'off',
    logger: resolved.logger ?? nullLogger,
  };
}

export default class SyncTrustGate {
  private readonly _evaluator: TrustEvaluator | null;
  private readonly _mode: TrustMode;
  private readonly _logger: LoggerPort;

  constructor(options?: { trustEvaluator?: TrustEvaluator; trustMode?: TrustMode; logger?: LoggerPort }) {
    const { evaluator, mode, logger } = resolveGateOptions(options);
    this._evaluator = evaluator;
    this._mode = mode;
    this._logger = logger;
  }

  async evaluate(writerIds: string[], context: Record<string, unknown> = {}): Promise<TrustGateResult> {
    const earlyResult = this._checkEarlyExit(writerIds);
    if (earlyResult) { return earlyResult; }

    try {
      const result = await this._evaluator!.evaluateWriters(writerIds);
      const untrusted = writerIds.filter((id) => !result.trusted.has(id));
      return this._decide(untrusted, writerIds, context);
    } catch (err) {
      return this._handleError(err, writerIds, context);
    }
  }

  private _checkEarlyExit(writerIds: string[]): TrustGateResult | null {
    if (this._mode === 'off' || !this._evaluator) {
      return { allowed: true, untrustedWriters: [], verdict: 'trust_disabled' };
    }
    if (writerIds.length === 0) {
      return { allowed: true, untrustedWriters: [], verdict: 'no_writers' };
    }
    return null;
  }

  private _decide(untrusted: string[], writerIds: string[], context: Record<string, unknown>): TrustGateResult {
    this._logger.info('Trust gate decision', {
      code: 'SYNC_TRUST_GATE',
      mode: this._mode,
      writersApplied: writerIds,
      untrustedWriters: untrusted,
      verdict: untrusted.length === 0 ? 'pass' : 'fail',
      ...context,
    });

    if (untrusted.length === 0) { return PASS(); }

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

  private _handleError(err: unknown, writerIds: string[], context: Record<string, unknown>): TrustGateResult {
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

  static extractWritersFromPatches(patches: Array<{ writerId: string }>): string[] {
    const writers = new Set<string>();
    for (const { writerId } of patches) {
      if (writerId) { writers.add(writerId); }
    }
    return [...writers];
  }
}
