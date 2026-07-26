/**
 * Git-backed trust chain adapter.
 *
 * Uses git-cas assets and causal publications for writes, with plumbing
 * restricted to commit-chain traversal.
 *
 * Handles all encoding/decoding at the boundary:
 * - On READ: CBOR decode, recordId hash verification, signaturePayload
 *   precomputation, TrustRecord.fromDecoded()
 * - On WRITE: CBOR encode, stage asset, publish causal commit atomically
 *
 * @module infrastructure/adapters/GitTrustChainAdapter
 */

import TrustChainPort, {
  type TrustChainTip,
  type TrustRecordPublication,
} from '../../ports/TrustChainPort.ts';
import { TrustRecord } from '../../domain/trust/TrustRecord.ts';
import { recordIdPayload, signaturePayload } from '../../domain/trust/canonical.ts';
import { textEncode } from '../../domain/utils/bytes.ts';
import { collectAsyncIterable } from '../../domain/utils/streamUtils.ts';
import { buildTrustRecordRef } from '../../domain/utils/RefLayout.ts';
import TrustError from '../../domain/errors/TrustError.ts';
import WarpStream from '../../domain/stream/WarpStream.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import type {
  AssetCapability,
  CborCodec,
  PublicationCapability,
  PublicationResult,
} from '@git-stunts/git-cas';
import { readGitCasErrorCode } from './GitCasErrorCode.ts';
import { adaptGitCasRetentionWitness } from './GitCasRetentionWitnessAdapter.ts';
import PersistenceError from '../../domain/errors/PersistenceError.ts';
import {
  getExitCode,
  toGitError,
  wrapGitError,
} from './gitErrorClassification.ts';

// -- Constants ----------------------------------------------------------------

const RECORD_BLOB_NAME = 'record.cbor';

// -- Plumbing type (minimal contract) -----------------------------------------

type Plumbing = {
  execute(opts: { args: string[]; input?: string }): Promise<string>;
};

// -- CAS types (minimal contract from git-cas) --------------------------------

type CasStore = {
  readonly assets: Pick<AssetCapability, 'put' | 'adopt' | 'open'>;
  readonly publications: Pick<PublicationCapability, 'commit'>;
};

// -- Adapter deps -------------------------------------------------------------

type GitTrustChainDeps = {
  readonly plumbing: Plumbing;
  readonly crypto: CryptoPort;
  readonly cas: CasStore;
  readonly cbor: CborCodecInstance;
};

// -- Plumbing helpers ---------------------------------------------------------

async function resolveRef(plumbing: Plumbing, ref: string): Promise<string | null> {
  try {
    const sha = await plumbing.execute({ args: ['rev-parse', '--verify', '--quiet', ref] });
    return sha.trim();
  } catch (raw) {
    const error = toGitError(raw);
    if (getExitCode(error) === 1) {
      return null;
    }
    const classified = wrapGitError(error, { ref });
    if (classified instanceof PersistenceError
      && classified.code === PersistenceError.E_REF_NOT_FOUND) {
      return null;
    }
    throw classified;
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

type CborCodecInstance = InstanceType<typeof CborCodec>;

// -- Adapter ------------------------------------------------------------------

export default class GitTrustChainAdapter extends TrustChainPort {
  private readonly _plumbing: Plumbing;
  private readonly _crypto: CryptoPort;
  private readonly _cas: CasStore;
  private readonly _cbor: CborCodecInstance;

  constructor(deps: GitTrustChainDeps) {
    super();
    this._plumbing = deps.plumbing;
    this._crypto = deps.crypto;
    this._cas = deps.cas;
    this._cbor = deps.cbor;
  }

  // -- Port implementation: readTip -------------------------------------------

  async readTip(graphName: string): Promise<TrustChainTip | null> {
    const ref = buildTrustRecordRef(graphName);
    const tipSha = await resolveRef(this._plumbing, ref);
    if (tipSha === null) {
      return null;
    }

    const recordId = await this._readRecordIdFromCommit(tipSha);
    return { tipSha, recordId };
  }

  private async _readRecordIdFromCommit(commitSha: string): Promise<string | null> {
    const info = await readCommitInfo(this._plumbing, commitSha);
    const decoded = this._cbor.decode(
      await this._readAssetTree(info.treeSha),
    ) as Record<string, string>;
    return decoded['recordId'] ?? null;
  }

  // -- Port implementation: readRecords (streaming) ---------------------------

  async *readRecords(graphName: string, tip?: string): AsyncIterable<TrustRecord> {
    const ref = buildTrustRecordRef(graphName);
    let currentSha = tip ?? await resolveRef(this._plumbing, ref);

    if (currentSha === null) {
      return;
    }

    // Walk backward, collecting SHAs for forward iteration
    const commitShas: string[] = [];
    while (currentSha !== null) {
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
    const cbor = this._cbor;

    const rawRecord = cbor.decode(
      await this._readAssetTree(info.treeSha),
    ) as Record<string, string | number | boolean | null | object>;

    // Verify recordId at boundary
    const expectedId = await computeRecordIdHash(rawRecord, this._crypto);
    const actualId = rawRecord['recordId'];
    if (typeof actualId !== 'string' || actualId !== expectedId) {
      throw new TrustError(
        `RecordId mismatch: expected ${expectedId}, got ${JSON.stringify(actualId)}`,
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

  private async _readAssetTree(treeOid: string): Promise<Uint8Array> {
    const staged = await this._cas.assets.adopt({ treeOid });
    return await collectAsyncIterable(this._cas.assets.open({ handle: staged.handle }));
  }

  // -- Port implementation: persistRecord -------------------------------------

  async persistRecord(
    graphName: string,
    record: TrustRecord,
    parentTipSha: string | null,
  ): Promise<TrustRecordPublication> {
    const ref = buildTrustRecordRef(graphName);
    const cas = this._cas;
    const cbor = this._cbor;

    // Encode and stage one immutable trust record asset.
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
    const staged = await cas.assets.put({
      source: WarpStream.from([encoded]),
      slug: `trust-${record.recordId.slice(0, 12)}`,
      filename: RECORD_BLOB_NAME,
    });
    const message = `trust: ${record.recordType} ${record.recordId.slice(0, 12)}`;
    let publication: PublicationResult;
    try {
      publication = await cas.publications.commit({
        root: staged.handle,
        commit: {
          message,
          parents: parentTipSha === null ? [] : [parentTipSha],
        },
        ref: { name: ref, expected: parentTipSha },
      });
    } catch (error) {
      return await this._rethrowPublicationConflict(ref, parentTipSha, error);
    }
    return Object.freeze({
      commitSha: publication.commitId,
      retention: adaptGitCasRetentionWitness(publication.witness.toJSON()),
    });
  }

  private async _rethrowPublicationConflict(
    ref: string,
    expectedSha: string | null,
    error: unknown,
  ): Promise<never> {
    const freshTipSha = await resolveRef(this._plumbing, ref);
    if (freshTipSha === expectedSha && readGitCasErrorCode(error) !== 'PUBLICATION_CONFLICT') {
      throw error;
    }
    const freshRecordId = freshTipSha !== null
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
