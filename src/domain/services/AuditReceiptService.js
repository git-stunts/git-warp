/**
 * AuditReceiptService — persistent, chained, tamper-evident audit receipts.
 *
 * When audit mode is enabled, each data commit produces a corresponding
 * audit commit recording per-operation outcomes. Audit commits form an
 * independent chain per (graphName, writerId) pair, linked via
 * `prevAuditCommit` and Git commit parents.
 *
 * @module domain/services/AuditReceiptService
 * @see docs/specs/AUDIT_RECEIPT.md
 */

import { buildAuditRef } from '../utils/RefLayout.js';
import { encodeAuditMessage } from './AuditMessageCodec.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Domain-separated prefix for opsDigest computation.
 * The trailing \0 is a literal null byte (U+0000) acting as an
 * unambiguous delimiter between the prefix and the JSON payload.
 * @type {string}
 */
export const OPS_DIGEST_PREFIX = 'git-warp:opsDigest:v1\0';

// ============================================================================
// Normative Canonicalization Helpers (DO NOT ALTER — tied to spec Sections 5.2-5.3)
// ============================================================================

/**
 * JSON.stringify replacer that sorts object keys lexicographically
 * at every nesting level. Produces canonical JSON per spec Section 5.2.
 *
 * @param {string} _key
 * @param {unknown} value
 * @returns {unknown}
 */
export function sortedReplacer(_key, value) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const sorted = /** @type {Record<string, unknown>} */ ({});
    const obj = /** @type {Record<string, unknown>} */ (value);
    for (const k of Object.keys(obj).sort()) {
      sorted[k] = obj[k];
    }
    return sorted;
  }
  return value;
}

/**
 * Produces canonical JSON string of an ops array per spec Section 5.2.
 * Exported for testing.
 *
 * @param {ReadonlyArray<Readonly<import('../types/TickReceipt.js').OpOutcome>>} ops
 * @returns {string}
 */
export function canonicalOpsJson(ops) {
  return JSON.stringify(ops, sortedReplacer);
}

/** @type {TextEncoder} */
const textEncoder = new TextEncoder();

/**
 * Computes the domain-separated SHA-256 opsDigest per spec Section 5.3.
 *
 * @param {ReadonlyArray<Readonly<import('../types/TickReceipt.js').OpOutcome>>} ops
 * @param {import('../../ports/CryptoPort.js').default} crypto - Crypto adapter
 * @returns {Promise<string>} Lowercase hex SHA-256 digest
 */
export async function computeOpsDigest(ops, crypto) {
  const json = canonicalOpsJson(ops);
  const prefix = textEncoder.encode(OPS_DIGEST_PREFIX);
  const payload = textEncoder.encode(json);
  const combined = new Uint8Array(prefix.length + payload.length);
  combined.set(prefix);
  combined.set(payload, prefix.length);
  return await crypto.hash('sha256', combined);
}

// ============================================================================
// Receipt Construction
// ============================================================================

/** @type {RegExp} */
const OID_HEX_PATTERN = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

/**
 * Validates and builds a frozen receipt record with keys in sorted order.
 *
 * @param {Object} fields
 * @param {number} fields.version
 * @param {string} fields.graphName
 * @param {string} fields.writerId
 * @param {string} fields.dataCommit
 * @param {number} fields.tickStart
 * @param {number} fields.tickEnd
 * @param {string} fields.opsDigest
 * @param {string} fields.prevAuditCommit
 * @param {number} fields.timestamp
 * @returns {Readonly<Record<string, unknown>>}
 * @throws {Error} If any field is invalid
 */
export function buildReceiptRecord(fields) {
  const {
    version, graphName, writerId, dataCommit,
    tickStart, tickEnd, opsDigest, prevAuditCommit, timestamp,
  } = fields;

  // version
  if (version !== 1) {
    throw new Error(`Invalid version: must be 1, got ${version}`);
  }

  // graphName — validated by RefLayout
  if (typeof graphName !== 'string' || graphName.length === 0) {
    throw new Error('Invalid graphName: must be a non-empty string');
  }

  // writerId — validated by RefLayout
  if (typeof writerId !== 'string' || writerId.length === 0) {
    throw new Error('Invalid writerId: must be a non-empty string');
  }

  // dataCommit
  const dc = dataCommit.toLowerCase();
  if (!OID_HEX_PATTERN.test(dc)) {
    throw new Error(`Invalid dataCommit OID: ${dataCommit}`);
  }

  // opsDigest
  const od = opsDigest.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(od)) {
    throw new Error(`Invalid opsDigest: must be 64-char lowercase hex, got ${opsDigest}`);
  }

  // prevAuditCommit
  const pac = prevAuditCommit.toLowerCase();
  if (!OID_HEX_PATTERN.test(pac)) {
    throw new Error(`Invalid prevAuditCommit OID: ${prevAuditCommit}`);
  }

  // OID length consistency
  const oidLen = dc.length;
  if (pac.length !== oidLen) {
    throw new Error(`OID length mismatch: dataCommit=${dc.length}, prevAuditCommit=${pac.length}`);
  }

  // tick constraints
  if (!Number.isInteger(tickStart) || tickStart < 1) {
    throw new Error(`Invalid tickStart: must be integer >= 1, got ${tickStart}`);
  }
  if (!Number.isInteger(tickEnd) || tickEnd < tickStart) {
    throw new Error(`Invalid tickEnd: must be integer >= tickStart, got ${tickEnd}`);
  }
  if (version === 1 && tickStart !== tickEnd) {
    throw new Error(`v1 requires tickStart === tickEnd, got ${tickStart} !== ${tickEnd}`);
  }

  // Zero-hash sentinel only for genesis (tickStart === 1)
  const zeroHash = '0'.repeat(oidLen);
  if (pac === zeroHash && tickStart > 1) {
    throw new Error('Non-genesis receipt cannot use zero-hash sentinel');
  }

  // timestamp
  if (!Number.isInteger(timestamp) || timestamp < 0) {
    throw new Error(`Invalid timestamp: must be non-negative safe integer, got ${timestamp}`);
  }
  if (!Number.isSafeInteger(timestamp)) {
    throw new Error(`Invalid timestamp: exceeds Number.MAX_SAFE_INTEGER: ${timestamp}`);
  }

  // Build with keys in sorted order (canonical for CBOR)
  return Object.freeze({
    dataCommit: dc,
    graphName,
    opsDigest: od,
    prevAuditCommit: pac,
    tickEnd,
    tickStart,
    timestamp,
    version,
    writerId,
  });
}

// ============================================================================
// Service
// ============================================================================

/**
 * AuditReceiptService manages the audit receipt chain for a single writer.
 *
 * ## Lifecycle
 * 1. Construct with dependencies
 * 2. Call `init()` to read the current audit ref tip
 * 3. Call `commit(tickReceipt)` after each data commit succeeds
 *
 * ## Error handling
 * All errors are caught, logged with structured codes, and never propagated.
 * The data commit has already succeeded — audit failures create gaps that
 * are detectable by M4 verification.
 */
export class AuditReceiptService {
  /**
   * @param {Object} options
   * @param {import('../../ports/RefPort.js').default & import('../../ports/BlobPort.js').default & import('../../ports/TreePort.js').default & import('../../ports/CommitPort.js').default} options.persistence
   * @param {string} options.graphName
   * @param {string} options.writerId
   * @param {import('../../ports/CodecPort.js').default} options.codec
   * @param {import('../../ports/CryptoPort.js').default} options.crypto
   * @param {import('../../ports/LoggerPort.js').default} [options.logger]
   */
  constructor({ persistence, graphName, writerId, codec, crypto, logger }) {
    this._persistence = persistence;
    this._graphName = graphName;
    this._writerId = writerId;
    this._codec = codec;
    this._crypto = crypto;
    this._logger = logger || null;
    this._auditRef = buildAuditRef(graphName, writerId);

    /** @type {string|null} Previous audit commit SHA (null = genesis) */
    this._prevAuditCommit = null;

    /** @type {string|null} Expected old ref value for CAS (null = ref doesn't exist) */
    this._expectedOldRef = null;

    /** @type {boolean} If true, service is degraded — skip all commits */
    this._degraded = false;

    /** @type {boolean} If true, currently retrying — prevents recursive retry */
    this._retrying = false;

    // Stats
    this._committed = 0;
    this._skipped = 0;
    this._failed = 0;
  }

  /**
   * Initializes the service by reading the current audit ref tip.
   * Must be called before `commit()`.
   * @returns {Promise<void>}
   */
  async init() {
    try {
      const tip = await this._persistence.readRef(this._auditRef);
      if (tip) {
        this._prevAuditCommit = tip;
        this._expectedOldRef = tip;
        // We don't know the tick counter from a cold start without walking the chain.
        // Use 0 and let the first commit set it from the lamport clock.
      }
    } catch {
      // Log so operators see unexpected cold starts, then start fresh
      this._logger?.warn('[warp:audit]', {
        code: 'AUDIT_INIT_READ_FAILED',
        writerId: this._writerId,
        ref: this._auditRef,
      });
      this._prevAuditCommit = null;
      this._expectedOldRef = null;
    }
  }

  /**
   * Creates an audit commit for the given tick receipt.
   *
   * DESIGN NOTE: Data commit has already succeeded at this point.
   * If audit commit fails, the data is persisted but the audit chain
   * has a gap. This is acceptable by design in M3 — gaps are detected
   * by M4 verification coverage rules (receipt count vs data commit count).
   *
   * @param {import('../types/TickReceipt.js').TickReceipt} tickReceipt
   * @returns {Promise<string|null>} The audit commit SHA, or null on failure
   */
  async commit(tickReceipt) {
    if (this._degraded) {
      this._skipped++;
      this._logger?.warn('[warp:audit]', {
        code: 'AUDIT_DEGRADED_ACTIVE',
        writerId: this._writerId,
      });
      return null;
    }

    try {
      return await this._commitInner(tickReceipt);
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow catch type
      this._failed++;
      this._logger?.warn('[warp:audit]', {
        code: 'AUDIT_COMMIT_FAILED',
        writerId: this._writerId,
        error: err?.message,
      });
      return null;
    }
  }

  /**
   * Returns audit stats for coverage probing.
   * @returns {{ committed: number, skipped: number, failed: number, degraded: boolean }}
   */
  getStats() {
    return {
      committed: this._committed,
      skipped: this._skipped,
      failed: this._failed,
      degraded: this._degraded,
    };
  }

  /**
   * Inner commit logic. Throws on failure (caught by `commit()`).
   * @param {import('../types/TickReceipt.js').TickReceipt} tickReceipt
   * @returns {Promise<string>}
   * @private
   */
  async _commitInner(tickReceipt) {
    const { patchSha, writer, lamport, ops } = tickReceipt;

    // Guard: reject cross-writer attribution
    if (writer !== this._writerId) {
      this._logger?.warn('[warp:audit]', {
        code: 'AUDIT_WRITER_MISMATCH',
        expected: this._writerId,
        actual: writer,
        patchSha,
      });
      throw new Error(
        `Audit writer mismatch: expected '${this._writerId}', got '${writer}'`,
      );
    }

    // Compute opsDigest
    const opsDigest = await computeOpsDigest(ops, this._crypto);

    // Timestamp
    const timestamp = Date.now();

    // Determine prevAuditCommit
    const oidLen = patchSha.length;
    const prevAuditCommit = this._prevAuditCommit || '0'.repeat(oidLen);

    // Build receipt record
    const receipt = buildReceiptRecord({
      version: 1,
      graphName: this._graphName,
      writerId: writer,
      dataCommit: patchSha,
      tickStart: lamport,
      tickEnd: lamport,
      opsDigest,
      prevAuditCommit,
      timestamp,
    });

    // Encode to CBOR
    const cborBytes = this._codec.encode(receipt);

    // Write blob
    let blobOid;
    try {
      blobOid = await this._persistence.writeBlob(Buffer.from(cborBytes));
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow catch type
      this._logger?.warn('[warp:audit]', {
        code: 'AUDIT_WRITE_BLOB_FAILED',
        writerId: this._writerId,
        error: err?.message,
      });
      throw err;
    }

    // Write tree
    let treeOid;
    try {
      treeOid = await this._persistence.writeTree([
        `100644 blob ${blobOid}\treceipt.cbor`,
      ]);
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow catch type
      this._logger?.warn('[warp:audit]', {
        code: 'AUDIT_WRITE_TREE_FAILED',
        writerId: this._writerId,
        error: err?.message,
      });
      throw err;
    }

    // Encode commit message with trailers
    const message = encodeAuditMessage({
      graph: this._graphName,
      writer,
      dataCommit: patchSha.toLowerCase(),
      opsDigest,
    });

    // Determine parents
    const parents = this._prevAuditCommit ? [this._prevAuditCommit] : [];

    // Create commit
    const commitSha = await this._persistence.commitNodeWithTree({
      treeOid,
      parents,
      message,
    });

    // CAS ref update
    try {
      await this._persistence.compareAndSwapRef(
        this._auditRef,
        commitSha,
        this._expectedOldRef,
      );
    } catch {
      if (this._retrying) {
        // Second CAS failure during retry → degrade
        throw new Error('CAS failed during retry');
      }
      // CAS mismatch — retry once with refreshed tip
      return await this._retryAfterCasConflict(commitSha, tickReceipt);
    }

    // Success — update cached state
    this._prevAuditCommit = commitSha;
    this._expectedOldRef = commitSha;
    this._committed++;
    return commitSha;
  }

  /**
   * Retry-once after CAS conflict. Reads fresh tip, rebuilds receipt, retries.
   * @param {string} _failedCommitSha - The commit that failed CAS (unused, for logging)
   * @param {import('../types/TickReceipt.js').TickReceipt} tickReceipt
   * @returns {Promise<string>}
   * @private
   */
  async _retryAfterCasConflict(_failedCommitSha, tickReceipt) {
    this._logger?.warn('[warp:audit]', {
      code: 'AUDIT_REF_CAS_CONFLICT',
      writerId: this._writerId,
      ref: this._auditRef,
    });

    // Read fresh tip
    const freshTip = await this._persistence.readRef(this._auditRef);
    this._prevAuditCommit = freshTip;
    this._expectedOldRef = freshTip;

    // Rebuild and retry (with guard against recursive retry)
    this._retrying = true;
    try {
      const result = await this._commitInner(tickReceipt);
      return result;
    } catch {
      // Second failure → degraded mode
      this._degraded = true;
      this._logger?.warn('[warp:audit]', {
        code: 'AUDIT_DEGRADED_ACTIVE',
        writerId: this._writerId,
        reason: 'second CAS failure',
      });
      throw new Error('Audit service degraded after second CAS failure');
    } finally {
      this._retrying = false;
    }
  }
}
