import {
  AssetHandle,
  type AssetCapability,
  CborCodec,
  type CodecPort as GitCasCodecPort,
  RetentionWitness,
  StagedAsset,
} from '@git-stunts/git-cas';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TrustError from '../../../../src/domain/errors/TrustError.ts';
import { TrustRecord } from '../../../../src/domain/trust/TrustRecord.ts';
import GitTrustChainAdapter from '../../../../src/infrastructure/adapters/GitTrustChainAdapter.ts';
import CryptoPort from '../../../../src/ports/CryptoPort.ts';
import TrustChainPort from '../../../../src/ports/TrustChainPort.ts';
import { arraysOfZeros, nestedArrays, OUT_OF_BOUNDS_CBOR } from '../../../helpers/OutOfBoundsCborCorpus.ts';

const GRAPH = 'test-graph';
const TIP = 'a'.repeat(40);
const PARENT = 'b'.repeat(40);
const TREE = 'c'.repeat(40);
const HANDLE = new AssetHandle({ codec: 'raw', oid: TREE });
const OBSERVED_AT = '2026-01-01T00:00:00.000Z';
const codec = new CborCodec();

const recordObject = {
  schemaVersion: 1,
  recordType: 'KEY_ADD',
  recordId: 'expected-record-id-hash',
  issuerKeyId: 'key-1',
  issuedAt: OBSERVED_AT,
  prev: null,
  subject: { keyId: 'key-subject-1', publicKey: 'pubkey-1' },
  meta: { note: 'test' },
  signature: { alg: 'ed25519', sig: 'sig-1' },
};

class TestCrypto extends CryptoPort {
  hash(): Promise<string> { return Promise.resolve('expected-record-id-hash'); }
  hmac(): Promise<Uint8Array> { return Promise.resolve(new Uint8Array()); }
  timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean { return left.length === right.length; }
}

function stagedAsset(handle = HANDLE): StagedAsset {
  return new StagedAsset({
    handle,
    slug: 'trust-record',
    filename: 'record.cbor',
    size: codec.encode(recordObject).byteLength,
    observedAt: OBSERVED_AT,
  });
}

function retention(commitId: string): RetentionWitness {
  return new RetentionWitness({
    handle: HANDLE,
    policy: 'pinned',
    reachability: 'anchored',
    root: {
      kind: 'publication',
      namespace: GRAPH,
      ref: `refs/warp/${GRAPH}/trust/records`,
      generation: commitId,
      path: '/',
    },
    observedAt: OBSERVED_AT,
  });
}

function bytes(source: Uint8Array): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      yield source;
    },
  };
}

function createCas() {
  const assets = {
    put: vi.fn(async (_request: Parameters<AssetCapability['put']>[0]) => stagedAsset()),
    adopt: vi.fn(async (_request: Parameters<AssetCapability['adopt']>[0]) => stagedAsset()),
    open: vi.fn((_request: Parameters<AssetCapability['open']>[0]) =>
      bytes(codec.encode(recordObject))),
  };
  const publications = {
    commit: vi.fn(async () => ({
      operation: 'publication' as const,
      commitId: TIP,
      ref: `refs/warp/${GRAPH}/trust/records`,
      root: HANDLE,
      witness: retention(TIP),
    })),
  };
  return { assets, publications };
}

function sampleRecord(): TrustRecord {
  return TrustRecord.fromDecoded({
    ...recordObject,
    signaturePayload: new Uint8Array([1, 2, 3]),
  });
}

function createPlumbing() {
  return {
    execute: vi.fn(async (_options: { args: string[]; input?: string }): Promise<string> => ''),
  };
}

/** The read bound on encoded size: `MAX_CBOR_DECODE_BYTES` in src/infrastructure/codecs/CborCodec.ts (#1186). */
const MAX_RECORD_BYTES = 5 * 1024 * 1024;
/** A CBOR text of 65,536 or more bytes has a five-byte header, so each further character adds one byte. */
const LONG_NOTE_LENGTH = 65_536;
const OUT_OF_BOUNDS_CODE = 'E_TRUST_RECORD_OUT_OF_BOUNDS';

/** Encodings at the read bounds that the bounded reader admits (#1186). */
const AT_BOUND_CBOR = [
  { name: 'nesting depth 32', bytes: nestedArrays(32) },
  { name: 'exactly 1,000,000 items', bytes: arraysOfZeros(1_000_000) },
  { name: 'the allowed epoch tag 1', bytes: Uint8Array.from([0xc1, 0x00]) },
];

/** A codec fake whose `encode` returns fixed bytes, so a test can give the adapter any encoding. */
class FixedEncodingCodec implements GitCasCodecPort {
  readonly #bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
  }

  encode(): Uint8Array {
    return this.#bytes;
  }

  decode(buffer: Uint8Array): object {
    return codec.decode(buffer);
  }

  get extension(): string {
    return codec.extension;
  }
}

/** A record whose git-cas CBOR encoding is `byteLength` bytes long, padded through `meta.note`. */
function recordEncodedAs(byteLength: number): TrustRecord {
  const longNote = 'x'.repeat(LONG_NOTE_LENGTH);
  const overhead = codec.encode({ ...recordObject, meta: { note: longNote } }).byteLength - LONG_NOTE_LENGTH;
  return TrustRecord.fromDecoded({
    ...recordObject,
    meta: { note: 'x'.repeat(byteLength - overhead) },
    signaturePayload: new Uint8Array([1, 2, 3]),
  });
}

describe('GitTrustChainAdapter high-level CAS boundary', () => {
  let plumbing: ReturnType<typeof createPlumbing>;
  let cas: ReturnType<typeof createCas>;
  let adapter: GitTrustChainAdapter;

  beforeEach(() => {
    plumbing = createPlumbing();
    cas = createCas();
    adapter = new GitTrustChainAdapter({
      plumbing,
      crypto: new TestCrypto(),
      cas,
      cbor: codec,
    });
  });

  it('implements TrustChainPort and returns null for a missing trust ref', async () => {
    expect(adapter).toBeInstanceOf(TrustChainPort);
    plumbing.execute.mockRejectedValueOnce(missingRefError());
    await expect(adapter.readTip(GRAPH)).resolves.toBeNull();
  });

  it('propagates rev-parse failures that are not missing refs', async () => {
    const unavailable = new Error('repository unavailable');
    plumbing.execute.mockRejectedValueOnce(unavailable);
    await expect(adapter.readTip(GRAPH)).rejects.toBe(unavailable);

    plumbing.execute.mockRejectedValueOnce(unavailable);
    const read = async (): Promise<void> => {
      for await (const _record of adapter.readRecords(GRAPH)) {
        // No record may be yielded when ref resolution fails.
      }
    };
    await expect(read()).rejects.toBe(unavailable);
  });

  it('reads a tip record by adopting and opening its asset tree', async () => {
    plumbing.execute.mockImplementation(async ({ args }: { args: string[] }) => {
      if (args[0] === 'rev-parse') return TIP;
      if (args[0] === 'cat-file') return `tree ${TREE}\nparent ${PARENT}\n\nmessage`;
      return '';
    });

    await expect(adapter.readTip(GRAPH)).resolves.toEqual({
      tipSha: TIP,
      recordId: 'expected-record-id-hash',
    });
    expect(cas.assets.adopt).toHaveBeenCalledWith({ treeOid: TREE });
    expect(cas.assets.open).toHaveBeenCalledWith({ handle: HANDLE });
  });

  it('streams records oldest-first through asset handles', async () => {
    const oldest = '1'.repeat(40);
    const newest = '2'.repeat(40);
    const oldestTree = '3'.repeat(40);
    const newestTree = '4'.repeat(40);
    const oldestHandle = new AssetHandle({ codec: 'raw', oid: oldestTree });
    const newestHandle = new AssetHandle({ codec: 'raw', oid: newestTree });
    plumbing.execute.mockImplementation(async ({ args }: { args: string[] }) => {
      if (args[0] === 'rev-parse') return newest;
      if (args[0] === 'cat-file' && args[2] === newest) return `tree ${newestTree}\nparent ${oldest}\n\nmessage`;
      if (args[0] === 'cat-file' && args[2] === oldest) return `tree ${oldestTree}\n\nmessage`;
      return '';
    });
    cas.assets.adopt.mockImplementation(async ({ treeOid }) =>
      stagedAsset(treeOid === oldestTree ? oldestHandle : newestHandle));
    cas.assets.open.mockImplementation(({ handle }) => {
      const parsed = AssetHandle.from(handle);
      const isOldest = parsed.oid === oldestTree;
      return bytes(codec.encode({
        ...recordObject,
        issuedAt: isOldest ? '2026-01-01T00:00:00.000Z' : '2026-01-02T00:00:00.000Z',
      }));
    });

    const records: TrustRecord[] = [];
    for await (const record of adapter.readRecords(GRAPH)) {
      records.push(record);
    }
    expect(records.map((record) => record.issuedAt)).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
    ]);
  });

  it('stages and causally publishes a trust record with retention evidence', async () => {
    const result = await adapter.persistRecord(GRAPH, sampleRecord(), PARENT);

    expect(cas.assets.put).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'trust-expected-rec',
      filename: 'record.cbor',
      source: expect.anything(),
    }));
    expect(cas.publications.commit).toHaveBeenCalledWith({
      root: HANDLE,
      commit: {
        message: 'trust: KEY_ADD expected-rec',
        parents: [PARENT],
      },
      ref: {
        name: `refs/warp/${GRAPH}/trust/records`,
        expected: PARENT,
      },
    });
    expect(result).toMatchObject({
      commitSha: TIP,
      retention: { policy: 'pinned', reachability: 'anchored' },
    });
  });

  it('preserves current-asset failures instead of misclassifying them as legacy', async () => {
    plumbing.execute.mockImplementation(async ({ args }: { args: string[] }) => {
      if (args[0] === 'rev-parse') return TIP;
      if (args[0] === 'cat-file') return `tree ${TREE}\n\nmessage`;
      return '';
    });
    const corruption = new Error('current asset is corrupt');
    cas.assets.open.mockImplementation(() => {
      throw corruption;
    });

    await expect(adapter.readTip(GRAPH)).rejects.toBe(corruption);
  });

  it('preserves missing current asset manifests', async () => {
    const missingManifest = Object.assign(
      new Error('asset manifest not found'),
      { code: 'MANIFEST_NOT_FOUND' },
    );
    cas.assets.adopt.mockRejectedValue(missingManifest);
    plumbing.execute.mockImplementation(async ({ args }: { args: string[] }) => {
      if (args[0] === 'rev-parse') return TIP;
      if (args[0] === 'cat-file' && args[1] === '-p') return `tree ${TREE}\n\nmessage`;
      return '';
    });

    await expect(adapter.readTip(GRAPH)).rejects.toBe(missingManifest);
  });

  it('rejects tampered record IDs and yields no records for a missing ref', async () => {
    plumbing.execute.mockRejectedValueOnce(missingRefError());
    const records: TrustRecord[] = [];
    for await (const record of adapter.readRecords(GRAPH)) {
      records.push(record);
    }
    expect(records).toEqual([]);

    const tampered = { ...recordObject, recordId: 'tampered' };
    cas.assets.open.mockImplementation(() => bytes(codec.encode(tampered)));
    plumbing.execute.mockImplementation(async ({ args }: { args: string[] }) => {
      if (args[0] === 'cat-file') return `tree ${TREE}\n\nmessage`;
      return '';
    });
    const read = async (): Promise<void> => {
      for await (const _record of adapter.readRecords(GRAPH, TIP)) {
        // The adapter must reject before yielding a tampered record.
      }
    };
    await expect(read()).rejects.toMatchObject({ code: 'E_TRUST_RECORD_ID_MISMATCH' });
  });

  it('preserves publication errors that are not ref conflicts', async () => {
    const upstream = new Error('object write failed');
    cas.publications.commit.mockRejectedValueOnce(upstream);
    plumbing.execute.mockImplementation(async ({ args }: { args: string[] }) => {
      if (args[0] === 'rev-parse') return PARENT;
      return '';
    });

    await expect(adapter.persistRecord(GRAPH, sampleRecord(), PARENT)).rejects.toBe(upstream);
  });

  it('maps publication races to a trust-specific CAS conflict', async () => {
    cas.publications.commit.mockRejectedValueOnce(
      Object.assign(new Error('conflict'), { code: 'PUBLICATION_CONFLICT' }),
    );
    plumbing.execute.mockImplementation(async ({ args }: { args: string[] }) => {
      if (args[0] === 'rev-parse') return TIP;
      if (args[0] === 'cat-file') return `tree ${TREE}\n\nmessage`;
      return '';
    });

    await expect(adapter.persistRecord(GRAPH, sampleRecord(), PARENT))
      .rejects.toBeInstanceOf(TrustError);
    await expect(adapter.persistRecord(GRAPH, sampleRecord(), PARENT))
      .resolves.toMatchObject({ commitSha: TIP });
  });
});

describe('GitTrustChainAdapter write bounds (#1188)', () => {
  let plumbing: ReturnType<typeof createPlumbing>;
  let cas: ReturnType<typeof createCas>;

  beforeEach(() => {
    plumbing = createPlumbing();
    cas = createCas();
  });

  function adapterWith(cbor: GitCasCodecPort): GitTrustChainAdapter {
    return new GitTrustChainAdapter({ plumbing, crypto: new TestCrypto(), cas, cbor });
  }

  it('refuses a record one byte over 5 MiB before it stages an asset or moves the ref', async () => {
    const write = adapterWith(codec).persistRecord(GRAPH, recordEncodedAs(MAX_RECORD_BYTES + 1), PARENT);

    await expect(write).rejects.toBeInstanceOf(TrustError);
    // Oracle: the size refusal reason of requireBoundedCbor, which the bounded reader reports.
    await expect(write).rejects.toMatchObject({
      code: OUT_OF_BOUNDS_CODE,
      context: {
        recordId: recordObject.recordId,
        reason: `encoded byte length ${String(MAX_RECORD_BYTES + 1)} exceeds ${String(MAX_RECORD_BYTES)}`,
      },
    });
    expect(cas.assets.put).not.toHaveBeenCalled();
    expect(cas.publications.commit).not.toHaveBeenCalled();
  });

  it('writes a record of exactly 5 MiB', async () => {
    const staged: Uint8Array[] = [];
    cas.assets.put.mockImplementationOnce(async ({ source }) => {
      for await (const part of source) {
        staged.push(part);
      }
      return stagedAsset();
    });

    await adapterWith(codec).persistRecord(GRAPH, recordEncodedAs(MAX_RECORD_BYTES), PARENT);

    expect(staged.reduce((total, part) => total + part.byteLength, 0)).toBe(MAX_RECORD_BYTES);
    expect(cas.publications.commit).toHaveBeenCalledOnce();
  });

  // Oracle: OUT_OF_BOUNDS_CBOR is the corpus that the bounded reader refuses, with these reasons,
  // in BoundedGitCasCborCodec.test.ts and GitCasCborBounds.integration.test.ts.
  it.each(OUT_OF_BOUNDS_CBOR)('refuses a record that encodes to $name, as the bounded reader does', async ({ bytes, reason }) => {
    const write = adapterWith(new FixedEncodingCodec(bytes)).persistRecord(GRAPH, sampleRecord(), PARENT);

    await expect(write).rejects.toBeInstanceOf(TrustError);
    await expect(write).rejects.toMatchObject({
      code: OUT_OF_BOUNDS_CODE,
      context: { recordId: recordObject.recordId, reason },
    });
    expect(cas.assets.put).not.toHaveBeenCalled();
    expect(cas.publications.commit).not.toHaveBeenCalled();
  });

  it.each(AT_BOUND_CBOR)('writes a record that encodes to $name', async ({ bytes }) => {
    const write = adapterWith(new FixedEncodingCodec(bytes)).persistRecord(GRAPH, sampleRecord(), PARENT);

    await expect(write).resolves.toMatchObject({ commitSha: TIP });
    expect(cas.publications.commit).toHaveBeenCalledOnce();
  });
});

function missingRefError(): Error & { readonly exitCode: number } {
  return Object.assign(new Error('missing ref'), { exitCode: 1 });
}
