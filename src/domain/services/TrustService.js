/**
 * TrustService — manages trust configuration stored as a Git ref.
 *
 * Trust config lives at `refs/warp/<graph>/trust/root` as a
 * content-addressed, CAS-protected, ff-only Git commit tree
 * containing a schema-versioned `trust.json`.
 *
 * @module domain/services/TrustService
 */

import { buildTrustRef } from '../utils/RefLayout.js';
import TrustError from '../errors/TrustError.js';
import {
  parseTrustConfig,
  canonicalizeTrustConfig,
  computeTrustDigest,
} from './TrustSchema.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_HISTORY_WALK = 1000;
const TRUST_BLOB_NAME = 'trust.json';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Computes the set-difference change summary between two configs.
 * @param {import('./TrustSchema.js').TrustConfig} oldConfig
 * @param {import('./TrustSchema.js').TrustConfig} newConfig
 * @returns {{ added: string[], removed: string[] }}
 */
function computeChangeSummary(oldConfig, newConfig) {
  const oldSet = new Set(oldConfig.trustedWriters);
  const newSet = new Set(newConfig.trustedWriters);
  const added = newConfig.trustedWriters.filter((w) => !oldSet.has(w)).sort();
  const removed = oldConfig.trustedWriters.filter((w) => !newSet.has(w)).sort();
  return { added, removed };
}

// ============================================================================
// Service
// ============================================================================

export default class TrustService {
  /**
   * @param {Object} options
   * @param {*} options.persistence - GraphPersistencePort adapter
   * @param {string} options.graphName
   * @param {import('../../ports/CryptoPort.js').default} [options.crypto]
   * @param {import('../../ports/LoggerPort.js').default} [options.logger]
   */
  constructor({ persistence, graphName, crypto, logger }) {
    this._persistence = persistence;
    this._graphName = graphName;
    this._crypto = crypto || null;
    this._logger = logger || null;
    this._trustRef = buildTrustRef(graphName);
  }

  // --------------------------------------------------------------------------
  // Read
  // --------------------------------------------------------------------------

  /**
   * Reads the current trust config from the live ref.
   *
   * @returns {Promise<{ config: import('./TrustSchema.js').TrustConfig, commitSha: string, snapshotDigest: string|null } | null>}
   *   null if trust ref does not exist.
   */
  async readTrustConfig() {
    const tipSha = await this._persistence.readRef(this._trustRef);
    if (!tipSha) {
      return null;
    }
    return await this._readConfigFromCommit(tipSha);
  }

  /**
   * Reads trust config pinned to a specific commit SHA.
   *
   * @param {string} sha - Commit SHA to read from
   * @returns {Promise<{ config: import('./TrustSchema.js').TrustConfig, commitSha: string, snapshotDigest: string|null }>}
   * @throws {TrustError} E_TRUST_PIN_INVALID on any failure
   */
  async readTrustConfigAtCommit(sha) {
    try {
      return await this._readConfigFromCommit(sha);
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow catch type
      if (err instanceof TrustError && err.code === 'E_TRUST_PIN_INVALID') {
        throw err;
      }
      throw new TrustError(
        `Pin to commit ${sha} failed: ${err?.message}. Check that the SHA exists and contains a valid trust.json blob.`,
        { code: 'E_TRUST_PIN_INVALID', context: { sha, cause: err?.message } },
      );
    }
  }

  // --------------------------------------------------------------------------
  // Write
  // --------------------------------------------------------------------------

  /**
   * Creates the genesis trust commit. Ref must not already exist.
   *
   * @param {import('./TrustSchema.js').TrustConfig} config
   * @returns {Promise<{ commitSha: string, snapshotDigest: string|null }>}
   * @throws {TrustError} E_TRUST_REF_CONFLICT if ref already exists
   */
  async initTrust(config) {
    const validated = parseTrustConfig(config);
    const canonical = canonicalizeTrustConfig(validated);
    const digest = this._crypto
      ? await computeTrustDigest(canonical, this._crypto)
      : null;

    const blobOid = await this._persistence.writeBlob(
      Buffer.from(canonical, 'utf8'),
    );
    const treeOid = await this._persistence.writeTree([
      `100644 blob ${blobOid}\t${TRUST_BLOB_NAME}`,
    ]);
    const commitSha = await this._persistence.commitNodeWithTree({
      treeOid,
      parents: [],
      message: `trust: init (policy=${validated.policy}, writers=${validated.trustedWriters.length})`,
    });

    try {
      await this._persistence.compareAndSwapRef(
        this._trustRef,
        commitSha,
        null, // ref must not exist
      );
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow catch type
      throw new TrustError(
        'Trust ref already exists. Use updateTrust() to modify an existing config. Current tip: fetch with readTrustConfig().',
        { code: 'E_TRUST_REF_CONFLICT', context: { ref: this._trustRef, cause: err?.message } },
      );
    }

    this._logger?.info('[warp:trust]', { code: 'TRUST_INIT', commit: commitSha });
    return { commitSha, snapshotDigest: digest };
  }

  /**
   * Convenience: creates genesis trust from a list of writer IDs.
   * Sorts, dedupes, and seeds with policy="any".
   *
   * @param {string[]} writerIds
   * @returns {Promise<{ commitSha: string, snapshotDigest: string|null }>}
   */
  async initFromWriters(writerIds) {
    const trustedWriters = [...new Set(
      writerIds.map((id) => id.trim()).filter((id) => id.length > 0),
    )].sort();
    return await this.initTrust({
      version: 1,
      trustedWriters,
      policy: 'any',
      epoch: new Date().toISOString(),
      requiredSignatures: null,
      allowedSignersPath: null,
    });
  }

  /**
   * Updates trust config. CAS-protected against the current tip.
   *
   * @param {import('./TrustSchema.js').TrustConfig} newConfig
   * @param {string} actor - Writer ID performing the update
   * @returns {Promise<Object>} Attestation receipt
   * @throws {TrustError} E_TRUST_NOT_CONFIGURED if ref does not exist
   * @throws {TrustError} E_TRUST_REF_CONFLICT on CAS mismatch
   * @throws {TrustError} E_TRUST_EPOCH_REGRESSION if epoch goes backward
   */
  async updateTrust(newConfig, actor) {
    const current = await this.readTrustConfig();
    if (!current) {
      throw new TrustError(
        'Trust ref not configured. Use initTrust() to create genesis.',
        { code: 'E_TRUST_NOT_CONFIGURED', context: { ref: this._trustRef } },
      );
    }

    const validated = parseTrustConfig(newConfig);

    // Epoch monotonicity check
    if (validated.epoch < current.config.epoch) {
      throw new TrustError(
        `Epoch regression: new epoch ${validated.epoch} predates current ${current.config.epoch}`,
        {
          code: 'E_TRUST_EPOCH_REGRESSION',
          context: { newEpoch: validated.epoch, currentEpoch: current.config.epoch },
        },
      );
    }

    const canonical = canonicalizeTrustConfig(validated);
    const digest = this._crypto
      ? await computeTrustDigest(canonical, this._crypto)
      : null;

    const commitSha = await this._writeConfigCommit(canonical, [current.commitSha],
      `trust: update by ${actor} (policy=${validated.policy}, writers=${validated.trustedWriters.length})`);

    await this._casRefUpdate(commitSha, current.commitSha);

    const changeSummary = computeChangeSummary(current.config, validated);
    this._logger?.info('[warp:trust]', { code: 'TRUST_UPDATE', commit: commitSha, actor });

    return {
      previousCommit: current.commitSha,
      newCommit: commitSha,
      ref: this._trustRef,
      actor,
      changeSummary,
      snapshotDigest: digest,
      configVersion: validated.version,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Writes a canonical trust config blob, tree, and commit.
   * @param {string} canonical - Canonical JSON string
   * @param {string[]} parents - Parent commit SHAs
   * @param {string} message - Commit message
   * @returns {Promise<string>} Commit SHA
   * @private
   */
  async _writeConfigCommit(canonical, parents, message) {
    const blobOid = await this._persistence.writeBlob(
      Buffer.from(canonical, 'utf8'),
    );
    const treeOid = await this._persistence.writeTree([
      `100644 blob ${blobOid}\t${TRUST_BLOB_NAME}`,
    ]);
    return await this._persistence.commitNodeWithTree({
      treeOid,
      parents,
      message,
    });
  }

  /**
   * CAS-updates the trust ref. Throws on conflict.
   * @param {string} newSha
   * @param {string} expectedTip
   * @returns {Promise<void>}
   * @private
   */
  async _casRefUpdate(newSha, expectedTip) {
    try {
      await this._persistence.compareAndSwapRef(
        this._trustRef,
        newSha,
        expectedTip,
      );
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow catch type
      throw new TrustError(
        `Trust ref moved since read. Fetch latest tip with readTrustConfig() and retry. Current tip was: ${expectedTip}`,
        {
          code: 'E_TRUST_REF_CONFLICT',
          context: { ref: this._trustRef, expectedTip, cause: err?.message },
        },
      );
    }
  }

  // --------------------------------------------------------------------------
  // Evaluate (pure function)
  // --------------------------------------------------------------------------

  /**
   * Evaluates writers against a trust config. Pure function — no env reads.
   *
   * @param {string[]} writerIds - Writer IDs to evaluate
   * @param {import('./TrustSchema.js').TrustConfig} config - Trust config
   * @returns {{ evaluatedWriters: string[], untrustedWriters: string[], explanations: Array<{ writerId: string, trusted: boolean, reason: string }> }}
   */
  evaluateWriters(writerIds, config) {
    const trustedSet = new Set(config.trustedWriters);
    const evaluatedWriters = [];
    const untrustedWriters = [];
    const explanations = [];

    const sorted = [...writerIds].sort();
    for (const writerId of sorted) {
      const trusted = trustedSet.has(writerId);
      if (trusted) {
        evaluatedWriters.push(writerId);
        explanations.push({
          writerId, trusted: true, reason: 'listed in trustedWriters',
        });
      } else if (config.policy === 'any') {
        evaluatedWriters.push(writerId);
        explanations.push({
          writerId, trusted: false, reason: 'not in trustedWriters, but policy=any allows all',
        });
      } else {
        untrustedWriters.push(writerId);
        explanations.push({
          writerId, trusted: false, reason: 'not in trustedWriters, policy requires trust',
        });
      }
    }

    return {
      evaluatedWriters: evaluatedWriters.sort(),
      untrustedWriters: untrustedWriters.sort(),
      explanations,
    };
  }

  // --------------------------------------------------------------------------
  // History
  // --------------------------------------------------------------------------

  /**
   * Walks trust ref history from tip to genesis.
   *
   * @param {{ maxWalk?: number }} [options]
   * @returns {Promise<Array<{ commitSha: string, config: import('./TrustSchema.js').TrustConfig, timestamp: string }>>}
   */
  async getTrustHistory(options = {}) {
    const maxWalk = options.maxWalk ?? DEFAULT_MAX_HISTORY_WALK;
    const tipSha = await this._persistence.readRef(this._trustRef);
    if (!tipSha) {
      return [];
    }

    const history = [];
    let currentSha = tipSha;
    let walked = 0;

    while (currentSha && walked < maxWalk) {
      walked++;
      const info = await this._persistence.getNodeInfo(currentSha);
      const config = await this._readBlobFromCommit(currentSha);

      history.push({
        commitSha: currentSha,
        config,
        timestamp: info.date,
      });

      currentSha = info.parents?.length > 0 ? info.parents[0] : null;
    }

    return history;
  }

  // --------------------------------------------------------------------------
  // Diagnose
  // --------------------------------------------------------------------------

  /**
   * Trust doctor — checks trust ref health.
   *
   * @param {{ pinSha?: string }} [options]
   * @returns {Promise<Array<{ id: string, status: 'ok'|'warn'|'fail', message: string }>>}
   */
  async diagnose(options = {}) {
    const findings = [];

    // Check: ref exists
    const tipSha = await this._persistence.readRef(this._trustRef);
    if (!tipSha) {
      findings.push({
        id: 'TRUST_REF_MISSING',
        status: /** @type {const} */ ('fail'),
        message: `Trust ref ${this._trustRef} does not exist. Run "git warp trust init" to configure.`,
      });
      return findings;
    }

    findings.push({
      id: 'TRUST_REF_EXISTS',
      status: /** @type {const} */ ('ok'),
      message: `Trust ref exists: ${tipSha.slice(0, 12)}`,
    });

    const config = await this._checkSchema(tipSha, findings);
    if (!config) {
      return findings;
    }

    this._checkWriterList(config, findings);
    this._checkPolicy(config, findings);
    await this._checkPin(options.pinSha, findings);

    return findings;
  }

  /**
   * Checks schema validity; returns config on success, null on failure.
   * @param {string} tipSha
   * @param {Array<{ id: string, status: 'ok'|'warn'|'fail', message: string }>} findings
   * @returns {Promise<import('./TrustSchema.js').TrustConfig|null>}
   * @private
   */
  async _checkSchema(tipSha, findings) {
    try {
      const result = await this._readConfigFromCommit(tipSha);
      findings.push({
        id: 'TRUST_SCHEMA_VALID',
        status: /** @type {const} */ ('ok'),
        message: `Schema valid (version=${result.config.version}, policy=${result.config.policy})`,
      });
      return result.config;
    } catch {
      findings.push({
        id: 'TRUST_SCHEMA_INVALID',
        status: /** @type {const} */ ('fail'),
        message: 'Trust blob has invalid schema. Re-init trust config.',
      });
      return null;
    }
  }

  /**
   * Checks whether the writer list is non-empty.
   * @param {import('./TrustSchema.js').TrustConfig} config
   * @param {Array<{ id: string, status: 'ok'|'warn'|'fail', message: string }>} findings
   * @private
   */
  _checkWriterList(config, findings) {
    if (config.trustedWriters.length === 0) {
      findings.push({
        id: 'TRUST_WRITERS_EMPTY',
        status: /** @type {const} */ ('warn'),
        message: 'Trusted writers list is empty. No writers will be trusted under strict policy.',
      });
    } else {
      findings.push({
        id: 'TRUST_WRITERS_PRESENT',
        status: /** @type {const} */ ('ok'),
        message: `${config.trustedWriters.length} trusted writer(s)`,
      });
    }
  }

  /**
   * Checks whether the policy is a supported value.
   * @param {import('./TrustSchema.js').TrustConfig} config
   * @param {Array<{ id: string, status: 'ok'|'warn'|'fail', message: string }>} findings
   * @private
   */
  _checkPolicy(config, findings) {
    if (config.policy === 'any' || config.policy === 'all_writers_must_be_trusted') {
      findings.push({
        id: 'TRUST_POLICY_SUPPORTED',
        status: /** @type {const} */ ('ok'),
        message: `Policy "${config.policy}" is supported`,
      });
    }
  }

  /**
   * Checks pin validity if a pin SHA was provided.
   * @param {string|undefined} pinSha
   * @param {Array<{ id: string, status: 'ok'|'warn'|'fail', message: string }>} findings
   * @returns {Promise<void>}
   * @private
   */
  async _checkPin(pinSha, findings) {
    if (!pinSha) {
      return;
    }
    try {
      await this._readConfigFromCommit(pinSha);
      findings.push({
        id: 'TRUST_PIN_VALID',
        status: /** @type {const} */ ('ok'),
        message: `Pin ${pinSha.slice(0, 12)} is valid and contains parseable trust.json`,
      });
    } catch {
      findings.push({
        id: 'TRUST_PIN_INVALID',
        status: /** @type {const} */ ('fail'),
        message: `Pin ${pinSha.slice(0, 12)} is invalid or does not contain trust.json`,
      });
    }
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  /**
   * Reads and parses trust config from a specific commit SHA.
   * @param {string} sha
   * @returns {Promise<{ config: import('./TrustSchema.js').TrustConfig, commitSha: string, snapshotDigest: string|null }>}
   * @private
   */
  async _readConfigFromCommit(sha) {
    const config = await this._readBlobFromCommit(sha);
    const canonical = canonicalizeTrustConfig(config);
    const digest = this._crypto
      ? await computeTrustDigest(canonical, this._crypto)
      : null;
    return { config, commitSha: sha, snapshotDigest: digest };
  }

  /**
   * Reads the trust.json blob from a commit's tree.
   * Uses getCommitTree -> readTreeOids -> readBlob pipeline
   * (same pattern as AuditVerifierService._readReceipt).
   *
   * @param {string} sha
   * @returns {Promise<import('./TrustSchema.js').TrustConfig>}
   * @private
   */
  async _readBlobFromCommit(sha) {
    // Resolve commit -> tree OID
    let treeOid;
    try {
      treeOid = await this._persistence.getCommitTree(sha);
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow catch type
      throw new TrustError(
        `Cannot read commit ${sha}: ${err?.message}`,
        { code: 'E_TRUST_PIN_INVALID', context: { sha } },
      );
    }

    // Read tree entries (path -> blob OID)
    let entries;
    try {
      entries = await this._persistence.readTreeOids(treeOid);
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow catch type
      throw new TrustError(
        `Cannot read tree ${treeOid} for commit ${sha}: ${err?.message}`,
        { code: 'E_TRUST_PIN_INVALID', context: { sha, treeOid } },
      );
    }

    const blobOid = entries[TRUST_BLOB_NAME];
    if (!blobOid) {
      throw new TrustError(
        `Commit ${sha} tree does not contain ${TRUST_BLOB_NAME}`,
        { code: 'E_TRUST_SCHEMA_INVALID', context: { sha } },
      );
    }

    const blobContent = await this._readBlobContent(blobOid, sha);
    return this._parseAndValidateBlob(blobContent, sha);
  }

  /**
   * Reads raw blob content by OID.
   * @param {string} blobOid
   * @param {string} sha - Commit SHA for error context
   * @returns {Promise<Buffer>}
   * @private
   */
  async _readBlobContent(blobOid, sha) {
    try {
      return await this._persistence.readBlob(blobOid);
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow catch type
      throw new TrustError(
        `Cannot read blob ${blobOid} for ${TRUST_BLOB_NAME}: ${err?.message}`,
        { code: 'E_TRUST_SCHEMA_INVALID', context: { sha, blobOid } },
      );
    }
  }

  /**
   * Parses JSON from blob content and validates as TrustConfig.
   * @param {Buffer} blobContent
   * @param {string} sha - Commit SHA for error context
   * @returns {import('./TrustSchema.js').TrustConfig}
   * @private
   */
  _parseAndValidateBlob(blobContent, sha) {
    let raw;
    try {
      raw = JSON.parse(blobContent.toString('utf8'));
    } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow catch type
      throw new TrustError(
        `Malformed JSON in ${TRUST_BLOB_NAME}: ${err?.message}`,
        { code: 'E_TRUST_SCHEMA_INVALID', context: { sha } },
      );
    }
    return parseTrustConfig(raw);
  }
}
