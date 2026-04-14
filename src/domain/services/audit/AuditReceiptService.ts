/** AuditReceiptService — persistent, chained, tamper-evident audit receipts. */

import AuditError from '../../errors/AuditError.ts';
import { buildAuditRef } from '../../utils/RefLayout.ts';
import { encodeAuditMessage } from '../codec/AuditMessageCodec.ts';
import type { OpOutcome, TickReceipt } from '../../types/TickReceipt.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type RefPort from '../../../ports/RefPort.ts';
import type BlobPort from '../../../ports/BlobPort.ts';
import type TreePort from '../../../ports/TreePort.ts';
import type CommitPort from '../../../ports/CommitPort.ts';
import type ClockPort from '../../../ports/ClockPort.ts';
import defaultClock from '../../utils/defaultClock.ts';

// Constants

/**
 * Domain-separated prefix for opsDigest computation.
 * The trailing \0 is a literal null byte (U+0000) acting as an
 * unambiguous delimiter between the prefix and the JSON payload.
 */
export const OPS_DIGEST_PREFIX = 'git-warp:opsDigest:v1\0';

// Normative Canonicalization Helpers (DO NOT ALTER — tied to spec Sections 5.2-5.3)

/** JSON.stringify replacer sorting object keys lexicographically (spec Section 5.2). */
export function sortedReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    const obj = value as Record<string, unknown>;
    for (const k of Object.keys(obj).sort()) {
      sorted[k] = obj[k];
    }
    return sorted;
  }
  return value;
}

/** Canonical JSON string of an ops array (spec Section 5.2). */
export function canonicalOpsJson(ops: ReadonlyArray<Readonly<OpOutcome>>): string {
  return JSON.stringify(ops, sortedReplacer);
}

const textEncoder = new TextEncoder();

/** Computes domain-separated SHA-256 opsDigest (spec Section 5.3). */
export async function computeOpsDigest(
  ops: ReadonlyArray<Readonly<OpOutcome>>,
  crypto: CryptoPort,
): Promise<string> {
  const json = canonicalOpsJson(ops);
  const prefix = textEncoder.encode(OPS_DIGEST_PREFIX);
  const payload = textEncoder.encode(json);
  const combined = new Uint8Array(prefix.length + payload.length);
  combined.set(prefix);
  combined.set(payload, prefix.length);
  return await crypto.hash('sha256', combined);
}

// Receipt Value Object

export interface AuditReceiptFields {
  version: number;
  graphName: string;
  writerId: string;
  dataCommit: string;
  tickStart: number;
  tickEnd: number;
  opsDigest: string;
  prevAuditCommit: string;
  timestamp: number;
}

/** Immutable audit receipt value object. Frozen, keys in sorted order for deterministic CBOR. */
export class AuditReceipt {
  readonly dataCommit: string;
  readonly graphName: string;
  readonly opsDigest: string;
  readonly prevAuditCommit: string;
  readonly tickEnd: number;
  readonly tickStart: number;
  readonly timestamp: number;
  readonly version: number;
  readonly writerId: string;

  /** Creates an immutable audit receipt from validated fields. */
  constructor({ version, graphName, writerId, dataCommit, tickStart, tickEnd, opsDigest, prevAuditCommit, timestamp }: AuditReceiptFields) {
    // Alphabetical key order for canonical CBOR
    this.dataCommit = dataCommit;
    this.graphName = graphName;
    this.opsDigest = opsDigest;
    this.prevAuditCommit = prevAuditCommit;
    this.tickEnd = tickEnd;
    this.tickStart = tickStart;
    this.timestamp = timestamp;
    this.version = version;
    this.writerId = writerId;
    Object.freeze(this);
  }
}

// Receipt Construction

const OID_HEX_PATTERN = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

/**
 * Validates and builds a frozen receipt record with keys in sorted order.
 *
 * @throws {AuditError} If any field is invalid (code: E_AUDIT_INVALID)
 */
export function buildReceiptRecord(fields: AuditReceiptFields): AuditReceipt {
  const {
    version, graphName, writerId, dataCommit,
    tickStart, tickEnd, opsDigest, prevAuditCommit, timestamp,
  } = fields;

  // version
  if (version !== 1) {
    throw new AuditError(`Invalid version: must be 1, got ${version}`, { context: { version } });
  }

  // graphName — validated by RefLayout
  if (typeof graphName !== 'string' || graphName.length === 0) {
    throw new AuditError('Invalid graphName: must be a non-empty string', { context: { graphName } });
  }

  // writerId — validated by RefLayout
  if (typeof writerId !== 'string' || writerId.length === 0) {
    throw new AuditError('Invalid writerId: must be a non-empty string', { context: { writerId } });
  }

  // dataCommit
  const dc = dataCommit.toLowerCase();
  if (!OID_HEX_PATTERN.test(dc)) {
    throw new AuditError(`Invalid dataCommit OID: ${dataCommit}`, { context: { dataCommit } });
  }

  // opsDigest
  const od = opsDigest.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(od)) {
    throw new AuditError(`Invalid opsDigest: must be 64-char lowercase hex, got ${opsDigest}`, { context: { opsDigest } });
  }

  // prevAuditCommit
  const pac = prevAuditCommit.toLowerCase();
  if (!OID_HEX_PATTERN.test(pac)) {
    throw new AuditError(`Invalid prevAuditCommit OID: ${prevAuditCommit}`, { context: { prevAuditCommit } });
  }

  // OID length consistency
  const oidLen = dc.length;
  if (pac.length !== oidLen) {
    throw new AuditError(`OID length mismatch: dataCommit=${dc.length}, prevAuditCommit=${pac.length}`, { context: { dataCommitLen: dc.length, prevAuditCommitLen: pac.length } });
  }

  // tick constraints
  if (!Number.isInteger(tickStart) || tickStart < 1) {
    throw new AuditError(`Invalid tickStart: must be integer >= 1, got ${tickStart}`, { context: { tickStart } });
  }
  if (!Number.isInteger(tickEnd) || tickEnd < tickStart) {
    throw new AuditError(`Invalid tickEnd: must be integer >= tickStart, got ${tickEnd}`, { context: { tickEnd, tickStart } });
  }
  if (version === 1 && tickStart !== tickEnd) {
    throw new AuditError(`v1 requires tickStart === tickEnd, got ${tickStart} !== ${tickEnd}`, { context: { tickStart, tickEnd } });
  }

  // Zero-hash sentinel only for genesis (tickStart === 1)
  const zeroHash = '0'.repeat(oidLen);
  if (pac === zeroHash && tickStart > 1) {
    throw new AuditError('Non-genesis receipt cannot use zero-hash sentinel', { context: { tickStart, prevAuditCommit: pac } });
  }

  // timestamp
  if (!Number.isInteger(timestamp) || timestamp < 0) {
    throw new AuditError(`Invalid timestamp: must be non-negative safe integer, got ${timestamp}`, { context: { timestamp } });
  }
  if (!Number.isSafeInteger(timestamp)) {
    throw new AuditError(`Invalid timestamp: exceeds Number.MAX_SAFE_INTEGER: ${timestamp}`, { context: { timestamp } });
  }

  return new AuditReceipt({
    version,
    graphName,
    writerId,
    dataCommit: dc,
    tickStart,
    tickEnd,
    opsDigest: od,
    prevAuditCommit: pac,
    timestamp,
  });
}

/** Combined persistence interface required by AuditReceiptService. */
export type AuditPersistence = RefPort & BlobPort & TreePort & CommitPort;

export interface AuditReceiptServiceOptions {
  persistence: AuditPersistence;
  graphName: string;
  writerId: string;
  codec: CodecPort;
  crypto: CryptoPort;
  logger?: LoggerPort;
  clock?: ClockPort;
}

export interface AuditStats {
  committed: number;
  skipped: number;
  failed: number;
  degraded: boolean;
}

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
  private readonly _persistence: AuditPersistence;
  private readonly _graphName: string;
  private readonly _writerId: string;
  private readonly _codec: CodecPort;
  private readonly _crypto: CryptoPort;
  private readonly _clock: ClockPort;
  private readonly _logger: LoggerPort | null;
  private readonly _auditRef: string;

  /** Previous audit commit SHA (null = genesis) */
  private _prevAuditCommit: string | null;

  /** Expected old ref value for CAS (null = ref doesn't exist) */
  private _expectedOldRef: string | null;

  /** If true, service is degraded — skip all commits */
  private _degraded: boolean;

  /** If true, currently retrying — prevents recursive retry */
  private _retrying: boolean;

  private _committed: number;
  private _skipped: number;
  private _failed: number;

  /** Constructs an AuditReceiptService for the given writer audit chain. */
  constructor({ persistence, graphName, writerId, codec, crypto, logger, clock }: AuditReceiptServiceOptions) {
    this._persistence = persistence;
    this._graphName = graphName;
    this._writerId = writerId;
    this._codec = codec;
    this._crypto = crypto;
    this._clock = clock ?? defaultClock;
    this._logger = logger ?? null;
    this._auditRef = buildAuditRef(graphName, writerId);

    this._prevAuditCommit = null;
    this._expectedOldRef = null;
    this._degraded = false;
    this._retrying = false;

    this._committed = 0;
    this._skipped = 0;
    this._failed = 0;
  }

  /**
   * Initializes the service by reading the current audit ref tip.
   * Must be called before `commit()`.
   */
  async init(): Promise<void> {
    try {
      const tip = await this._persistence.readRef(this._auditRef);
      if (tip !== null && tip !== undefined && tip.length > 0) {
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
   * @returns The audit commit SHA, or null on failure
   */
  async commit(tickReceipt: TickReceipt): Promise<string | null> {
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
    } catch (err) {
      this._failed++;
      this._logger?.warn('[warp:audit]', {
        code: 'AUDIT_COMMIT_FAILED',
        writerId: this._writerId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /** Returns audit stats for coverage probing. */
  getStats(): AuditStats {
    return {
      committed: this._committed,
      skipped: this._skipped,
      failed: this._failed,
      degraded: this._degraded,
    };
  }

  /**
   * Inner commit logic. Throws on failure (caught by `commit()`).
   * @private
   */
  private async _commitInner(tickReceipt: TickReceipt): Promise<string> {
    const { patchSha, writer, lamport, ops } = tickReceipt;

    // Guard: reject cross-writer attribution
    if (writer !== this._writerId) {
      this._logger?.warn('[warp:audit]', {
        code: 'AUDIT_WRITER_MISMATCH',
        expected: this._writerId,
        actual: writer,
        patchSha,
      });
      throw new AuditError(
        `Audit writer mismatch: expected '${this._writerId}', got '${writer}'`,
        { code: AuditError.E_AUDIT_WRITER_MISMATCH, context: { expected: this._writerId, actual: writer, patchSha } },
      );
    }

    // Compute opsDigest
    const opsDigest = await computeOpsDigest(ops, this._crypto);

    // Wall-clock timestamp for audit receipt (not a perf timer)
    const timestamp = this._clock.epochMs();

    // Determine prevAuditCommit
    const oidLen = patchSha.length;
    const prevAuditCommit = (this._prevAuditCommit !== null && this._prevAuditCommit.length > 0) ? this._prevAuditCommit : '0'.repeat(oidLen);

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
    let blobOid: string;
    try {
      blobOid = await this._persistence.writeBlob(cborBytes);
    } catch (err) {
      this._logger?.warn('[warp:audit]', {
        code: 'AUDIT_WRITE_BLOB_FAILED',
        writerId: this._writerId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    // Write tree
    let treeOid: string;
    try {
      treeOid = await this._persistence.writeTree([
        `100644 blob ${blobOid}\treceipt.cbor`,
      ]);
    } catch (err) {
      this._logger?.warn('[warp:audit]', {
        code: 'AUDIT_WRITE_TREE_FAILED',
        writerId: this._writerId,
        error: err instanceof Error ? err.message : String(err),
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
    const parents = (this._prevAuditCommit !== null && this._prevAuditCommit.length > 0) ? [this._prevAuditCommit] : [];

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
        throw new AuditError('CAS failed during retry', { code: AuditError.E_AUDIT_CAS_FAILED, context: { writerId: this._writerId, ref: this._auditRef } });
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
   * @private
   */
  private async _retryAfterCasConflict(_failedCommitSha: string, tickReceipt: TickReceipt): Promise<string> {
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
      throw new AuditError('Audit service degraded after second CAS failure', { code: AuditError.E_AUDIT_DEGRADED, context: { writerId: this._writerId } });
    } finally {
      this._retrying = false;
    }
  }
}
