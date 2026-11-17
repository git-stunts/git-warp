import { describe, expect, it } from 'vitest';
import { EdgeShard } from '../../../../src/domain/artifacts/EdgeShard.ts';
import IndexError from '../../../../src/domain/errors/IndexError.ts';
import {
  MATERIALIZATION_INDEX_SHARD_LIMITS,
  MAX_MATERIALIZATION_INDEX_SHARDS,
} from '../../../../src/domain/materialization/MaterializationIndexProfile.ts';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import computeShardKey from '../../../../src/domain/utils/shardKey.ts';
import { CborIndexStoreAdapter } from '../../../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import GitCasAssetStorageAdapter from '../../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';
import { encodePortableShard, type FixtureContainer } from '../../../helpers/PortableRoaringShardFixture.ts';

/**
 * #1159 item 2. The checkpoint and session-materialization writer stores an
 * index shard file of up to MATERIALIZATION_INDEX_SHARD_LIMITS.maxBytes
 * (16 MiB), and the default CBOR codec refuses any file above 5 MiB on read
 * (src/infrastructure/codecs/CborCodec.ts). One edge bitmap of 640 array
 * containers of 4,096 values each is 5,248,008 bytes: within the 34,086,920
 * byte bitmap bound, so only the file size is at stake.
 *
 * Oracle: the invariant that #1159 states. A writer either refuses a shard
 * at write time with a typed error, or stores a shard that its reader reads.
 */
const HUB = 'hub';
const PATH = `fwd_${computeShardKey(HUB)}.cbor`;
const READ_LIMIT = 5 * 1024 * 1024;

function sparseHubBitmap(): Uint8Array {
  const values = Array.from({ length: 4_096 }, (_unused, index) => index * 16);
  const containers = Array.from({ length: 640 }, (_unused, key): FixtureContainer => ({ kind: 'array', key, values }));
  return encodePortableShard(containers);
}

function checkpointIndexStore(): CborIndexStoreAdapter {
  const cas = new InMemoryGitCasFacade({ history: new InMemoryGraphAdapter(), storage: new InMemoryBlobStorageAdapter() });
  return new CborIndexStoreAdapter({ codec: defaultCodec, assetStorage: new GitCasAssetStorageAdapter({ cas }), cas });
}

/** Writes one shard with the options of MaterializationIndexRoots, then reads it as LogicalIndexReader does. */
async function writeThenRead(shard: EdgeShard): Promise<string> {
  const store = checkpointIndexStore();
  const written = await store.writeShards(WarpStream.from([shard]), {
    expectedShardCount: 1,
    memberStorage: 'page',
    maxShardCount: MAX_MATERIALIZATION_INDEX_SHARDS,
    maxShardBytes: MATERIALIZATION_INDEX_SHARD_LIMITS.maxBytes,
    structureLimits: MATERIALIZATION_INDEX_SHARD_LIMITS.structureLimits,
  }).catch((error: Error) => error);
  if (written instanceof IndexError) {
    return `refused at write: ${written.code}`;
  }
  if (written instanceof Error) {
    return `failed at write: ${written.name}`;
  }
  return await store.decodeShardAt(written, PATH, MATERIALIZATION_INDEX_SHARD_LIMITS).then(
    () => 'read back',
    (error: Error) => `refused at read: ${'code' in error ? String(error.code) : error.name}`,
  );
}

describe('an index shard file above the default read limit (#1159 item 2)', () => {
  const shard = new EdgeShard({
    shardKey: computeShardKey(HUB),
    direction: 'fwd',
    buckets: { all: { '0': sparseHubBitmap() } },
  });

  it('is encoded above 5 MiB and within the writer maximum', () => {
    const encoded = defaultCodec.encode(shard.buckets).byteLength;

    expect(encoded).toBeGreaterThan(READ_LIMIT);
    expect(encoded).toBeLessThanOrEqual(MATERIALIZATION_INDEX_SHARD_LIMITS.maxBytes);
  });

  // Reproduced, not fixed: the write succeeds and the read refuses with
  // E_CBOR_DECODE_BOUNDS. Either fix design satisfies the expectation.
  it.fails('is refused at write time or read back by the default codec (#1159)', async () => {
    const outcome = await writeThenRead(shard);

    expect(outcome).toMatch(/^(refused at write: E_[A-Z_]+|read back)$/);
  });
});
