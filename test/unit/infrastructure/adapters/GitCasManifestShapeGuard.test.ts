import { CborCodec as GitCasCborCodec } from '@git-stunts/git-cas';
import { describe, expect, it } from 'vitest';

import MessageCodecError from '../../../../src/domain/errors/MessageCodecError.ts';
import BoundedGitCasCborCodec from '../../../../src/infrastructure/adapters/BoundedGitCasCborCodec.ts';

/** git-cas `ManifestSchema` admits at most this many sub-manifest references. */
const MAX_REFERENCES = 10_000;
/** git-cas writes at most this many chunks into one sub-manifest (its default `merkleThreshold`). */
const MAX_REFERENCE_CHUNKS = 1_000;
/** The total chunk limit git-warp sets for one Merkle asset. */
const MAX_TOTAL_CHUNKS = 1_048_576;

const gitCasCodec = new GitCasCborCodec();
const codec = new BoundedGitCasCborCodec();
const DIGEST = 'ab'.repeat(32);

type Reference = { readonly oid: string; readonly chunkCount: number; readonly startIndex: number };

/** A distinct lowercase 40-hex object id for each position. */
function objectId(position: number): string {
  return position.toString(16).padStart(40, '0');
}

/** Contiguous references with distinct object ids and the given chunk counts. */
function contiguous(chunkCounts: readonly number[]): Reference[] {
  let startIndex = 0;
  return chunkCounts.map((chunkCount, position) => {
    const reference = { oid: objectId(position + 1), chunkCount, startIndex };
    startIndex += chunkCount;
    return reference;
  });
}

function rootManifest(subManifests: object): Uint8Array {
  return gitCasCodec.encode({
    version: 2,
    slug: 'asset',
    filename: 'asset.bin',
    size: 1,
    chunks: [],
    subManifests,
    manifestHash: DIGEST,
  });
}

function refusal(bytes: Uint8Array): MessageCodecError {
  try {
    codec.decode(bytes);
  } catch (error) {
    if (error instanceof MessageCodecError) {
      return error;
    }
    throw error;
  }
  throw new Error('expected the bounded codec to refuse the root manifest');
}

const REFUSED: ReadonlyArray<readonly [string, object, string]> = [
  ['more references than git-cas admits',
    contiguous(Array.from({ length: MAX_REFERENCES + 1 }, () => 1)),
    'sub-manifest reference count exceeds the maximum'],
  ['a repeated object id with contiguous ranges',
    contiguous(Array.from({ length: 20 }, () => MAX_REFERENCE_CHUNKS)).map((reference) => ({ ...reference, oid: objectId(1) })),
    'a sub-manifest reference repeats an object id'],
  ['a gap between ranges',
    [{ oid: objectId(1), chunkCount: 10, startIndex: 0 }, { oid: objectId(2), chunkCount: 10, startIndex: 11 }],
    'sub-manifest references do not cover the chunks contiguously from zero'],
  ['overlapping ranges',
    [{ oid: objectId(1), chunkCount: 10, startIndex: 0 }, { oid: objectId(2), chunkCount: 10, startIndex: 5 }],
    'sub-manifest references do not cover the chunks contiguously from zero'],
  ['a first range that does not start at zero',
    [{ oid: objectId(1), chunkCount: 10, startIndex: 1 }],
    'sub-manifest references do not cover the chunks contiguously from zero'],
  ['more chunks in total than the asset limit',
    contiguous(Array.from({ length: MAX_TOTAL_CHUNKS / MAX_REFERENCE_CHUNKS + 1 }, () => MAX_REFERENCE_CHUNKS)),
    'total chunk count exceeds the maximum'],
  ['more chunks in one reference than git-cas writes',
    contiguous([MAX_REFERENCE_CHUNKS + 1]),
    'a sub-manifest reference declares more chunks than the maximum'],
  ['a reference list that is not an array',
    { 0: { oid: objectId(1), chunkCount: 1, startIndex: 0 } },
    'sub-manifest references are not an array'],
  ['a reference that is not a map', [objectId(1)], 'a sub-manifest reference is malformed'],
  ['an upper-case object id', [{ oid: objectId(10).toUpperCase(), chunkCount: 1, startIndex: 0 }],
    'a sub-manifest reference is malformed'],
  ['a zero chunk count', [{ oid: objectId(1), chunkCount: 0, startIndex: 0 }], 'a sub-manifest reference is malformed'],
  ['a fractional chunk count', [{ oid: objectId(1), chunkCount: 1.5, startIndex: 0 }],
    'a sub-manifest reference is malformed'],
  ['a missing start index', [{ oid: objectId(1), chunkCount: 1 }], 'a sub-manifest reference is malformed'],
];

const ADMITTED: ReadonlyArray<readonly [string, object]> = [
  ['the most references git-cas admits', contiguous(Array.from({ length: MAX_REFERENCES }, () => 1))],
  ['exactly the total chunk limit', contiguous([
    ...Array.from({ length: Math.floor(MAX_TOTAL_CHUNKS / MAX_REFERENCE_CHUNKS) }, () => MAX_REFERENCE_CHUNKS),
    MAX_TOTAL_CHUNKS % MAX_REFERENCE_CHUNKS,
  ])],
  ['the ranges git-cas writes for 2,500 chunks', contiguous([MAX_REFERENCE_CHUNKS, MAX_REFERENCE_CHUNKS, 500])],
  ['a 64-hex object id', [{ oid: 'c'.repeat(64), chunkCount: 1, startIndex: 0 }]],
  ['no references', []],
];

describe('BoundedGitCasCborCodec Merkle root manifest shape', () => {
  it.each(REFUSED)('refuses a root manifest with %s', (_name, subManifests, reason) => {
    const bytes = rootManifest(subManifests);
    expect(gitCasCodec.decode(bytes)).toBeDefined();

    const error = refusal(bytes);

    expect(error.code).toBe('E_CAS_MANIFEST_SHAPE');
    expect(error.context).toEqual({ reason });
  });

  it.each(ADMITTED)('admits a root manifest with %s', (_name, subManifests) => {
    const bytes = rootManifest(subManifests);

    expect(codec.decode(bytes)).toEqual(gitCasCodec.decode(bytes));
  });

  it.each([
    ['a flat manifest', gitCasCodec.encode({
      version: 1,
      chunks: [],
      subManifests: [{ oid: objectId(1), chunkCount: 1, startIndex: 5 }],
    })],
    ['a root manifest without references', gitCasCodec.encode({ version: 2, chunks: [] })],
    ['a root manifest with null references', gitCasCodec.encode({ version: 2, chunks: [], subManifests: null })],
    ['a list', gitCasCodec.encode([{ version: 2, subManifests: 'not checked' }])],
    ['a number', Uint8Array.of(0x07)],
  ])('leaves %s, which git-cas does not resolve, unchanged', (_name, bytes) => {
    expect(codec.decode(bytes)).toEqual(gitCasCodec.decode(bytes));
  });
});
