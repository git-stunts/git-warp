/**
 * Trust V1 record service — domain validation layer.
 *
 * Validates trust records (schema, prev-link, signature envelope)
 * and delegates persistence to TrustChainPort. No encoding, no
 * Git object construction, no I/O beyond port calls.
 *
 * @module domain/trust/TrustRecordService
 * @see docs/specs/TRUST_CRYPTO_ALGORITHM.md Section 7
 */

import type TrustChainPort from '../../ports/TrustChainPort.ts';
import type { TrustRecord } from './TrustRecord.ts';
import TrustError from '../errors/TrustError.ts';

// -- Append options -----------------------------------------------------------

type AppendOptions = {
  readonly skipSignatureVerify?: boolean;
};

type RetryOptions = {
  readonly maxRetries?: number;
  readonly resign?: ((record: TrustRecord) => Promise<TrustRecord>) | null;
  readonly skipSignatureVerify?: boolean;
};

// -- Service ------------------------------------------------------------------

class TrustRecordService {
  private readonly _chain: TrustChainPort;

  constructor(chain: TrustChainPort) {
    this._chain = chain;
  }

  /**
   * Appends a signed trust record to the chain.
   *
   * Validates:
   * 1. Signature envelope completeness (alg + sig fields present)
   * 2. Prev-link consistency (must match current tip's recordId)
   *
   * RecordId integrity and schema validation are handled at the
   * adapter boundary (TrustRecord.fromDecoded + hash verification).
   */
  async appendRecord(
    graphName: string,
    record: TrustRecord,
    options: AppendOptions = {},
  ): Promise<{ commitSha: string }> {
    // 1. Signature envelope check (structural, not cryptographic)
    if (options.skipSignatureVerify !== true) {
      verifySignatureEnvelope(record);
    }

    // 2. Prev-link consistency
    const tip = await this._chain.readTip(graphName);
    const currentTipRecordId = tip?.recordId ?? null;

    if (record.prev !== currentTipRecordId) {
      throw new TrustError(
        `Prev-link mismatch: record.prev=${String(record.prev)}, chain tip=${String(currentTipRecordId)}`,
        { code: 'E_TRUST_PREV_MISMATCH' },
      );
    }

    // 3. Persist via port
    const parentTipSha = tip?.tipSha ?? null;
    const commitSha = await this._chain.persistRecord(graphName, record, parentTipSha);
    return { commitSha };
  }

  /**
   * Appends with automatic retry on CAS conflict.
   *
   * On E_TRUST_CAS_CONFLICT, reads the fresh tip recordId, updates
   * the record's prev pointer, optionally re-signs, and retries.
   */
  async appendRecordWithRetry(
    graphName: string,
    record: TrustRecord,
    options: RetryOptions = {},
  ): Promise<{ commitSha: string; attempts: number }> {
    const { maxRetries = 3, resign = null, skipSignatureVerify = false } = options;
    let currentRecord = record;
    let attempts = 0;

    for (let i = 0; i <= maxRetries; i++) {
      attempts++;
      try {
        const result = await this.appendRecord(graphName, currentRecord, { skipSignatureVerify });
        return { ...result, attempts };
      } catch (err) {
        if (!(err instanceof TrustError) || err.code !== 'E_TRUST_CAS_CONFLICT') {
          throw err;
        }

        if (i === maxRetries) {
          throw new TrustError(
            `Trust CAS exhausted after ${attempts} attempts (with retry)`,
            { code: 'E_TRUST_CAS_EXHAUSTED' },
          );
        }

        // Re-sign if signer is provided
        if (resign) {
          currentRecord = await resign(currentRecord);
        }
      }
    }

    // Unreachable
    throw new TrustError('Trust CAS failed', { code: 'E_TRUST_CAS_EXHAUSTED' });
  }

  /**
   * Streams trust records from the chain, oldest first.
   * Delegates directly to the port — domain adds no logic here.
   */
  readRecords(graphName: string, tip?: string): AsyncIterable<TrustRecord> {
    return this._chain.readRecords(graphName, tip);
  }

  /**
   * Reads the chain tip (commit SHA + recordId).
   */
  async readTip(graphName: string): Promise<{ tipSha: string; recordId: string | null } | null> {
    return await this._chain.readTip(graphName);
  }
}

// -- Helpers ------------------------------------------------------------------

function verifySignatureEnvelope(record: TrustRecord): void {
  if (record.signature.alg !== 'ed25519') {
    throw new TrustError(
      'Unsupported signature algorithm',
      { code: 'E_TRUST_SIGNATURE_MISSING' },
    );
  }
  if (record.signature.sig.length === 0) {
    throw new TrustError(
      'Trust record has empty signature',
      { code: 'E_TRUST_SIGNATURE_MISSING' },
    );
  }
}

export { TrustRecordService };
export type { AppendOptions, RetryOptions };
