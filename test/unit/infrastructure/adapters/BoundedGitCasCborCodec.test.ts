import { CborCodec as GitCasCborCodec } from '@git-stunts/git-cas';
import { describe, expect, it } from 'vitest';

import MessageCodecError from '../../../../src/domain/errors/MessageCodecError.ts';
import BoundedGitCasCborCodec from '../../../../src/infrastructure/adapters/BoundedGitCasCborCodec.ts';
import {
  OUT_OF_BOUNDS_CBOR,
  arraysOfZeros,
  nestedArrays,
} from '../../../helpers/OutOfBoundsCborCorpus.ts';

const gitCasCodec = new GitCasCborCodec();
const codec = new BoundedGitCasCborCodec();

const DIGEST = 'ab'.repeat(32);
const BLOB = '0123456789abcdef0123456789abcdef01234567';

/**
 * Shapes git-cas encodes for git-warp: asset manifests (flat, Merkle, encrypted), bundle root and leaf
 * descriptors (as git-cas 7.2.0 `BundleFanoutBuilder` writes them) and trust records; and one value with
 * non-JSON types.
 */
const WRITTEN_VALUES: ReadonlyArray<readonly [string, object]> = [
  ['a flat asset manifest', {
    version: 1,
    slug: 'patch-1',
    filename: 'patch.cbor',
    size: 524_288,
    chunking: { strategy: 'cdc', params: { targetChunkSize: 262_144 } },
    chunks: [
      { index: 0, size: 262_144, digest: DIGEST, blob: BLOB },
      { index: 1, size: 262_144, digest: DIGEST, blob: BLOB },
    ],
  }],
  ['a Merkle root manifest', {
    version: 2,
    slug: 'large',
    filename: 'large.bin',
    size: 2 ** 40,
    chunks: [],
    subManifests: [{ oid: BLOB, chunkCount: 1_000, startIndex: 0 }],
    manifestHash: DIGEST,
  }],
  ['an encrypted manifest', {
    version: 1,
    slug: 'secret',
    filename: 'secret.bin',
    size: 3,
    chunks: [{ index: 0, size: 19, digest: DIGEST, blob: BLOB }],
    encryption: { algorithm: 'aes-256-gcm', scheme: 'framed', frameBytes: 65_536, encrypted: true },
  }],
  ['a bundle root descriptor', {
    version: 1,
    kind: 'bundle',
    layout: 'fanout-v1',
    codec: 'cbor',
    memberCount: 1,
    index: { entry: 'index', depth: 1, firstPath: 'patch', lastPath: 'patch' },
    limits: {
      maxMembers: 100_000,
      maxMemberPathBytes: 512,
      maxDescriptorBytes: 64 * 1024 * 1024,
      maxFanoutEntries: 1024,
      maxFanoutDepth: 8,
    },
  }],
  ['a bundle leaf descriptor', {
    version: 1,
    kind: 'leaf',
    depth: 1,
    count: 1,
    firstPath: 'patch',
    lastPath: 'patch',
    entries: [{ path: 'patch', slot: 'slot-000000', handle: `asset:cbor:${BLOB}`, type: 'tree', size: null }],
  }],
  ['a value with bytes, dates and big integers (not a git-cas shape)', {
    bytes: Uint8Array.from([1, 2, 3]),
    observedAt: new Date(0),
    count: 2n ** 64n,
    ratio: 0.1,
  }],
  ['a trust record', {
    schemaVersion: 1,
    recordType: 'KEY_ADD',
    recordId: DIGEST,
    issuerKeyId: 'ed25519:abc',
    issuedAt: '2026-11-11T00:00:00.000Z',
    prev: null,
    subject: { keyId: 'ed25519:abc', publicKey: 'AAAA' },
    meta: { note: 'n', flag: true, weight: -1.5 },
    signature: { alg: 'ed25519', sig: 'c2ln' },
  }],
];

function refusal(bytes: Uint8Array): MessageCodecError {
  try {
    codec.decode(bytes);
  } catch (error) {
    if (error instanceof MessageCodecError) {
      return error;
    }
    throw error;
  }
  throw new Error('expected the bounded codec to refuse the payload');
}

describe('BoundedGitCasCborCodec', () => {
  it.each(OUT_OF_BOUNDS_CBOR)('refuses $name that git-cas decodes unbounded', ({ bytes, reason }) => {
    expect(gitCasCodec.decode(bytes)).toBeDefined();

    const error = refusal(bytes);

    expect(error.code).toBe('E_CBOR_DECODE_BOUNDS');
    expect(error.context).toEqual({ reason });
  });

  it('refuses before cbor-x reads the blob', () => {
    const deepAndTruncated = nestedArrays(40).subarray(0, 40);
    expect(() => gitCasCodec.decode(deepAndTruncated)).toThrow('Unexpected end of CBOR data');

    expect(refusal(deepAndTruncated).context).toEqual({ reason: 'nesting depth exceeds the configured maximum' });
  });

  it('admits values at the depth and item limits', () => {
    for (const bytes of [nestedArrays(32), arraysOfZeros(1_000_000)]) {
      expect(codec.decode(bytes)).toEqual(gitCasCodec.decode(bytes));
    }
  });

  it.each(WRITTEN_VALUES)('encodes %s to the same bytes as git-cas and decodes them back', (_name, value) => {
    const bytes = codec.encode(value);

    expect(bytes).toEqual(gitCasCodec.encode(value));
    expect(codec.decode(bytes)).toEqual(gitCasCodec.decode(bytes));
  });

  it('names the manifest extension git-cas names', () => {
    expect(codec.extension).toBe(gitCasCodec.extension);
    expect(codec.extension).toBe('cbor');
    expect(Object.isFrozen(codec)).toBe(true);
  });
});
