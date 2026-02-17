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
import TrustError from '../errors/TrustError.js';

/**
 * @typedef {Object} AppendOptions
 * @property {boolean} [skipSignatureVerify=false] - Skip signature verification (for testing)
 */

export class TrustRecordService {
  /**
   * @param {Object} options
   * @param {*} options.persistence - GraphPersistencePort adapter
   * @param {*} options.codec - CodecPort adapter (CBOR)
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
   * @param {Record<string, *>} record - Complete signed trust record
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
    if (!verifyRecordId(record)) {
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
   * @param {Object} [options]
   * @param {string} [options.tip] - Override tip commit (for pinned reads)
   * @returns {Promise<Array<Record<string, *>>>}
   */
  async readRecords(graphName, options = {}) {
    const ref = buildTrustRecordRef(graphName);
    let tip = options.tip ?? null;

    if (!tip) {
      try {
        tip = await this._persistence.readRef(ref);
      } catch {
        return [];
      }
      if (!tip) {
        return [];
      }
    }

    const records = [];
    let current = tip;

    while (current) {
      const info = await this._persistence.getNodeInfo(current);
      const record = this._codec.decode(
        await this._persistence.readBlob(
          (await this._persistence.readTreeOids(
            await this._persistence.getCommitTree(current),
          ))['record.cbor'],
        ),
      );

      records.unshift(record);

      if (info.parents.length === 0) {
        break;
      }
      current = info.parents[0];
    }

    return records;
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
   * @param {Array<Record<string, *>>} records - Records in chain order (oldest first)
   * @returns {{valid: boolean, errors: Array<{index: number, error: string}>}}
   */
  verifyChain(records) {
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
      if (!verifyRecordId(record)) {
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
          errors.push({ index: i, error: `Genesis record must have prev=null, got ${record.prev}` });
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
   * Validates that a record's signature envelope is structurally complete.
   *
   * Checks for presence of `alg` and `sig` fields. Does NOT perform
   * cryptographic verification — that requires the issuer's public key
   * from the trust state, which is resolved during evaluation.
   *
   * @param {Record<string, *>} record
   * @throws {TrustError} if signature envelope is missing or malformed
   * @private
   */
  _verifySignatureEnvelope(record) {
    if (!record.signature || !record.signature.sig || !record.signature.alg) {
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

    const record = this._codec.decode(await this._persistence.readBlob(blobOid));
    return { tipSha, recordId: record.recordId ?? null };
  }

  /**
   * Persists a trust record as a Git commit.
   * @param {string} ref
   * @param {Record<string, *>} record
   * @param {string|null} parentSha - Resolved tip SHA (null for genesis)
   * @returns {Promise<string>} commit SHA
   * @private
   */
  async _persistRecord(ref, record, parentSha) {
    // Encode record as CBOR blob
    const encoded = this._codec.encode(record);
    const blobOid = await this._persistence.writeBlob(encoded);

    // Create tree with single entry
    const treeOid = await this._persistence.writeTree({ 'record.cbor': blobOid });

    const parents = parentSha ? [parentSha] : [];
    const message = `trust: ${record.recordType} ${record.recordId.slice(0, 12)}`;

    const commitSha = await this._persistence.createCommit({
      tree: treeOid,
      parents,
      message,
    });

    // CAS update ref — fails atomically if a concurrent append changed the tip
    await this._persistence.compareAndSwapRef(ref, commitSha, parentSha);

    return commitSha;
  }
}
