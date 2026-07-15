import { describe, expect, it } from 'vitest';

import AuditChainVerifier from '../../../../../src/domain/services/audit/AuditChainVerifier.ts';
import { encodeAuditMessage } from '../../../../../src/domain/services/codec/AuditMessageCodec.ts';
import { CborCodec } from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import AuditLogPort, {
  type AppendAuditRecordRequest,
  type AuditLogEntry,
  type PublishedAuditRecord,
} from '../../../../../src/ports/AuditLogPort.ts';
import CodecPort from '../../../../../src/ports/CodecPort.ts';

const GRAPH = 'events';
const WRITER = 'alice';
const GENESIS = '1'.repeat(40);
const TIP = '2'.repeat(40);
const DATA = 'a'.repeat(40);
const DIGEST = 'b'.repeat(64);
const ZERO = '0'.repeat(40);
const codec = new CborCodec();

type Receipt = {
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

class FixtureAuditLog extends AuditLogPort {
  readonly entries = new Map<string, AuditLogEntry>();
  head: string | null = null;
  movedHead: string | null = null;
  headFailure: Error | string | null = null;
  readonly #headReads = new Map<string, number>();

  override async readHead(_graphName: string, _writerId: string): Promise<string | null> {
    if (this.headFailure !== null) {
      throw this.headFailure;
    }
    const key = `${_graphName}:${_writerId}`;
    const reads = this.#headReads.get(key) ?? 0;
    this.#headReads.set(key, reads + 1);
    return reads > 0 && this.movedHead !== null ? this.movedHead : this.head;
  }

  override async listWriterIds(): Promise<string[]> {
    return [WRITER];
  }

  override async append(_request: AppendAuditRecordRequest): Promise<PublishedAuditRecord> {
    throw new Error('FixtureAuditLog does not publish');
  }

  override async readEntry(sha: string): Promise<AuditLogEntry> {
    const entry = this.entries.get(sha);
    if (entry === undefined) {
      throw new Error(`missing ${sha}`);
    }
    return entry;
  }
}

class ThrowingCodec extends CodecPort {
  override encode<TEncoded>(data: TEncoded): Uint8Array {
    return codec.encode(data);
  }

  override decode<TDecoded>(_bytes: Uint8Array): TDecoded {
    throw new Error('corrupt receipt bytes');
  }
}

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    version: 1,
    graphName: GRAPH,
    writerId: WRITER,
    dataCommit: DATA,
    tickStart: 1,
    tickEnd: 1,
    opsDigest: DIGEST,
    prevAuditCommit: ZERO,
    timestamp: 1,
    ...overrides,
  };
}

function auditMessage(value: Receipt): string {
  return encodeAuditMessage({
    graph: value.graphName,
    writer: value.writerId,
    dataCommit: value.dataCommit,
    opsDigest: value.opsDigest,
  });
}

function addEntry(
  log: FixtureAuditLog,
  sha: string,
  value: unknown,
  options: { parents?: string[]; message?: string; messageReceipt?: Receipt } = {},
): void {
  const messageReceipt = options.messageReceipt ?? receipt();
  log.entries.set(sha, Object.freeze({
    sha,
    parents: Object.freeze([...(options.parents ?? [])]),
    message: options.message ?? auditMessage(messageReceipt),
    receipt: codec.encode(value),
  }));
}

function validChain(): FixtureAuditLog {
  const log = new FixtureAuditLog();
  const first = receipt();
  const second = receipt({
    tickStart: 2,
    tickEnd: 2,
    dataCommit: 'c'.repeat(40),
    opsDigest: 'd'.repeat(64),
    prevAuditCommit: GENESIS,
    timestamp: 2,
  });
  addEntry(log, GENESIS, first, { messageReceipt: first });
  addEntry(log, TIP, second, { parents: [GENESIS], messageReceipt: second });
  log.head = TIP;
  return log;
}

function receiptMissingTimestamp(): Readonly<Record<string, unknown>> {
  const value: Record<string, unknown> = { ...receipt(), extra: true };
  delete value['timestamp'];
  return value;
}

describe('AuditChainVerifier semantic audit-log boundary', () => {
  it('verifies a complete two-receipt chain and a bounded partial chain', async () => {
    const complete = await new AuditChainVerifier(validChain(), codec)
      .verifyChain(GRAPH, WRITER);
    const partial = await new AuditChainVerifier(validChain(), codec)
      .verifyChain(GRAPH, WRITER, { since: TIP });

    expect(complete).toMatchObject({
      status: 'VALID',
      receiptsVerified: 2,
      receiptsScanned: 2,
      tipCommit: TIP,
      genesisCommit: GENESIS,
      errors: [],
    });
    expect(partial).toMatchObject({
      status: 'PARTIAL',
      receiptsVerified: 1,
      stoppedAt: TIP,
      since: TIP,
    });
  });

  it('treats an absent head as an empty valid chain', async () => {
    const missing = new FixtureAuditLog();

    await expect(new AuditChainVerifier(missing, codec).verifyChain(GRAPH, WRITER))
      .resolves.toMatchObject({ status: 'VALID', receiptsScanned: 0 });
  });

  it.each([
    [new Error('head unavailable'), 'head unavailable'],
    ['head unavailable without an Error', 'head unavailable without an Error'],
  ])('reports an unreadable head as an audit verification error', async (failure, message) => {
    const unavailable = new FixtureAuditLog();
    unavailable.headFailure = failure;

    await expect(new AuditChainVerifier(unavailable, codec).verifyChain(GRAPH, WRITER))
      .resolves.toMatchObject({
        status: 'ERROR',
        receiptsScanned: 0,
        errors: [{ code: 'AUDIT_HEAD_UNAVAILABLE', message: `Cannot read audit head: ${message}` }],
      });
  });

  it.each([
    ['not-object', null],
    ['field-count', {}],
    ['missing-field', receiptMissingTimestamp()],
    ['version', receipt({ version: 2 })],
    ['graph', receipt({ graphName: '' })],
    ['writer', receipt({ writerId: '' })],
    ['data-commit-type', { ...receipt(), dataCommit: 1 }],
    ['tick-start', receipt({ tickStart: 0 })],
    ['tick-end', receipt({ tickEnd: 0 })],
    ['tick-width', receipt({ tickEnd: 2 })],
    ['timestamp', receipt({ timestamp: -1 })],
  ])('rejects malformed receipt schema: %s', async (_label, value) => {
    const log = new FixtureAuditLog();
    addEntry(log, TIP, value);
    log.head = TIP;

    const result = await new AuditChainVerifier(log, codec).verifyChain(GRAPH, WRITER);

    expect(result.errors[0]).toMatchObject({ code: 'RECEIPT_SCHEMA_INVALID' });
  });

  it.each([
    ['data-format', receipt({ dataCommit: 'not-hex' })],
    ['data-length', receipt({ dataCommit: 'a'.repeat(39) })],
    ['previous-format', receipt({ prevAuditCommit: 'not-hex' })],
    ['length', receipt({ dataCommit: 'a'.repeat(64) })],
  ])('rejects invalid or inconsistent OIDs: %s', async (_label, value) => {
    const log = new FixtureAuditLog();
    const messageReceipt = receipt({
      dataCommit: value.dataCommit.length === 64 ? 'a'.repeat(64) : DATA,
    });
    addEntry(log, TIP, value, { messageReceipt });
    log.head = TIP;

    const result = await new AuditChainVerifier(log, codec).verifyChain(GRAPH, WRITER);

    expect(result.errors[0]?.code).toMatch(/OID_(?:FORMAT_INVALID|LENGTH_MISMATCH)/u);
  });

  it.each([
    ['graph', receipt(), receipt({ graphName: 'other' })],
    ['writer', receipt(), receipt({ writerId: 'bob' })],
    ['data', receipt(), receipt({ dataCommit: 'c'.repeat(40) })],
    ['digest', receipt(), receipt({ opsDigest: 'd'.repeat(64) })],
  ])('detects receipt/trailer substitution: %s', async (_label, value, messageReceipt) => {
    const log = new FixtureAuditLog();
    addEntry(log, TIP, value, { messageReceipt });
    log.head = TIP;

    const result = await new AuditChainVerifier(log, codec).verifyChain(GRAPH, WRITER);

    expect(result).toMatchObject({
      status: 'DATA_MISMATCH',
      errors: [expect.objectContaining({ code: 'TRAILER_MISMATCH' })],
    });
  });

  it('reports missing entries, undecodable receipts, and invalid trailers', async () => {
    const missing = new FixtureAuditLog();
    missing.head = TIP;

    const decodeFailure = validChain();

    const trailerFailure = validChain();
    const trailerTip = trailerFailure.entries.get(TIP);
    if (trailerTip === undefined) {
      throw new Error('valid fixture is missing its trailer tip');
    }
    trailerFailure.entries.set(TIP, { ...trailerTip, message: 'not an audit message' });

    const missingResult = await new AuditChainVerifier(missing, codec).verifyChain(GRAPH, WRITER);
    const decodeResult = await new AuditChainVerifier(decodeFailure, new ThrowingCodec())
      .verifyChain(GRAPH, WRITER);
    const trailerResult = await new AuditChainVerifier(trailerFailure, codec)
      .verifyChain(GRAPH, WRITER);

    expect(missingResult.errors[0]?.code).toBe('MISSING_RECEIPT_BLOB');
    expect(decodeResult.errors[0]?.code).toBe('CBOR_DECODE_FAILED');
    expect(trailerResult).toMatchObject({ status: 'DATA_MISMATCH' });
  });

  it('detects broken genesis and continuation topology', async () => {
    const genesisParent = new FixtureAuditLog();
    const first = receipt();
    addEntry(genesisParent, GENESIS, first, {
      parents: [TIP],
      messageReceipt: first,
    });
    genesisParent.head = GENESIS;

    const noParent = new FixtureAuditLog();
    const continuation = receipt({ prevAuditCommit: GENESIS });
    addEntry(noParent, TIP, continuation, { messageReceipt: continuation });
    noParent.head = TIP;

    const wrongParent = new FixtureAuditLog();
    addEntry(wrongParent, TIP, continuation, {
      parents: ['f'.repeat(40)],
      messageReceipt: continuation,
    });
    wrongParent.head = TIP;

    const results = await Promise.all([
      new AuditChainVerifier(genesisParent, codec).verifyChain(GRAPH, WRITER),
      new AuditChainVerifier(noParent, codec).verifyChain(GRAPH, WRITER),
      new AuditChainVerifier(wrongParent, codec).verifyChain(GRAPH, WRITER),
    ]);

    expect(results.map((result) => result.errors[0]?.code)).toEqual([
      'GENESIS_HAS_PARENTS',
      'CONTINUATION_NO_PARENT',
      'GIT_PARENT_MISMATCH',
    ]);
  });

  it('detects expected identity mismatches after trailer validation', async () => {
    const wrongWriter = new FixtureAuditLog();
    const bob = receipt({ writerId: 'bob' });
    addEntry(wrongWriter, TIP, bob, { messageReceipt: bob });
    wrongWriter.head = TIP;

    const wrongGraph = new FixtureAuditLog();
    const other = receipt({ graphName: 'other' });
    addEntry(wrongGraph, TIP, other, { messageReceipt: other });
    wrongGraph.head = TIP;

    const writerResult = await new AuditChainVerifier(wrongWriter, codec)
      .verifyChain(GRAPH, WRITER);
    const graphResult = await new AuditChainVerifier(wrongGraph, codec)
      .verifyChain(GRAPH, WRITER);

    expect(writerResult.errors[0]?.code).toBe('WRITER_CONSISTENCY');
    expect(graphResult.errors[0]?.code).toBe('WRITER_CONSISTENCY');
  });

  it('detects OID width drift inside an otherwise connected chain', async () => {
    const changedDataWidth = validChain();
    const wideGenesis = receipt({
      dataCommit: 'a'.repeat(64),
      opsDigest: DIGEST,
      prevAuditCommit: '0'.repeat(64),
    });
    addEntry(changedDataWidth, GENESIS, wideGenesis, { messageReceipt: wideGenesis });

    const changedPreviousWidth = validChain();
    const widePrevious = receipt({ prevAuditCommit: '0'.repeat(64) });
    addEntry(changedPreviousWidth, GENESIS, widePrevious, { messageReceipt: widePrevious });

    const dataResult = await new AuditChainVerifier(changedDataWidth, codec)
      .verifyChain(GRAPH, WRITER);
    const previousResult = await new AuditChainVerifier(changedPreviousWidth, codec)
      .verifyChain(GRAPH, WRITER);

    expect(dataResult.errors[0]?.code).toBe('OID_LENGTH_MISMATCH');
    expect(previousResult.errors[0]?.code).toBe('OID_LENGTH_MISMATCH');
  });

  it('distinguishes tick regression, tick gaps, and graph drift across links', async () => {
    const regression = validChain();
    const regressedGenesis = receipt({ tickStart: 2, tickEnd: 2 });
    addEntry(regression, GENESIS, regressedGenesis, { messageReceipt: regressedGenesis });

    const gap = validChain();
    const gapTip = receipt({
      tickStart: 4,
      tickEnd: 4,
      dataCommit: 'c'.repeat(40),
      opsDigest: 'd'.repeat(64),
      prevAuditCommit: GENESIS,
      timestamp: 4,
    });
    addEntry(gap, TIP, gapTip, { parents: [GENESIS], messageReceipt: gapTip });

    const graphDrift = validChain();
    const other = receipt({ graphName: 'other' });
    addEntry(graphDrift, GENESIS, other, { messageReceipt: other });

    const regressionResult = await new AuditChainVerifier(regression, codec)
      .verifyChain(GRAPH, WRITER);
    const gapResult = await new AuditChainVerifier(gap, codec).verifyChain(GRAPH, WRITER);
    const graphResult = await new AuditChainVerifier(graphDrift, codec)
      .verifyChain(GRAPH, WRITER);

    expect(regressionResult.errors[0]?.code).toBe('TICK_MONOTONICITY');
    expect(gapResult.warnings).toContainEqual(expect.objectContaining({ code: 'TICK_GAP' }));
    expect(graphResult.errors[0]?.code).toBe('WRITER_CONSISTENCY');
  });

  it('reports missing since coordinates, tick defects, identity drift, and tip movement', async () => {
    const since = await new AuditChainVerifier(validChain(), codec)
      .verifyChain(GRAPH, WRITER, { since: 'f'.repeat(40) });

    const gapLog = validChain();
    const genesisEntry = gapLog.entries.get(GENESIS);
    const genesisReceipt = receipt({ writerId: 'bob' });
    if (genesisEntry === undefined) {
      throw new Error('valid fixture is missing genesis');
    }
    gapLog.entries.set(GENESIS, {
      ...genesisEntry,
      message: auditMessage(genesisReceipt),
      receipt: codec.encode(genesisReceipt),
    });

    const moved = validChain();
    moved.movedHead = 'e'.repeat(40);

    const identity = await new AuditChainVerifier(gapLog, codec).verifyChain(GRAPH, WRITER);
    const movedResult = await new AuditChainVerifier(moved, codec).verifyChain(GRAPH, WRITER);

    expect(since.errors[0]?.code).toBe('SINCE_NOT_FOUND');
    expect(identity.errors[0]?.code).toBe('WRITER_CONSISTENCY');
    expect(movedResult.warnings).toContainEqual(expect.objectContaining({
      code: 'TIP_MOVED_DURING_VERIFY',
    }));
  });
});
