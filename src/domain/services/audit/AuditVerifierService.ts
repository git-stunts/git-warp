/**
 * Facade for audit chain verification and trust evaluation.
 *
 * Composes AuditChainVerifier (chain walking) and TrustEvaluationService
 * (signed evidence evaluation) into a single service interface consumed
 * by WarpRuntime.
 *
 * @module domain/services/audit/AuditVerifierService
 */

import type CodecPort from '../../../ports/CodecPort.ts';
import type CommitPort from '../../../ports/CommitPort.ts';
import type RefPort from '../../../ports/RefPort.ts';
import type BlobPort from '../../../ports/BlobPort.ts';
import type TreePort from '../../../ports/TreePort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type TrustChainPort from '../../../ports/TrustChainPort.ts';
import { buildAuditPrefix } from '../../utils/RefLayout.ts';
import AuditChainVerifier, { type ChainResult } from './AuditChainVerifier.ts';
import TrustEvaluationService, { type TrustEvaluationOptions } from './TrustEvaluationService.ts';
import { TrustAssessment } from '../../trust/TrustAssessment.ts';

type TrustWarning = {
  code: string;
  message: string;
  sources: string[];
};

type VerifyResult = {
  graph: string;
  verifiedAt: string;
  summary: { total: number; valid: number; partial: number; invalid: number };
  chains: ChainResult[];
  trustWarning: TrustWarning | null;
};

type Persistence = CommitPort & RefPort & BlobPort & TreePort;

type TrustCrypto = {
  verifySignature: (params: {
    algorithm: string;
    publicKeyBase64: string;
    signatureBase64: string;
    payload: Uint8Array;
  }) => boolean;
  computeKeyFingerprint: (publicKeyBase64: string) => string;
};

export default class AuditVerifierService {
  private readonly _chainVerifier: AuditChainVerifier;
  private readonly _trustService: TrustEvaluationService;
  private readonly _persistence: Persistence;
  readonly logger: LoggerPort | null;

  constructor(opts: {
    persistence: Persistence;
    codec: CodecPort;
    logger?: LoggerPort;
    trustCrypto?: TrustCrypto;
    trustChain?: TrustChainPort;
  }) {
    this._persistence = opts.persistence;
    this.logger = opts.logger ?? null;
    this._chainVerifier = new AuditChainVerifier(opts.persistence, opts.codec);
    this._trustService = new TrustEvaluationService({
      listWriterIds: (graphName) => this._listWriterIds(graphName),
      ...(opts.trustChain !== undefined ? { trustChain: opts.trustChain } : {}),
      ...(opts.trustCrypto !== undefined ? { trustCrypto: opts.trustCrypto } : {}),
    });
  }

  /** Verifies all audit chains for a graph. */
  async verifyAll(
    graphName: string,
    options: { since?: string; trustWarning?: TrustWarning | null; verifiedAt?: string } = {},
  ): Promise<VerifyResult> {
    const chains = await this._verifyAllChains(graphName, options.since);
    return this._buildVerifyResult(graphName, chains, options);
  }

  private async _verifyAllChains(graphName: string, since: string | undefined): Promise<ChainResult[]> {
    const writerIds = await this._listWriterIds(graphName);
    const chains: ChainResult[] = [];
    for (const writerId of writerIds.sort()) {
      const result = await this._chainVerifier.verifyChain(
        graphName, writerId,
        since !== undefined ? { since } : {},
      );
      chains.push(result);
    }
    return chains;
  }

  private _buildVerifyResult(
    graphName: string,
    chains: ChainResult[],
    options: { trustWarning?: TrustWarning | null; verifiedAt?: string },
  ): VerifyResult {
    const valid = chains.filter((c) => c.status === 'VALID').length;
    const partial = chains.filter((c) => c.status === 'PARTIAL').length;
    return {
      graph: graphName,
      verifiedAt: options.verifiedAt ?? '',
      summary: { total: chains.length, valid, partial, invalid: chains.length - valid - partial },
      chains,
      trustWarning: options.trustWarning ?? null,
    };
  }

  /** Verifies a single writer's audit chain. */
  async verifyChain(
    graphName: string,
    writerId: string,
    options?: { since?: string },
  ): Promise<ChainResult> {
    return await this._chainVerifier.verifyChain(graphName, writerId, options);
  }

  /** Evaluates trust for all writers of a graph using signed evidence. */
  async evaluateTrust(
    graphName: string,
    options?: TrustEvaluationOptions,
  ): Promise<TrustAssessment> {
    return await this._trustService.evaluateTrust(graphName, options);
  }

  private async _listWriterIds(graphName: string): Promise<string[]> {
    const prefix = buildAuditPrefix(graphName);
    const refs: string[] = await this._persistence.listRefs(prefix);
    return refs
      .map((ref) => ref.slice(prefix.length))
      .filter((id) => id.length > 0);
  }
}

export type { ChainResult, TrustWarning, VerifyResult };
