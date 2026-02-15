/**
 * AuditVerifierService — verifies tamper-evident audit receipt chains.
 *
 * Walks audit chains backward from tip to genesis, validating:
 * - Receipt schema (9 fields, correct types, version=1)
 * - Chain linking (prevAuditCommit matches previous commit SHA)
 * - Git parent consistency
 * - Tick monotonicity (strictly decreasing backward)
 * - Writer/graph consistency across the chain
 * - OID format and length consistency
 * - Trailer consistency (commit message trailers match CBOR receipt)
 * - Tree structure (exactly one entry: receipt.cbor)
 * - Genesis/continuation invariants
 *
 * @module domain/services/AuditVerifierService
 * @see docs/specs/AUDIT_RECEIPT.md Section 8
 */

import { buildAuditPrefix, buildAuditRef } from '../utils/RefLayout.js';
import { decodeAuditMessage } from './AuditMessageCodec.js';

// ============================================================================
// Constants
// ============================================================================

/** @type {RegExp} */
const OID_HEX_RE = /^[0-9a-f]+$/;

// ── Status codes ──────────────────────────────────────────────────────────────

/** Full chain verified from tip to genesis, no errors. */
const STATUS_VALID = 'VALID';
/** Chain verified from tip to --since boundary, no errors. */
const STATUS_PARTIAL = 'PARTIAL';
/** Structural integrity failure. */
const STATUS_BROKEN_CHAIN = 'BROKEN_CHAIN';
/** Content integrity failure (trailer vs CBOR). */
const STATUS_DATA_MISMATCH = 'DATA_MISMATCH';
/** Operational failure. */
const STATUS_ERROR = 'ERROR';

/** @type {TrustAssessment} */
const NOT_CONFIGURED_TRUST = Object.freeze({
  status: 'not_configured',
  source: 'none',
  sourceDetail: null,
  ref: null,
  commit: null,
  policy: null,
  evaluatedWriters: Object.freeze([]),
  untrustedWriters: Object.freeze([]),
  explanations: Object.freeze([]),
  snapshotDigest: null,
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Validates that a string is valid lowercase hex of length 40 or 64.
 * @param {string} value
 * @returns {{ valid: boolean, normalized: string, error?: string }}
 */
function validateOidFormat(value) {
  if (typeof value !== 'string') {
    return { valid: false, normalized: '', error: 'not a string' };
  }
  const normalized = value.toLowerCase();
  if (!OID_HEX_RE.test(normalized)) {
    return { valid: false, normalized, error: 'contains non-hex characters' };
  }
  if (normalized.length !== 40 && normalized.length !== 64) {
    return { valid: false, normalized, error: `invalid length ${normalized.length}` };
  }
  return { valid: true, normalized };
}

/**
 * Checks whether a receipt object has the expected 9 fields with correct types.
 * @param {*} receipt
 * @returns {string|null} Error message or null if valid
 */
function validateReceiptSchema(receipt) {
  if (!receipt || typeof receipt !== 'object') {
    return 'receipt is not an object';
  }
  const keys = Object.keys(receipt);
  if (keys.length !== 9) {
    return `expected 9 fields, got ${keys.length}`;
  }
  const required = [
    'dataCommit', 'graphName', 'opsDigest', 'prevAuditCommit',
    'tickEnd', 'tickStart', 'timestamp', 'version', 'writerId',
  ];
  for (const k of required) {
    if (!(k in receipt)) {
      return `missing field: ${k}`;
    }
  }
  if (receipt.version !== 1) {
    return `unsupported version: ${receipt.version}`;
  }
  if (typeof receipt.graphName !== 'string' || receipt.graphName.length === 0) {
    return 'graphName must be a non-empty string';
  }
  if (typeof receipt.writerId !== 'string' || receipt.writerId.length === 0) {
    return 'writerId must be a non-empty string';
  }
  if (typeof receipt.dataCommit !== 'string') {
    return 'dataCommit must be a string';
  }
  if (typeof receipt.opsDigest !== 'string') {
    return 'opsDigest must be a string';
  }
  if (typeof receipt.prevAuditCommit !== 'string') {
    return 'prevAuditCommit must be a string';
  }
  if (!Number.isInteger(receipt.tickStart) || receipt.tickStart < 1) {
    return `tickStart must be integer >= 1, got ${receipt.tickStart}`;
  }
  if (!Number.isInteger(receipt.tickEnd) || receipt.tickEnd < receipt.tickStart) {
    return `tickEnd must be integer >= tickStart, got ${receipt.tickEnd}`;
  }
  if (receipt.version === 1 && receipt.tickStart !== receipt.tickEnd) {
    return `v1 requires tickStart === tickEnd, got ${receipt.tickStart} !== ${receipt.tickEnd}`;
  }
  if (!Number.isInteger(receipt.timestamp) || receipt.timestamp < 0) {
    return `timestamp must be non-negative integer, got ${receipt.timestamp}`;
  }
  return null;
}

/**
 * Validates trailers against the CBOR receipt fields.
 * @param {*} receipt
 * @param {{ graph: string, writer: string, dataCommit: string, opsDigest: string, schema: number }} decoded
 * @returns {string|null} Error message or null if consistent
 */
function validateTrailerConsistency(receipt, decoded) {
  if (decoded.schema !== 1) {
    return `trailer eg-schema must be 1, got ${decoded.schema}`;
  }
  if (decoded.graph !== receipt.graphName) {
    return `trailer eg-graph '${decoded.graph}' !== receipt graphName '${receipt.graphName}'`;
  }
  if (decoded.writer !== receipt.writerId) {
    return `trailer eg-writer '${decoded.writer}' !== receipt writerId '${receipt.writerId}'`;
  }
  if (decoded.dataCommit.toLowerCase() !== receipt.dataCommit.toLowerCase()) {
    return `trailer eg-data-commit '${decoded.dataCommit}' !== receipt dataCommit '${receipt.dataCommit}'`;
  }
  if (decoded.opsDigest.toLowerCase() !== receipt.opsDigest.toLowerCase()) {
    return `trailer eg-ops-digest '${decoded.opsDigest}' !== receipt opsDigest '${receipt.opsDigest}'`;
  }
  return null;
}

// ============================================================================
// Service
// ============================================================================

/**
 * @typedef {Object} ChainError
 * @property {string} code - Machine-readable error code
 * @property {string} message - Human-readable description
 * @property {string} [commit] - The commit SHA where the error was found
 */

/**
 * @typedef {Object} ChainWarning
 * @property {string} code - Machine-readable warning code
 * @property {string} message - Human-readable description
 */

/**
 * @typedef {Object} ChainResult
 * @property {string} writerId
 * @property {string} ref
 * @property {string} status - VALID | PARTIAL | BROKEN_CHAIN | DATA_MISMATCH | ERROR
 * @property {number} receiptsVerified
 * @property {number} receiptsScanned
 * @property {string|null} tipCommit
 * @property {string|null} tipAtStart
 * @property {string|null} genesisCommit
 * @property {string|null} stoppedAt
 * @property {string|null} since
 * @property {ChainError[]} errors
 * @property {ChainWarning[]} warnings
 */

/**
 * @typedef {Object} TrustAssessment
 * @property {'not_configured'|'configured'|'pinned'|'error'} status
 * @property {'ref'|'env_pin'|'cli_pin'|'none'} source
 * @property {string|null} sourceDetail
 * @property {string|null} ref
 * @property {string|null} commit
 * @property {string|null} policy
 * @property {string[]} evaluatedWriters
 * @property {string[]} untrustedWriters
 * @property {Array<{ writerId: string, trusted: boolean, reason: string }>} explanations
 * @property {string|null} snapshotDigest
 */

/**
 * @typedef {Object} VerifyResult
 * @property {string} graph
 * @property {string} verifiedAt
 * @property {{ total: number, valid: number, partial: number, invalid: number }} summary
 * @property {ChainResult[]} chains
 * @property {TrustAssessment} trust
 * @property {'pass'|'fail'} integrityVerdict
 * @property {'pass'|'degraded'|'fail'|'not_configured'} trustVerdict
 * @property {null} trustWarning - deprecated v2.x legacy field
 */

export class AuditVerifierService {
  /**
   * @param {Object} options
   * @param {import('../../ports/CommitPort.js').default & import('../../ports/RefPort.js').default & import('../../ports/BlobPort.js').default & import('../../ports/TreePort.js').default} options.persistence
   * @param {import('../../ports/CodecPort.js').default} options.codec
   * @param {import('../../ports/LoggerPort.js').default} [options.logger]
   * @param {import('./TrustService.js').default} [options.trustService]
   */
  constructor({ persistence, codec, logger, trustService }) {
    this._persistence = persistence;
    this._codec = codec;
    this._logger = logger || null;
    this._trustService = trustService || null;
  }

  /**
   * Verifies all audit chains for a graph.
   * @param {string} graphName
   * @param {{ since?: string, trustRefTip?: string, trustRequired?: boolean }} [options]
   * @returns {Promise<VerifyResult>}
   */
  async verifyAll(graphName, options = {}) {
    const prefix = buildAuditPrefix(graphName);
    const refs = await this._persistence.listRefs(prefix);
    const writerIds = refs
      .map((/** @type {string} */ ref) => ref.slice(prefix.length))
      .filter((/** @type {string} */ id) => id.length > 0);

    const chains = [];
    for (const writerId of writerIds.sort()) {
      const result = await this.verifyChain(graphName, writerId, options);
      chains.push(result);
    }

    const valid = chains.filter((c) => c.status === STATUS_VALID).length;
    const partial = chains.filter((c) => c.status === STATUS_PARTIAL).length;
    const invalid = chains.length - valid - partial;

    const integrityVerdict = invalid > 0 ? 'fail' : 'pass';
    const trust = await this._evaluateTrust(graphName, writerIds, options);
    const trustVerdict = deriveTrustVerdict(trust);

    return {
      graph: graphName,
      verifiedAt: new Date().toISOString(),
      summary: { total: chains.length, valid, partial, invalid },
      chains,
      trust,
      integrityVerdict,
      trustVerdict,
      trustWarning: null, // deprecated v2.x legacy field
    };
  }

  /**
   * Verifies a single audit chain for a writer.
   * @param {string} graphName
   * @param {string} writerId
   * @param {{ since?: string }} [options]
   * @returns {Promise<ChainResult>}
   */
  async verifyChain(graphName, writerId, options = {}) {
    const ref = buildAuditRef(graphName, writerId);
    const since = options.since || null;

    /** @type {ChainResult} */
    const result = {
      writerId,
      ref,
      status: STATUS_VALID,
      receiptsVerified: 0,
      receiptsScanned: 0,
      tipCommit: null,
      tipAtStart: null,
      genesisCommit: null,
      stoppedAt: null,
      since,
      errors: [],
      warnings: [],
    };

    // Read tip
    let tip;
    try {
      tip = await this._persistence.readRef(ref);
    } catch {
      // ref doesn't exist — no chain to verify
      return result;
    }
    if (!tip) {
      return result;
    }

    result.tipCommit = tip;
    result.tipAtStart = tip;

    // Walk the chain
    await this._walkChain(graphName, writerId, tip, since, result);

    // Ref-race detection: re-read tip after walk
    await this._checkTipMoved(ref, result);

    return result;
  }

  /**
   * Walks the chain backward from tip, populating result.
   * @param {string} graphName
   * @param {string} writerId
   * @param {string} tip
   * @param {string|null} since
   * @param {ChainResult} result
   * @returns {Promise<void>}
   * @private
   */
  async _walkChain(graphName, writerId, tip, since, result) {
    let current = tip;
    /** @type {Record<string, *>|null} */ let prevReceipt = null;
    /** @type {number|null} */ let chainOidLen = null;

    while (current) {
      result.receiptsScanned++;

      // Read commit info
      let commitInfo;
      try {
        commitInfo = await this._persistence.getNodeInfo(current);
      } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow catch type
        this._addError(result, 'MISSING_RECEIPT_BLOB', `Cannot read commit ${current}: ${err?.message}`, current);
        return;
      }

      // Read and validate receipt
      const receiptResult = await this._readReceipt(current, commitInfo, result);
      if (!receiptResult) {
        return; // error already added
      }

      const { receipt, decodedTrailers } = receiptResult;

      // Schema validation (before OID checks — catches missing fields early)
      const schemaErr = validateReceiptSchema(receipt);
      if (schemaErr) {
        this._addError(result, 'RECEIPT_SCHEMA_INVALID', schemaErr, current);
        return;
      }

      // OID format validation
      if (!this._validateOids(receipt, result, current)) {
        return;
      }

      // OID length consistency
      const oidLen = receipt.dataCommit.length;
      if (chainOidLen === null) {
        chainOidLen = oidLen;
      } else if (oidLen !== chainOidLen) {
        this._addError(result, 'OID_LENGTH_MISMATCH',
          `OID length changed from ${chainOidLen} to ${oidLen}`, current);
        return;
      }
      if (receipt.prevAuditCommit.length !== oidLen) {
        this._addError(result, 'OID_LENGTH_MISMATCH',
          `prevAuditCommit length ${receipt.prevAuditCommit.length} !== dataCommit length ${oidLen}`, current);
        return;
      }

      // Trailer consistency
      const trailerErr = validateTrailerConsistency(receipt, decodedTrailers);
      if (trailerErr) {
        this._addError(result, 'TRAILER_MISMATCH', trailerErr, current);
        result.status = STATUS_DATA_MISMATCH;
        return;
      }

      // Chain linking (against previous receipt, which is the NEXT commit in forward time)
      if (prevReceipt) {
        if (!this._validateChainLink(receipt, prevReceipt, current, result)) {
          return;
        }
      }

      // Writer/graph consistency
      if (receipt.writerId !== writerId) {
        this._addError(result, 'WRITER_CONSISTENCY',
          `receipt writerId '${receipt.writerId}' !== expected '${writerId}'`, current);
        result.status = STATUS_BROKEN_CHAIN;
        return;
      }
      if (receipt.graphName !== graphName) {
        this._addError(result, 'WRITER_CONSISTENCY',
          `receipt graphName '${receipt.graphName}' !== expected '${graphName}'`, current);
        result.status = STATUS_BROKEN_CHAIN;
        return;
      }

      result.receiptsVerified++;

      // --since boundary: stop AFTER verifying this commit
      if (since && current === since) {
        result.stoppedAt = current;
        if (result.errors.length === 0) {
          result.status = STATUS_PARTIAL;
        }
        return;
      }

      // Genesis check
      const zeroHash = '0'.repeat(oidLen);
      if (receipt.prevAuditCommit === zeroHash) {
        result.genesisCommit = current;
        if (commitInfo.parents.length !== 0) {
          this._addError(result, 'GENESIS_HAS_PARENTS',
            `Genesis commit has ${commitInfo.parents.length} parent(s)`, current);
          result.status = STATUS_BROKEN_CHAIN;
          return;
        }
        // Reached genesis — if --since was specified but not found, error
        if (since) {
          this._addError(result, 'SINCE_NOT_FOUND',
            `Commit ${since} not found in chain`, null);
          result.status = STATUS_ERROR;
          return;
        }
        if (result.errors.length === 0) {
          result.status = STATUS_VALID;
        }
        return;
      }

      // Continuation check
      if (commitInfo.parents.length !== 1) {
        this._addError(result, 'CONTINUATION_NO_PARENT',
          `Continuation commit has ${commitInfo.parents.length} parent(s), expected 1`, current);
        result.status = STATUS_BROKEN_CHAIN;
        return;
      }
      if (commitInfo.parents[0] !== receipt.prevAuditCommit) {
        this._addError(result, 'GIT_PARENT_MISMATCH',
          `Git parent '${commitInfo.parents[0]}' !== prevAuditCommit '${receipt.prevAuditCommit}'`, current);
        result.status = STATUS_BROKEN_CHAIN;
        return;
      }

      prevReceipt = receipt;
      current = receipt.prevAuditCommit;
    }

    // If --since was specified but we reached the end without finding it
    if (since) {
      this._addError(result, 'SINCE_NOT_FOUND',
        `Commit ${since} not found in chain`, null);
      result.status = STATUS_ERROR;
    }
  }

  /**
   * Reads and decodes the receipt from a commit.
   * @param {string} commitSha
   * @param {{ message: string }} commitInfo
   * @param {ChainResult} result
   * @returns {Promise<{ receipt: *, decodedTrailers: * }|null>}
   * @private
   */
  async _readReceipt(commitSha, commitInfo, result) {
    // Read tree
    let treeOid;
    try {
      treeOid = await this._persistence.getCommitTree(commitSha);
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow catch type
      this._addError(result, 'MISSING_RECEIPT_BLOB',
        `Cannot read tree for ${commitSha}: ${err?.message}`, commitSha);
      return null;
    }

    // Validate tree structure
    let treeEntries;
    try {
      treeEntries = await this._persistence.readTreeOids(treeOid);
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow catch type
      this._addError(result, 'RECEIPT_TREE_INVALID',
        `Cannot read tree ${treeOid}: ${err?.message}`, commitSha);
      return null;
    }

    const entryNames = Object.keys(treeEntries);
    if (entryNames.length !== 1 || entryNames[0] !== 'receipt.cbor') {
      this._addError(result, 'RECEIPT_TREE_INVALID',
        `Expected exactly one entry 'receipt.cbor', got [${entryNames.join(', ')}]`, commitSha);
      result.status = STATUS_BROKEN_CHAIN;
      return null;
    }

    // Read blob
    const blobOid = treeEntries['receipt.cbor'];
    let blobContent;
    try {
      blobContent = await this._persistence.readBlob(blobOid);
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow catch type
      this._addError(result, 'MISSING_RECEIPT_BLOB',
        `Cannot read receipt blob ${blobOid}: ${err?.message}`, commitSha);
      return null;
    }

    // Decode CBOR
    let receipt;
    try {
      receipt = this._codec.decode(blobContent);
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow catch type
      this._addError(result, 'CBOR_DECODE_FAILED',
        `CBOR decode failed: ${err?.message}`, commitSha);
      result.status = STATUS_ERROR;
      return null;
    }

    // Decode trailers
    let decodedTrailers;
    try {
      decodedTrailers = decodeAuditMessage(commitInfo.message);
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow catch type
      this._addError(result, 'TRAILER_MISMATCH',
        `Trailer decode failed: ${err?.message}`, commitSha);
      result.status = STATUS_DATA_MISMATCH;
      return null;
    }

    return { receipt, decodedTrailers };
  }

  /**
   * Validates OID format for dataCommit, prevAuditCommit, and opsDigest.
   * @param {*} receipt
   * @param {ChainResult} result
   * @param {string} commitSha
   * @returns {boolean} true if valid
   * @private
   */
  _validateOids(receipt, result, commitSha) {
    const dcCheck = validateOidFormat(receipt.dataCommit);
    if (!dcCheck.valid) {
      this._addError(result, 'OID_FORMAT_INVALID',
        `dataCommit OID invalid: ${dcCheck.error}`, commitSha);
      result.status = STATUS_BROKEN_CHAIN;
      return false;
    }

    const pacCheck = validateOidFormat(receipt.prevAuditCommit);
    // prevAuditCommit may be all-zeros (genesis sentinel)
    const isZero = /^0+$/.test(receipt.prevAuditCommit);
    if (!pacCheck.valid && !isZero) {
      this._addError(result, 'OID_FORMAT_INVALID',
        `prevAuditCommit OID invalid: ${pacCheck.error}`, commitSha);
      result.status = STATUS_BROKEN_CHAIN;
      return false;
    }

    return true;
  }

  /**
   * Validates chain linking between current and previous (newer) receipt.
   * @param {*} currentReceipt - The older receipt being validated
   * @param {*} prevReceipt - The newer receipt (closer to tip)
   * @param {string} commitSha
   * @param {ChainResult} result
   * @returns {boolean} true if valid
   * @private
   */
  _validateChainLink(currentReceipt, prevReceipt, commitSha, result) {
    // Tick monotonicity: walking backward, current tick < prev tick
    if (currentReceipt.tickEnd >= prevReceipt.tickStart) {
      this._addError(result, 'TICK_MONOTONICITY',
        `tick ${currentReceipt.tickEnd} >= previous ${prevReceipt.tickStart}`, commitSha);
      result.status = STATUS_BROKEN_CHAIN;
      return false;
    }

    // Tick gap warning
    if (currentReceipt.tickEnd + 1 < prevReceipt.tickStart) {
      result.warnings.push({
        code: 'TICK_GAP',
        message: `Gap between tick ${currentReceipt.tickEnd} and ${prevReceipt.tickStart}`,
      });
    }

    // Writer consistency
    if (currentReceipt.writerId !== prevReceipt.writerId) {
      this._addError(result, 'WRITER_CONSISTENCY',
        `writerId changed from '${currentReceipt.writerId}' to '${prevReceipt.writerId}'`, commitSha);
      result.status = STATUS_BROKEN_CHAIN;
      return false;
    }

    // Graph consistency
    if (currentReceipt.graphName !== prevReceipt.graphName) {
      this._addError(result, 'WRITER_CONSISTENCY',
        `graphName changed from '${currentReceipt.graphName}' to '${prevReceipt.graphName}'`, commitSha);
      result.status = STATUS_BROKEN_CHAIN;
      return false;
    }

    return true;
  }

  /**
   * Checks if the ref tip moved during verification (ref-race detection).
   * @param {string} ref
   * @param {ChainResult} result
   * @returns {Promise<void>}
   * @private
   */
  async _checkTipMoved(ref, result) {
    try {
      const currentTip = await this._persistence.readRef(ref);
      if (currentTip && currentTip !== result.tipAtStart) {
        result.warnings.push({
          code: 'TIP_MOVED_DURING_VERIFY',
          message: `Ref tip moved from ${result.tipAtStart} to ${currentTip} during verification`,
        });
      }
    } catch {
      // If we can't re-read, don't add a warning — it's best-effort
    }
  }

  /**
   * Adds an error to the result and sets status if not already set.
   * @param {ChainResult} result
   * @param {string} code
   * @param {string} message
   * @param {string|null} commit
   * @private
   */
  _addError(result, code, message, commit) {
    result.errors.push({ code, message, ...(commit ? { commit } : {}) });
    if (result.status === STATUS_VALID || result.status === STATUS_PARTIAL) {
      result.status = STATUS_ERROR;
    }
  }

  /**
   * Orchestration layer for trust evaluation.
   * Handles pin resolution: CLI pin > env pin > live ref.
   * Invalid pin fails closed (no fallback to live ref).
   *
   * @param {string} graphName
   * @param {string[]} writerIds
   * @param {{ trustRefTip?: string }} options
   * @returns {Promise<TrustAssessment>}
   * @private
   */
  async _evaluateTrust(graphName, writerIds, options) {
    if (!this._trustService) {
      return NOT_CONFIGURED_TRUST;
    }

    // Pin resolution priority: CLI > env > live ref
    const cliPin = options.trustRefTip || null;
    const envPin = (typeof process !== 'undefined' && process.env?.WARP_TRUSTED_ROOT) || null;
    const pin = cliPin || envPin;
    const source = cliPin ? 'cli_pin' : envPin ? 'env_pin' : 'ref';

    let configResult;
    try {
      if (pin) {
        configResult = await this._trustService.readTrustConfigAtCommit(pin);
      } else {
        configResult = await this._trustService.readTrustConfig();
      }
    } catch {
      // Invalid pin: fail closed, no fallback
      if (pin) {
        return {
          status: 'error',
          source,
          sourceDetail: pin,
          ref: null,
          commit: null,
          policy: null,
          evaluatedWriters: [],
          untrustedWriters: [],
          explanations: [],
          snapshotDigest: null,
        };
      }
      return NOT_CONFIGURED_TRUST;
    }

    if (!configResult) {
      return NOT_CONFIGURED_TRUST;
    }

    const { config, commitSha, snapshotDigest } = configResult;
    const eval_ = this._trustService.evaluateWriters(writerIds, config);

    return {
      status: pin ? 'pinned' : 'configured',
      source,
      sourceDetail: pin || this._trustService.trustRef,
      ref: this._trustService.trustRef,
      commit: commitSha,
      policy: config.policy,
      evaluatedWriters: eval_.evaluatedWriters,
      untrustedWriters: eval_.untrustedWriters,
      explanations: eval_.explanations,
      snapshotDigest,
    };
  }
}

// ============================================================================
// Trust helpers
// ============================================================================

/**
 * Derives trust verdict from trust assessment.
 * @param {TrustAssessment} trust
 * @returns {'pass'|'degraded'|'fail'|'not_configured'}
 */
function deriveTrustVerdict(trust) {
  if (trust.status === 'not_configured') {
    return 'not_configured';
  }
  if (trust.status === 'error') {
    return 'fail';
  }
  if (trust.untrustedWriters.length > 0) {
    return 'degraded';
  }
  return 'pass';
}
