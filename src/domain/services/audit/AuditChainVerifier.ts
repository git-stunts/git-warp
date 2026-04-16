/** Chain verification for tamper-evident audit receipt chains. */

import type CodecPort from '../../../ports/CodecPort.ts';
import type CommitPort from '../../../ports/CommitPort.ts';
import type RefPort from '../../../ports/RefPort.ts';
import type BlobPort from '../../../ports/BlobPort.ts';
import type TreePort from '../../../ports/TreePort.ts';
import { buildAuditRef } from '../../utils/RefLayout.ts';
import { decodeAuditMessage } from '../codec/AuditMessageCodec.ts';

// Status codes
const STATUS_VALID = 'VALID';
const STATUS_PARTIAL = 'PARTIAL';
const STATUS_BROKEN_CHAIN = 'BROKEN_CHAIN';
const STATUS_DATA_MISMATCH = 'DATA_MISMATCH';
const STATUS_ERROR = 'ERROR';

const OID_HEX_RE = /^[0-9a-f]+$/;

export type ChainError = {
  code: string;
  message: string;
  commit?: string;
};

export type ChainWarning = {
  code: string;
  message: string;
};

export type ChainResult = {
  writerId: string;
  ref: string;
  status: string;
  receiptsVerified: number;
  receiptsScanned: number;
  tipCommit: string | null;
  tipAtStart: string | null;
  genesisCommit: string | null;
  stoppedAt: string | null;
  since: string | null;
  errors: ChainError[];
  warnings: ChainWarning[];
};

type AuditReceipt = {
  version: number;
  graphName: string;
  writerId: string;
  dataCommit: string;
  tickStart: number;
  tickEnd: number;
  opsDigest: string;
  prevAuditCommit: string;
  timestamp: number;
};

type Persistence = CommitPort & RefPort & BlobPort & TreePort;

function validateOidFormat(value: string): { valid: boolean; normalized: string; error?: string } {
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

function validateReceiptSchema(receipt: unknown): string | null {
  if (receipt === null || receipt === undefined || typeof receipt !== 'object') {
    return 'receipt is not an object';
  }
  const rec = receipt as Record<string, unknown>;
  const keys = Object.keys(rec);
  if (keys.length !== 9) {
    return `expected 9 fields, got ${keys.length}`;
  }
  const required = [
    'dataCommit', 'graphName', 'opsDigest', 'prevAuditCommit',
    'tickEnd', 'tickStart', 'timestamp', 'version', 'writerId',
  ];
  for (const k of required) {
    if (!(k in rec)) {
      return `missing field: ${k}`;
    }
  }
  if (rec['version'] !== 1) {
    return `unsupported version: ${String(rec['version'])}`;
  }
  if (typeof rec['graphName'] !== 'string' || rec['graphName'].length === 0) {
    return 'graphName must be a non-empty string';
  }
  if (typeof rec['writerId'] !== 'string' || rec['writerId'].length === 0) {
    return 'writerId must be a non-empty string';
  }
  for (const f of ['dataCommit', 'opsDigest', 'prevAuditCommit'] as const) {
    if (typeof rec[f] !== 'string') { return `${f} must be a string`; }
  }
  const ts = rec['tickStart'] as number;
  const te = rec['tickEnd'] as number;
  if (!Number.isInteger(ts) || ts < 1) { return `tickStart must be integer >= 1, got ${String(ts)}`; }
  if (!Number.isInteger(te) || te < ts) { return `tickEnd must be integer >= tickStart, got ${String(te)}`; }
  if (rec['version'] === 1 && ts !== te) { return `v1 requires tickStart === tickEnd, got ${String(ts)} !== ${String(te)}`; }
  if (!Number.isInteger(rec['timestamp']) || (rec['timestamp'] as number) < 0) {
    return `timestamp must be non-negative integer, got ${String(rec['timestamp'])}`;
  }
  return null;
}

function validateTrailerConsistency(
  receipt: AuditReceipt,
  decoded: { graph: string; writer: string; dataCommit: string; opsDigest: string; schema: number },
): string | null {
  if (decoded.schema !== 1) {
    return `trailer eg-schema must be 1, got ${String(decoded.schema)}`;
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

/**
 * Verifies a single writer's audit receipt chain from tip to genesis.
 */
export default class AuditChainVerifier {
  private readonly _persistence: Persistence;
  private readonly _codec: CodecPort;

  constructor(persistence: Persistence, codec: CodecPort) {
    this._persistence = persistence;
    this._codec = codec;
  }

  /**
   * Verifies a single audit chain for a writer.
   */
  async verifyChain(
    graphName: string,
    writerId: string,
    options?: { since?: string },
  ): Promise<ChainResult> {
    const ref = buildAuditRef(graphName, writerId);
    const since = (typeof options?.since === 'string' && options.since.length > 0) ? options.since : null;

    const result: ChainResult = {
      writerId, ref,
      status: STATUS_VALID,
      receiptsVerified: 0, receiptsScanned: 0,
      tipCommit: null, tipAtStart: null,
      genesisCommit: null, stoppedAt: null, since,
      errors: [], warnings: [],
    };

    let tip: string | null;
    try {
      tip = await this._persistence.readRef(ref);
    } catch {
      return result;
    }
    if (typeof tip !== 'string' || tip.length === 0) {
      return result;
    }

    result.tipCommit = tip;
    result.tipAtStart = tip;

    await this._walkChain(graphName, writerId, tip, since, result);
    await this._checkTipMoved(ref, result);

    return result;
  }

  private async _walkChain(
    graphName: string,
    writerId: string,
    tip: string,
    since: string | null,
    result: ChainResult,
  ): Promise<void> {
    let current: string | null = tip;
    let prevReceipt: AuditReceipt | null = null;
    let chainOidLen: number | null = null;

    while (current !== null && current.length > 0) {
      result.receiptsScanned++;

      let commitInfo;
      try {
        commitInfo = await this._persistence.getNodeInfo(current);
      } catch (err) {
        this._addError(result, 'MISSING_RECEIPT_BLOB',
          `Cannot read commit ${current}: ${err instanceof Error ? err.message : String(err)}`, current);
        return;
      }

      const receiptResult = await this._readReceipt(current, commitInfo, result);
      if (!receiptResult) { return; }

      const { receipt, decodedTrailers } = receiptResult;

      const schemaErr = validateReceiptSchema(receipt);
      if (typeof schemaErr === 'string' && schemaErr.length > 0) {
        this._addError(result, 'RECEIPT_SCHEMA_INVALID', schemaErr, current);
        return;
      }

      if (!this._validateOids(receipt, result, current)) { return; }

      chainOidLen = this._checkOidLengthConsistency(receipt, chainOidLen, result, current);
      if (chainOidLen === null) { return; }

      const trailerErr = validateTrailerConsistency(receipt, decodedTrailers);
      if (typeof trailerErr === 'string' && trailerErr.length > 0) {
        this._addError(result, 'TRAILER_MISMATCH', trailerErr, current);
        result.status = STATUS_DATA_MISMATCH;
        return;
      }

      if (prevReceipt && !this._validateChainLink(receipt, prevReceipt, current, result)) {
        return;
      }

      if (!this._validateWriterConsistency(receipt, writerId, graphName, current, result)) {
        return;
      }

      result.receiptsVerified++;

      if (since !== null && current === since) {
        result.stoppedAt = current;
        if (result.errors.length === 0) { result.status = STATUS_PARTIAL; }
        return;
      }

      const cont = this._handleGenesisOrContinuation(receipt, commitInfo, since, chainOidLen, current, result);
      if (!cont) { return; }

      prevReceipt = receipt;
      current = commitInfo.parents[0] ?? null;
    }
  }

  private _checkOidLengthConsistency(
    receipt: AuditReceipt,
    chainOidLen: number | null,
    result: ChainResult,
    commitSha: string,
  ): number | null {
    const oidLen = receipt.dataCommit.length;
    if (chainOidLen === null) {
      if (receipt.prevAuditCommit.length !== oidLen) {
        this._addError(result, 'OID_LENGTH_MISMATCH',
          `prevAuditCommit length ${String(receipt.prevAuditCommit.length)} !== dataCommit length ${String(oidLen)}`, commitSha);
        return null;
      }
      return oidLen;
    }
    if (oidLen !== chainOidLen) {
      this._addError(result, 'OID_LENGTH_MISMATCH',
        `OID length changed from ${String(chainOidLen)} to ${String(oidLen)}`, commitSha);
      return null;
    }
    if (receipt.prevAuditCommit.length !== oidLen) {
      this._addError(result, 'OID_LENGTH_MISMATCH',
        `prevAuditCommit length ${String(receipt.prevAuditCommit.length)} !== dataCommit length ${String(oidLen)}`, commitSha);
      return null;
    }
    return chainOidLen;
  }

  private _validateWriterConsistency(
    receipt: AuditReceipt,
    writerId: string,
    graphName: string,
    commitSha: string,
    result: ChainResult,
  ): boolean {
    if (receipt.writerId !== writerId) {
      this._addError(result, 'WRITER_CONSISTENCY',
        `receipt writerId '${receipt.writerId}' !== expected '${writerId}'`, commitSha);
      result.status = STATUS_BROKEN_CHAIN;
      return false;
    }
    if (receipt.graphName !== graphName) {
      this._addError(result, 'WRITER_CONSISTENCY',
        `receipt graphName '${receipt.graphName}' !== expected '${graphName}'`, commitSha);
      result.status = STATUS_BROKEN_CHAIN;
      return false;
    }
    return true;
  }

  private _handleGenesisOrContinuation(
    receipt: AuditReceipt,
    commitInfo: { parents: string[] },
    since: string | null,
    chainOidLen: number,
    current: string,
    result: ChainResult,
  ): boolean {
    const zeroHash = '0'.repeat(chainOidLen);
    if (receipt.prevAuditCommit === zeroHash) {
      result.genesisCommit = current;
      if (commitInfo.parents.length !== 0) {
        this._addError(result, 'GENESIS_HAS_PARENTS',
          `Genesis commit has ${String(commitInfo.parents.length)} parent(s)`, current);
        result.status = STATUS_BROKEN_CHAIN;
        return false;
      }
      if (since !== null) {
        this._addError(result, 'SINCE_NOT_FOUND',
          `Commit ${since} not found in chain`, null);
        result.status = STATUS_ERROR;
        return false;
      }
      if (result.errors.length === 0) { result.status = STATUS_VALID; }
      return false;
    }

    if (commitInfo.parents.length !== 1) {
      this._addError(result, 'CONTINUATION_NO_PARENT',
        `Continuation commit has ${String(commitInfo.parents.length)} parent(s), expected 1`, current);
      result.status = STATUS_BROKEN_CHAIN;
      return false;
    }
    if (commitInfo.parents[0] !== receipt.prevAuditCommit) {
      this._addError(result, 'GIT_PARENT_MISMATCH',
        `Git parent '${commitInfo.parents[0]}' !== prevAuditCommit '${receipt.prevAuditCommit}'`, current);
      result.status = STATUS_BROKEN_CHAIN;
      return false;
    }
    return true;
  }

  private async _readReceipt(
    commitSha: string,
    commitInfo: { message: string },
    result: ChainResult,
  ): Promise<{ receipt: AuditReceipt; decodedTrailers: { graph: string; writer: string; dataCommit: string; opsDigest: string; schema: number } } | null> {
    let treeOid: string;
    try {
      treeOid = await this._persistence.getCommitTree(commitSha);
    } catch (err) {
      this._addError(result, 'MISSING_RECEIPT_BLOB',
        `Cannot read tree for ${commitSha}: ${err instanceof Error ? err.message : String(err)}`, commitSha);
      return null;
    }

    let treeEntries: Record<string, string>;
    try {
      treeEntries = await this._persistence.readTreeOids(treeOid);
    } catch (err) {
      this._addError(result, 'RECEIPT_TREE_INVALID',
        `Cannot read tree ${treeOid}: ${err instanceof Error ? err.message : String(err)}`, commitSha);
      return null;
    }

    const entryNames = Object.keys(treeEntries);
    if (entryNames.length !== 1 || entryNames[0] !== 'receipt.cbor') {
      this._addError(result, 'RECEIPT_TREE_INVALID',
        `Expected exactly one entry 'receipt.cbor', got [${entryNames.join(', ')}]`, commitSha);
      result.status = STATUS_BROKEN_CHAIN;
      return null;
    }

    const blobOid = treeEntries['receipt.cbor'];
    if (blobOid === undefined) {
      this._addError(result, 'MISSING_RECEIPT_BLOB', 'receipt.cbor entry missing from audit tree', commitSha);
      return null;
    }

    let blobContent: Uint8Array;
    try {
      blobContent = await this._persistence.readBlob(blobOid);
    } catch (err) {
      this._addError(result, 'MISSING_RECEIPT_BLOB',
        `Cannot read receipt blob ${blobOid}: ${err instanceof Error ? err.message : String(err)}`, commitSha);
      return null;
    }

    let receipt: AuditReceipt;
    try {
      receipt = this._codec.decode(blobContent);
    } catch (err) {
      this._addError(result, 'CBOR_DECODE_FAILED',
        `CBOR decode failed: ${err instanceof Error ? err.message : String(err)}`, commitSha);
      result.status = STATUS_ERROR;
      return null;
    }

    let decodedTrailers;
    try {
      decodedTrailers = decodeAuditMessage(commitInfo.message);
    } catch (err) {
      this._addError(result, 'TRAILER_MISMATCH',
        `Trailer decode failed: ${err instanceof Error ? err.message : String(err)}`, commitSha);
      result.status = STATUS_DATA_MISMATCH;
      return null;
    }

    return { receipt, decodedTrailers };
  }

  private _validateOids(receipt: AuditReceipt, result: ChainResult, commitSha: string): boolean {
    const dcCheck = validateOidFormat(receipt.dataCommit);
    if (!dcCheck.valid) {
      this._addError(result, 'OID_FORMAT_INVALID',
        `dataCommit OID invalid: ${dcCheck.error ?? 'unknown'}`, commitSha);
      result.status = STATUS_BROKEN_CHAIN;
      return false;
    }
    const pacCheck = validateOidFormat(receipt.prevAuditCommit);
    const isZero = /^0+$/.test(receipt.prevAuditCommit);
    if (!pacCheck.valid && !isZero) {
      this._addError(result, 'OID_FORMAT_INVALID',
        `prevAuditCommit OID invalid: ${pacCheck.error ?? 'unknown'}`, commitSha);
      result.status = STATUS_BROKEN_CHAIN;
      return false;
    }
    return true;
  }

  private _validateChainLink(
    currentReceipt: AuditReceipt,
    prevReceipt: AuditReceipt,
    commitSha: string,
    result: ChainResult,
  ): boolean {
    if (currentReceipt.tickEnd >= prevReceipt.tickStart) {
      this._addError(result, 'TICK_MONOTONICITY',
        `tick ${String(currentReceipt.tickEnd)} >= previous ${String(prevReceipt.tickStart)}`, commitSha);
      result.status = STATUS_BROKEN_CHAIN;
      return false;
    }
    if (currentReceipt.tickEnd + 1 < prevReceipt.tickStart) {
      result.warnings.push({
        code: 'TICK_GAP',
        message: `Gap between tick ${String(currentReceipt.tickEnd)} and ${String(prevReceipt.tickStart)}`,
      });
    }
    if (currentReceipt.writerId !== prevReceipt.writerId) {
      this._addError(result, 'WRITER_CONSISTENCY',
        `writerId changed from '${currentReceipt.writerId}' to '${prevReceipt.writerId}'`, commitSha);
      result.status = STATUS_BROKEN_CHAIN;
      return false;
    }
    if (currentReceipt.graphName !== prevReceipt.graphName) {
      this._addError(result, 'WRITER_CONSISTENCY',
        `graphName changed from '${currentReceipt.graphName}' to '${prevReceipt.graphName}'`, commitSha);
      result.status = STATUS_BROKEN_CHAIN;
      return false;
    }
    return true;
  }

  private async _checkTipMoved(ref: string, result: ChainResult): Promise<void> {
    try {
      const currentTip = await this._persistence.readRef(ref);
      if (typeof currentTip === 'string' && currentTip.length > 0 && currentTip !== result.tipAtStart) {
        result.warnings.push({
          code: 'TIP_MOVED_DURING_VERIFY',
          message: `Ref tip moved from ${result.tipAtStart ?? 'null'} to ${currentTip} during verification`,
        });
      }
    } catch {
      // Best-effort — if we can't re-read, skip the warning
    }
  }

  private _addError(result: ChainResult, code: string, message: string, commit: string | null): void {
    result.errors.push({
      code,
      message,
      ...(typeof commit === 'string' && commit.length > 0 ? { commit } : {}),
    });
    if (result.status === STATUS_VALID || result.status === STATUS_PARTIAL) {
      result.status = STATUS_ERROR;
    }
  }
}
