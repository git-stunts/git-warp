/**
 * Git-backed trust chain adapter.
 *
 * Uses git-cas for CBOR blob storage (chunked, content-addressed,
 * streaming) and @git-stunts/plumbing for commit chain traversal
 * and ref management.
 *
 * Handles all encoding/decoding at the boundary:
 * - On READ: CBOR decode, recordId hash verification, signaturePayload
 *   precomputation, TrustRecord.fromDecoded()
 * - On WRITE: CBOR encode via git-cas, commit + tree, ref CAS
 *
 * @module infrastructure/adapters/GitTrustChainAdapter
 */

import TrustChainPort, { type TrustChainTip } from '../../ports/TrustChainPort.ts';
import { TrustRecord } from '../../domain/trust/TrustRecord.ts';
import { recordIdPayload, signaturePayload } from '../../domain/trust/canonical.ts';
import { textEncode } from '../../domain/utils/bytes.ts';
import { buildTrustRecordRef } from '../../domain/utils/RefLayout.ts';
import TrustError from '../../domain/errors/TrustError.ts';
import { createLazyCas } from './lazyCasInit.js';
import LoggerObservabilityBridge from './LoggerObservabilityBridge.js';
import type LoggerPort from '../../ports/LoggerPort.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import { Readable } from 'node:stream';

// -- Constants ----------------------------------------------------------------

const MAX_TRANSIENT_CAS_ATTEMPTS = 3;
const RECORD_BLOB_NAME = 'record.cbor';

// -- Plumbing type (minimal contract) -----------------------------------------

type Plumbing = {
  execute(opts: { args: string[]; input?: string }): Promise<string>;
};

// -- CAS types (minimal contract from git-cas) --------------------------------

type CasManifest = {
  readonly slug: string;
  readonly chunks: readonly { readonly digest: string; readonly blobOid: string }[];
};

type CasStore = {
  store(opts: {
    source: Readable;
    slug: string;
    filename: string;
  }): Promise<CasManifest>;
  restore(opts: { manifest: CasManifest }): Promise<{ buffer: Buffer }>;
  readManifest(opts: { treeOid: string }): Promise<CasManifest>;
  createTree(opts: { manifest: CasManifest }): Promise<string>;
};

// -- Adapter deps -------------------------------------------------------------

type GitTrustChainDeps = {
  readonly plumbing: Plumbing;
  readonly crypto: CryptoPort;
  readonly logger?: LoggerPort;
};

// -- Plumbing helpers ---------------------------------------------------------

async function resolveRef(plumbing: Plumbing, ref: string): Promise<string | null> {
  try {
    const sha = await plumbing.execute({ args: ['rev-parse', '--verify', ref] });
    return sha.trim();
  } catch {
    return null;
  }
}

type CommitInfo = {
  readonly treeSha: string;
  readonly parents: readonly string[];
};

async function readCommitInfo(plumbing: Plumbing, commitSha: string): Promise<CommitInfo> {
  const raw = await plumbing.execute({ args: ['cat-file', '-p', commitSha] });
  let treeSha = '';
  const parents: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('tree ')) {
      treeSha = line.slice(5).trim();
    } else if (line.startsWith('parent ')) {
      parents.push(line.slice(7).trim());
    } else if (line === '') {
      break;
    }
  }
  return { treeSha, parents };
}

async function readTreeEntries(
  plumbing: Plumbing,
  treeSha: string,
): Promise<Map<string, string>> {
  const raw = await plumbing.execute({ args: ['ls-tree', treeSha] });
  const entries = new Map<string, string>();
  for (const line of raw.trim().split('\n')) {
    if (line.length === 0) {
      continue;
    }
    const tabIdx = line.indexOf('\t');
    if (tabIdx < 0) {
      continue;
    }
    const name = line.slice(tabIdx + 1);
    const parts = line.slice(0, tabIdx).split(' ');
    const oid = parts[2] ?? '';
    entries.set(name, oid);
  }
  return entries;
}

async function createCommit(
  plumbing: Plumbing,
  treeSha: string,
  parentSha: string | null,
  message: string,
): Promise<string> {
  const args = ['commit-tree', treeSha, '-m', message];
  if (parentSha) {
    args.push('-p', parentSha);
  }
  const sha = await plumbing.execute({ args });
  return sha.trim();
}

async function compareAndSwapRef(
  plumbing: Plumbing,
  ref: string,
  newSha: string,
  expectedSha: string | null,
): Promise<void> {
  const args = expectedSha
    ? ['update-ref', ref, newSha, expectedSha]
    : ['update-ref', ref, newSha];
  await plumbing.execute({ args });
}

// -- Hash helpers (boundary concern) ------------------------------------------

async function computeRecordIdHash(
  record: Record<string, string | number | boolean | null | object>,
  crypto: CryptoPort,
): Promise<string> {
  return await crypto.hash('sha256', recordIdPayload(record));
}

function computeSignaturePayloadBytes(
  record: Record<string, string | number | boolean | null | object>,
): Uint8Array {
  return textEncode(signaturePayload(record));
}

// -- CBOR codec (uses git-cas's CborCodec) ------------------------------------

type CborCodecInstance = {
  encode(data: object): Buffer;
  decode(buf: Buffer): object;
};

async function loadCborCodec(): Promise<CborCodecInstance> {
  // Adapter boundary: @git-stunts/git-cas exports CborCodec but TS resolution misses it
  const mod = await import('@git-stunts/git-cas') as unknown as Record<string, new () => CborCodecInstance>;
  return new mod['CborCodec']!();
}

// -- Adapter ------------------------------------------------------------------

export default class GitTrustChainAdapter extends TrustChainPort {
  private readonly _plumbing: Plumbing;
  private readonly _crypto: CryptoPort;
  private readonly _logger: LoggerPort | undefined;
  private readonly _getCas: () => Promise<CasStore>;
  private _cbor: CborCodecInstance | null = null;

  constructor(deps: GitTrustChainDeps) {
    super();
    this._plumbing = deps.plumbing;
    this._crypto = deps.crypto;
    this._logger = deps.logger;
    this._getCas = createLazyCas(() => this._initCas());
  }

  private async _initCas(): Promise<CasStore> {
    // Adapter boundary: @git-stunts/git-cas exports are accessed via dynamic import
    const casModule = await import('@git-stunts/git-cas') as unknown as Record<string, new (...args: unknown[]) => unknown>;
    const ContentAddressableStore = casModule['default'] as unknown as new (opts: unknown) => CasStore;
    const CborCodecCtor = casModule['CborCodec'] as unknown as new () => CborCodecInstance;
    const opts: {
      plumbing: Plumbing;
      codec: CborCodecInstance;
      chunking: { strategy: string };
      observability?: LoggerObservabilityBridge;
    } = {
      plumbing: this._plumbing,
      codec: new CborCodecCtor(),
      chunking: { strategy: 'cdc' },
    };
    if (this._logger) {
      opts.observability = new LoggerObservabilityBridge(this._logger);
    }
    return new ContentAddressableStore(opts);
  }

  private async _getCbor(): Promise<CborCodecInstance> {
    if (!this._cbor) {
      this._cbor = await loadCborCodec();
    }
    return this._cbor;
  }

  // -- Port implementation: readTip -------------------------------------------

  async readTip(graphName: string): Promise<TrustChainTip | null> {
    const ref = buildTrustRecordRef(graphName);
    const tipSha = await resolveRef(this._plumbing, ref);
    if (!tipSha) {
      return null;
    }

    const recordId = await this._readRecordIdFromCommit(tipSha);
    return { tipSha, recordId };
  }

  private async _readRecordIdFromCommit(commitSha: string): Promise<string | null> {
    const cas = await this._getCas();
    const info = await readCommitInfo(this._plumbing, commitSha);
    const entries = await readTreeEntries(this._plumbing, info.treeSha);

    const manifestOid = entries.get(RECORD_BLOB_NAME);
    if (!manifestOid) {
      return null;
    }

    try {
      const manifest = await cas.readManifest({ treeOid: info.treeSha });
      const restored = await cas.restore({ manifest });
      const cbor = await this._getCbor();
      const decoded = cbor.decode(restored.buffer) as Record<string, string>;
      return decoded['recordId'] ?? null;
    } catch {
      // Fallback: try reading as raw blob (pre-CAS migration)
      return await this._readRecordIdRawFallback(manifestOid);
    }
  }

  private async _readRecordIdRawFallback(blobOid: string): Promise<string | null> {
    try {
      const raw = await this._plumbing.execute({ args: ['cat-file', 'blob', blobOid] });
      const cbor = await this._getCbor();
      const decoded = cbor.decode(Buffer.from(raw, 'binary')) as Record<string, string>;
      return decoded['recordId'] ?? null;
    } catch {
      return null;
    }
  }

  // -- Port implementation: readRecords (streaming) ---------------------------

  async *readRecords(graphName: string, tip?: string): AsyncIterable<TrustRecord> {
    const ref = buildTrustRecordRef(graphName);
    let currentSha = tip ?? await resolveRef(this._plumbing, ref);

    if (!currentSha) {
      return;
    }

    // Walk backward, collecting SHAs for forward iteration
    const commitShas: string[] = [];
    while (currentSha) {
      commitShas.push(currentSha);
      const info = await readCommitInfo(this._plumbing, currentSha);
      currentSha = info.parents[0] ?? null;
    }

    // Yield records oldest-first
    for (let i = commitShas.length - 1; i >= 0; i--) {
      const sha = commitShas[i]!;
      const record = await this._decodeRecordFromCommit(sha);
      if (record) {
        yield record;
      }
    }
  }

  private async _decodeRecordFromCommit(commitSha: string): Promise<TrustRecord | null> {
    const info = await readCommitInfo(this._plumbing, commitSha);
    const cas = await this._getCas();
    const cbor = await this._getCbor();

    let rawRecord: Record<string, string | number | boolean | null | object>;

    try {
      const manifest = await cas.readManifest({ treeOid: info.treeSha });
      const restored = await cas.restore({ manifest });
      rawRecord = cbor.decode(restored.buffer) as typeof rawRecord;
    } catch {
      // Fallback: pre-CAS raw blob
      const entries = await readTreeEntries(this._plumbing, info.treeSha);
      const blobOid = entries.get(RECORD_BLOB_NAME);
      if (!blobOid) {
        return null;
      }
      const raw = await this._plumbing.execute({ args: ['cat-file', 'blob', blobOid] });
      rawRecord = cbor.decode(Buffer.from(raw, 'binary')) as typeof rawRecord;
    }

    // Verify recordId at boundary
    const expectedId = await computeRecordIdHash(rawRecord, this._crypto);
    const actualId = rawRecord['recordId'];
    if (typeof actualId !== 'string' || actualId !== expectedId) {
      throw new TrustError(
        `RecordId mismatch: expected ${expectedId}, got ${String(actualId)}`,
        { code: 'E_TRUST_RECORD_ID_MISMATCH' },
      );
    }

    // Precompute signature payload from raw canonical form
    const sigPayload = computeSignaturePayloadBytes(rawRecord);

    return TrustRecord.fromDecoded({
      schemaVersion: rawRecord['schemaVersion'] as number,
      recordType: rawRecord['recordType'] as string,
      recordId: rawRecord['recordId'] as string,
      issuerKeyId: rawRecord['issuerKeyId'] as string,
      issuedAt: rawRecord['issuedAt'] as string,
      prev: rawRecord['prev'] as string | null,
      subject: rawRecord['subject'] as Readonly<Record<string, string>>,
      meta: (rawRecord['meta'] ?? {}) as Readonly<Record<string, string | number | boolean | null>>,
      signature: rawRecord['signature'] as { readonly alg: string; readonly sig: string },
      signaturePayload: sigPayload,
    });
  }

  // -- Port implementation: persistRecord -------------------------------------

  async persistRecord(
    graphName: string,
    record: TrustRecord,
    parentTipSha: string | null,
  ): Promise<string> {
    const ref = buildTrustRecordRef(graphName);
    const cas = await this._getCas();
    const cbor = await this._getCbor();

    // Encode record as CBOR → store via git-cas
    const recordObj = {
      schemaVersion: record.schemaVersion,
      recordType: record.recordType,
      recordId: record.recordId,
      issuerKeyId: record.issuerKeyId,
      issuedAt: record.issuedAt,
      prev: record.prev,
      subject: record.subject,
      meta: record.meta,
      signature: record.signature,
    };
    const encoded = cbor.encode(recordObj);
    const source = Readable.from([encoded]);
    const manifest = await cas.store({
      source,
      slug: `trust-${record.recordId.slice(0, 12)}`,
      filename: RECORD_BLOB_NAME,
    });
    const treeOid = await cas.createTree({ manifest });

    // Create commit
    const message = `trust: ${record.recordType} ${record.recordId.slice(0, 12)}`;
    const commitSha = await createCommit(this._plumbing, treeOid, parentTipSha, message);

    // CAS ref update with transient retry
    await this._casUpdateRef(ref, commitSha, parentTipSha, graphName);

    return commitSha;
  }

  private async _casUpdateRef(
    ref: string,
    commitSha: string,
    expectedSha: string | null,
    _graphName: string,
  ): Promise<void> {
    for (let attempt = 1; attempt <= MAX_TRANSIENT_CAS_ATTEMPTS; attempt++) {
      try {
        await compareAndSwapRef(this._plumbing, ref, commitSha, expectedSha);
        return;
      } catch {
        // Distinguish transient vs real conflict
        const freshTipSha = await resolveRef(this._plumbing, ref);

        if (freshTipSha === expectedSha) {
          // Transient failure — retry
          if (attempt === MAX_TRANSIENT_CAS_ATTEMPTS) {
            throw new TrustError(
              `Trust CAS exhausted after ${MAX_TRANSIENT_CAS_ATTEMPTS} attempts`,
              { code: 'E_TRUST_CAS_EXHAUSTED' },
            );
          }
          continue;
        }

        // Real conflict — chain advanced
        const freshRecordId = freshTipSha
          ? await this._readRecordIdFromCommit(freshTipSha)
          : null;

        throw new TrustError(
          `Trust CAS conflict: chain advanced from ${String(expectedSha)} to ${String(freshTipSha)}`,
          {
            code: 'E_TRUST_CAS_CONFLICT',
            context: {
              expectedTipSha: expectedSha,
              actualTipSha: freshTipSha,
              actualTipRecordId: freshRecordId,
            },
          },
        );
      }
    }
  }
}
