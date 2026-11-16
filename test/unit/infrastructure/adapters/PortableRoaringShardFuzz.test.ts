import { describe, expect, it } from 'vitest';
import { getRoaringBitmap32 } from '../../../../src/domain/utils/roaring.ts';
import { fuzzPortableShards } from '../../../helpers/PortableRoaringShardFuzzer.ts';

const SEEDS = [0x1087, 0xbad5eed, 0x5eed_0001, 0x7fff_ffff];
const CASES_PER_SEED = 1500;

describe('portable Roaring shard boundary under mutation', () => {
  it.each(SEEDS)('rejects or safely admits every mutated shard from seed %i', (seed) => {
    const summary = fuzzPortableShards(getRoaringBitmap32(), seed, CASES_PER_SEED);
    expect(summary.cases).toBe(CASES_PER_SEED);
    expect(summary.admitted).toBeGreaterThan(0);
    expect(summary.rejections.get('E_ROARING_SHARD_MALFORMED')).toBeGreaterThan(0);
  });
});
