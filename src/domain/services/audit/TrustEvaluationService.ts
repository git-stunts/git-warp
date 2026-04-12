/**
 * Evaluates trust for graph writers using signed evidence.
 *
 * Reads trust record chains via TrustChainPort, builds trust state,
 * evaluates writer policies, and returns TrustAssessment.
 *
 * @module domain/services/audit/TrustEvaluationService
 */

import type TrustChainPort from '../../../ports/TrustChainPort.ts';
import type { TrustRecord } from '../../trust/TrustRecord.ts';
import { evaluateWriters } from '../../trust/TrustEvaluator.ts';
import { TrustAssessment, type TrustSource } from '../../trust/TrustAssessment.ts';
import { buildState } from '../../trust/TrustStateBuilder.ts';
import { TRUST_REASON_CODES } from '../../trust/reasonCodes.ts';
import defaultTrustCrypto from '../../utils/defaultTrustCrypto.ts';

type TrustAssessmentStatus = 'configured' | 'pinned' | 'error' | 'not_configured';

type TrustCrypto = {
  verifySignature: (params: {
    algorithm: string;
    publicKeyBase64: string;
    signatureBase64: string;
    payload: Uint8Array;
  }) => boolean;
  computeKeyFingerprint: (publicKeyBase64: string) => string;
};

export type TrustEvaluationOptions = {
  pin?: string;
  mode?: string;
  writerIds?: string[];
  source?: string;
  sourceDetail?: string | null;
  status?: TrustAssessmentStatus;
};

function isNonEmptyStr(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

type ResolvedSource = { status: TrustAssessmentStatus; source: string; sourceDetail: string | null };

function resolveTrustSource(options: TrustEvaluationOptions): ResolvedSource {
  const pinned = isNonEmptyStr(options.pin);
  return {
    status: resolveField(options.status, pinned ? 'pinned' : 'configured'),
    source: resolveField(options.source, pinned ? 'pinned' : 'ref'),
    sourceDetail: options.sourceDetail ?? options.pin ?? null,
  };
}

function resolveField<T extends string>(explicit: T | undefined, fallback: T): T {
  return isNonEmptyStr(explicit) ? explicit : fallback;
}

type FailureParams = {
  status: TrustAssessmentStatus;
  source: string;
  sourceDetail: string | null;
  writerIds?: string[];
  recordsScanned?: number;
  reasonCode: string;
  reason: string;
};

function buildFailureExplanations(
  writers: string[],
  reasonCode: string,
  reason: string,
): Array<{ writerId: string; trusted: boolean; reasonCode: string; reason: string }> {
  if (writers.length > 0) {
    return writers.map((writerId) => ({ writerId, trusted: false, reasonCode, reason }));
  }
  return [{ writerId: '*', trusted: false, reasonCode, reason }];
}

function buildFailureAssessment(params: FailureParams): TrustAssessment {
  const evaluatedWriters = [...(params.writerIds ?? [])].sort();
  // Pre-existing: source values ('pinned', 'configured') don't match
  // TrustSource union. Tracked as bad-code/TRUST_source-enum-mismatch.
  return new TrustAssessment({
    status: params.status,
    source: params.source as TrustSource,
    sourceDetail: params.sourceDetail,
    evaluatedWriters, untrustedWriters: evaluatedWriters,
    explanations: buildFailureExplanations(evaluatedWriters, params.reasonCode, params.reason),
    evidenceSummary: {
      recordsScanned: params.recordsScanned ?? 0,
      activeKeys: 0, revokedKeys: 0, activeBindings: 0, revokedBindings: 0,
    },
  });
}

/**
 * Evaluates trust for graph writers using the trust record chain.
 */
export default class TrustEvaluationService {
  private readonly _trustChain: TrustChainPort | null;
  private readonly _trustCrypto: TrustCrypto;
  private readonly _listWriterIds: (graphName: string) => Promise<string[]>;

  constructor(opts: {
    trustChain?: TrustChainPort;
    trustCrypto?: TrustCrypto;
    listWriterIds: (graphName: string) => Promise<string[]>;
  }) {
    this._trustChain = opts.trustChain ?? null;
    this._trustCrypto = opts.trustCrypto ?? defaultTrustCrypto;
    this._listWriterIds = opts.listWriterIds;
  }

  async evaluateTrust(
    graphName: string,
    options: TrustEvaluationOptions = {},
  ): Promise<TrustAssessment> {
    const resolved = resolveTrustSource(options);
    const earlyExit = this._checkPreconditions(resolved);
    if (earlyExit) { return earlyExit; }

    const readResult = await this._readRecords(graphName, options.pin);
    if (readResult.error !== null) {
      return this._failWith(resolved, `Trust chain read failed: ${readResult.error}`);
    }
    if (readResult.records.length === 0) {
      return this._buildNotConfiguredAssessment();
    }
    return await this._evaluateWithState(readResult.records, graphName, {
      options, ...resolved,
    });
  }

  private _checkPreconditions(resolved: ResolvedSource): TrustAssessment | null {
    if (!this._trustChain) {
      return this._failWith(resolved, 'Trust chain port not configured');
    }
    return null;
  }

  private _failWith(resolved: ResolvedSource, reason: string): TrustAssessment {
    return buildFailureAssessment({
      status: 'error', source: resolved.source, sourceDetail: resolved.sourceDetail,
      reasonCode: TRUST_REASON_CODES.TRUST_RECORD_CHAIN_INVALID, reason,
    });
  }

  private async _readRecords(
    graphName: string,
    pin?: string,
  ): Promise<{ records: TrustRecord[]; error: string | null }> {
    const tip = isNonEmptyStr(pin) ? pin : undefined;
    const records: TrustRecord[] = [];
    try {
      for await (const record of this._trustChain!.readRecords(graphName, tip)) {
        records.push(record);
      }
      return { records, error: null };
    } catch (err) {
      return { records: [], error: err instanceof Error ? err.message : String(err) };
    }
  }

  private _buildNotConfiguredAssessment(): TrustAssessment {
    return new TrustAssessment({
      status: 'not_configured',
      source: 'none',
      sourceDetail: null,
      evaluatedWriters: [],
      untrustedWriters: [],
      explanations: [],
      evidenceSummary: {
        recordsScanned: 0, activeKeys: 0, revokedKeys: 0,
        activeBindings: 0, revokedBindings: 0,
      },
    });
  }

  private async _evaluateWithState(records: TrustRecord[], graphName: string, ctx: {
    options: TrustEvaluationOptions;
    status: TrustAssessmentStatus;
    source: string;
    sourceDetail: string | null;
  }): Promise<TrustAssessment> {
    const trustState = await this._buildTrustState(records);
    const writerIds = ctx.options.writerIds
      ? [...ctx.options.writerIds]
      : await this._listWriterIds(graphName);

    const policy = {
      schemaVersion: 1 as const,
      mode: (ctx.options.mode ?? 'warn') as 'enforce' | 'warn',
      writerPolicy: 'all_writers_must_be_trusted' as const,
    };
    const assessment = evaluateWriters(writerIds, trustState, policy);
    return new TrustAssessment({
      ...assessment.trust,
      status: assessment.trust.status === 'error' ? 'error' : ctx.status,
      source: ctx.source as TrustSource,
      sourceDetail: ctx.sourceDetail,
    });
  }

  private async _buildTrustState(records: TrustRecord[]) {
    return await buildState(records, {
      signatureVerifier: (record, publicKeyBase64) =>
        this._trustCrypto.verifySignature({
          algorithm: record.signature.alg,
          publicKeyBase64,
          signatureBase64: record.signature.sig,
          payload: record.signaturePayload,
        }),
      computeKeyFingerprint: (publicKeyBase64) =>
        this._trustCrypto.computeKeyFingerprint(publicKeyBase64),
    });
  }
}
