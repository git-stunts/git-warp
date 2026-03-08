/**
 * Trust V1 record service.
 *
 * Manages the append-only chain of signed trust records stored under
 * `refs/warp/<graph>/trust/records`. Each record is a Git commit
 * whose message carries CBOR-encoded record data.
 *
 * @module domain/trust/TrustRecordService
 * @see docs/specs/TRUST_V1_CRYPTO.md Section 7
 */

import { buildTrustRecordRef } from '../utils/RefLayout.js';
import { TrustRecordSchema } from './schemas.js';
import { verifyRecordId } from './TrustCanonical.js';
import PersistenceError from '../errors/PersistenceError.js';
import TrustError from '../errors/TrustError.js';

/**
 * Maximum CAS attempts for _persistRecord before giving up.
 * Handles transient failures (lock contention, I/O race).
 * @type {number}
 */
const MAX_CAS_ATTEMPTS = 3;

/**
 * @typedef {Object} AppendOptions
 * @property {boolean} [skipSignatureVerify=false] - Skip signature verification (for testing)
 */

/**
 * @typedef {{ok: true, records: Array<Record<string, unknown>>} | {ok: false, error: Error}} ReadRecordsResult
 */

export class TrustRecordService {
  /**
   * @param {{ persistence: import('../../ports/CommitPort.js').default & import('../../ports/BlobPort.js').default & import('../../ports/TreePort.js').default & import('../../ports/RefPort.js').default, codec: import('../../ports/CodecPort.js').default }} options
   */
  constructor({ persistence, codec }) {
    this._persistence = persistence;
    this._codec = codec;
  }

  /**
   * Appends a signed trust record to the chain.
   *
   * Validates:
   * 1. Schema conformance
   * 2. RecordId integrity (content-addressed)
   * 3. Signature envelope completeness (alg + sig fields present)
   * 4. Prev-link consistency (must match current tip's last recordId)
   *
   * Note: Full cryptographic signature verification (Ed25519 verify against
   * issuer public key) is NOT performed here — it requires the trust state
   * to resolve the issuer's key, which is a chicken-and-egg problem for
   * genesis records. Crypto verification happens during `buildState()` /
   * evaluation when the full key set is available.
   *
   * @param {string} graphName
   * @param {Record<string, unknown>} record - Complete signed trust record
   * @param {AppendOptions} [options]
   * @returns {Promise<{commitSha: string, ref: string}>}
   */
  async appendRecord(graphName, record, options = {}) {
    // 1. Schema validation
    const parsed = TrustRecordSchema.safeParse(record);
    if (!parsed.success) {
      throw new TrustError(
        `Trust record schema validation failed: ${parsed.error.message}`,
        { code: 'E_TRUST_RECORD_INVALID' },
      );
    }

    // 2. RecordId integrity
    if (!await verifyRecordId(record)) {
      throw new TrustError(
        'Trust record recordId does not match content',
        { code: 'E_TRUST_RECORD_ID_MISMATCH' },
      );
    }

    // 3. Signature envelope check (structural, not cryptographic)
    if (!options.skipSignatureVerify) {
      this._verifySignatureEnvelope(record);
    }

    // 4. Prev-link consistency
    const ref = buildTrustRecordRef(graphName);
    const { tipSha, recordId: currentTip } = await this._readTip(ref);

    if (record.prev !== currentTip) {
      throw new TrustError(
        `Prev-link mismatch: record.prev=${record.prev}, chain tip=${currentTip}`,
        { code: 'E_TRUST_PREV_MISMATCH' },
      );
    }

    // 5. Persist as Git commit (passes tipSha to avoid re-reading ref)
    const commitSha = await this._persistRecord(ref, record, tipSha);
    return { commitSha, ref };
  }

  /**
   * Reads all trust records from the chain, oldest first.
   *
   * @param {string} graphName
   * @param {{ tip?: string }} [options]
   * @returns {Promise<ReadRecordsResult>}
   */
  async readRecords(graphName, options = {}) {
    const ref = buildTrustRecordRef(graphName);
    let tip = options.tip ?? null;

    try {
      if (!tip) {
        try {
          tip = await this._persistence.readRef(ref);
        } catch (err) {
          // Distinguish "ref not found" from operational error (J15)
          if (err instanceof PersistenceError && err.code === PersistenceError.E_REF_NOT_FOUND) {
            return { ok: true, records: [] };
          }
          return {
            ok: false,
            error: new TrustError(
              `Failed to read trust chain ref: ${err instanceof Error ? err.message : String(err)}`,
              { code: 'E_TRUST_READ_FAILED' },
            ),
          };
        }
        if (!tip) {
          return { ok: true, records: [] };
        }
      }

      const records = [];
      let current = tip;

      while (current) {
        const info = await this._persistence.getNodeInfo(current);
        const entries = await this._persistence.readTreeOids(
          await this._persistence.getCommitTree(current),
        );
        const blobOid = entries['record.cbor'];
        if (!blobOid) {
          break;
        }
        const record = /** @type {Record<string, unknown>} */ (this._codec.decode(
          await this._persistence.readBlob(blobOid),
        ));

        records.unshift(record);

        if (info.parents.length === 0) {
          break;
        }
        current = info.parents[0];
      }

      return { ok: true, records };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }

  /**
   * Verifies the structural integrity of a record chain.
   *
   * Checks:
   * - Prev-links form an unbroken chain
   * - No duplicate recordIds
   * - Each record passes schema validation
   * - First record has prev=null
   *
   * @param {Array<Record<string, unknown>>} records - Records in chain order (oldest first)
   * @returns {Promise<{valid: boolean, errors: Array<{index: number, error: string}>}>}
   */
  async verifyChain(records) {
    /** @type {Array<{index: number, error: string}>} */
    const errors = [];
    const seenIds = new Set();

    for (let i = 0; i < records.length; i++) {
      const record = records[i];

      // Schema validation
      const parsed = TrustRecordSchema.safeParse(record);
      if (!parsed.success) {
        errors.push({ index: i, error: `Schema: ${parsed.error.message}` });
        continue;
      }

      // RecordId integrity
      if (!await verifyRecordId(record)) {
        errors.push({ index: i, error: 'RecordId does not match content' });
      }

      // Duplicate detection
      if (seenIds.has(record.recordId)) {
        errors.push({ index: i, error: `Duplicate recordId: ${record.recordId}` });
      }
      seenIds.add(record.recordId);

      // Prev-link check
      if (i === 0) {
        if (record.prev !== null) {
          errors.push({ index: i, error: `Genesis record must have prev=null, got ${JSON.stringify(record.prev)}` });
        }
      } else {
        const expectedPrev = records[i - 1].recordId;
        if (record.prev !== expectedPrev) {
          errors.push({
            index: i,
            error: `Prev-link mismatch: expected ${expectedPrev}, got ${record.prev}`,
          });
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Appends a trust record with automatic retry on CAS conflict.
   *
   * On E_TRUST_CAS_CONFLICT, re-reads the chain tip, rebuilds the record
   * with the new prev pointer, re-signs if a signer is provided, and
   * retries. This is the higher-level API callers should use when they
   * want automatic convergence under concurrent appenders.
   *
   * @param {string} graphName
   * @param {Record<string, unknown>} record - Complete signed trust record
   * @param {{ maxRetries?: number, resign?: ((record: Record<string, unknown>) => Promise<Record<string, unknown>>)|null, skipSignatureVerify?: boolean }} [options]
   * @returns {Promise<{commitSha: string, ref: string, attempts: number}>}
   * @throws {TrustError} E_TRUST_CAS_EXHAUSTED if all retries fail
   */
  async appendRecordWithRetry(graphName, record, options = {}) {
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

        // Rebuild: re-read chain tip, update prev pointer
        const freshTipRecordId = err.context?.actualTipRecordId ?? null;

        // Update prev to the new chain tip's recordId
        currentRecord = { ...currentRecord, prev: freshTipRecordId };

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
   * Validates that a record's signature envelope is structurally complete.
   *
   * Checks for presence of `alg` and `sig` fields. Does NOT perform
   * cryptographic verification — that requires the issuer's public key
   * from the trust state, which is resolved during evaluation.
   *
   * @param {Record<string, unknown>} record
   * @throws {TrustError} if signature envelope is missing or malformed
   * @private
   */
  _verifySignatureEnvelope(record) {
    const sig = /** @type {Record<string, unknown>|undefined} */ (record.signature);
    if (!sig || !sig.sig || !sig.alg) {
      throw new TrustError(
        'Trust record missing or malformed signature',
        { code: 'E_TRUST_SIGNATURE_MISSING' },
      );
    }
  }

  /**
   * Reads the tip commit SHA and its recordId.
   * @param {string} ref
   * @returns {Promise<{tipSha: string|null, recordId: string|null}>}
   * @private
   */
  async _readTip(ref) {
    let tipSha;
    try {
      tipSha = await this._persistence.readRef(ref);
    } catch {
      return { tipSha: null, recordId: null };
    }
    if (!tipSha) {
      return { tipSha: null, recordId: null };
    }

    const treeOid = await this._persistence.getCommitTree(tipSha);
    const entries = await this._persistence.readTreeOids(treeOid);
    const blobOid = entries['record.cbor'];
    if (!blobOid) {
      return { tipSha, recordId: null };
    }

    const record = /** @type {Record<string, unknown>} */ (this._codec.decode(await this._persistence.readBlob(blobOid)));
    return { tipSha, recordId: /** @type {string|null} */ (record.recordId) ?? null };
  }

  /**
   * Persists a trust record as a Git commit with CAS retry.
   *
   * On transient CAS failures (ref unchanged, e.g. lock contention), retries
   * up to MAX_CAS_ATTEMPTS total. On real concurrent appends (ref advanced),
   * throws E_TRUST_CAS_CONFLICT so the caller can rebuild + re-sign the record.
   *
   * The record's prev, recordId, and signature form a cryptographic chain.
   * Only the original signer can rebuild, so we never silently rebase.
   *
   * @param {string} ref
   * @param {Record<string, unknown>} record
   * @param {string|null} parentSha - Resolved tip SHA (null for genesis)
   * @returns {Promise<string>} commit SHA
   * @private
   */
  async _persistRecord(ref, record, parentSha) {
    // Encode record as CBOR blob
    const encoded = this._codec.encode(record);
    const blobOid = await this._persistence.writeBlob(encoded);

    // Create tree with single entry (mktree format)
    const treeOid = await this._persistence.writeTree([`100644 blob ${blobOid}\trecord.cbor`]);

    const parents = parentSha ? [parentSha] : [];
    const rType = typeof record.recordType === 'string' ? record.recordType : '';
    const rId = typeof record.recordId === 'string' ? record.recordId.slice(0, 12) : '';
    const message = `trust: ${rType} ${rId}`;

    const commitSha = await this._persistence.commitNodeWithTree({
      treeOid,
      parents,
      message,
    });

    // CAS update ref with retry for transient failures
    for (let attempt = 1; attempt <= MAX_CAS_ATTEMPTS; attempt++) {
      try {
        await this._persistence.compareAndSwapRef(ref, commitSha, parentSha);
        return commitSha;
      } catch {
        // Read fresh tip to distinguish transient vs real conflict
        const { tipSha: freshTipSha, recordId: freshRecordId } = await this._readTip(ref);

        if (freshTipSha === parentSha) {
          // Ref unchanged — transient failure (lock contention, I/O race).
          // Retry the same CAS with same commit.
          if (attempt === MAX_CAS_ATTEMPTS) {
            throw new TrustError(
              `Trust CAS exhausted after ${MAX_CAS_ATTEMPTS} attempts`,
              { code: 'E_TRUST_CAS_EXHAUSTED' },
            );
          }
          continue;
        }

        // Ref changed — real concurrent append. Our record's prev no longer
        // matches the chain tip. The caller must rebuild, re-sign, and retry.
        throw new TrustError(
          `Trust CAS conflict: chain advanced from ${parentSha} to ${freshTipSha}`,
          {
            code: 'E_TRUST_CAS_CONFLICT',
            context: {
              expectedTipSha: parentSha,
              actualTipSha: freshTipSha,
              actualTipRecordId: freshRecordId,
            },
          },
        );
      }
    }

    // Unreachable, but satisfies type checker
    throw new TrustError('Trust CAS failed', { code: 'E_TRUST_CAS_EXHAUSTED' });
  }
}
