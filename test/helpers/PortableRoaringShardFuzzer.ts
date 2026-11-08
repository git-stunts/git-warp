/**
 * Seeded mutation fuzzer for the portable Roaring shard boundary.
 *
 * Each case mutates a valid shard and hands it to the bounded constructor.
 * The boundary must either reject it with RoaringShardRejectedError, or admit
 * a bitmap that every later operation can use without a fault.
 */
import RoaringShardRejectedError from '../../src/domain/errors/RoaringShardRejectedError.ts';
import type { RoaringBitmap32Constructor, RoaringBitmapSubset } from '../../src/domain/utils/roaring.ts';
import { createRng } from './seededRng.ts';
import { encodePortableShard, type FixtureContainer } from './PortableRoaringShardFixture.ts';

type Rng = ReturnType<typeof createRng>;

export type FuzzSummary = {
  readonly cases: number;
  readonly admitted: number;
  readonly rejections: ReadonlyMap<string, number>;
};

function randomValues(rng: Rng, count: number, span: number): number[] {
  const values = new Set<number>();
  while (values.size < count) {
    values.add(rng.nextInt(0, span));
  }
  return [...values].sort((left, right) => left - right);
}

function seedShards(rng: Rng, Bitmap: RoaringBitmap32Constructor): Uint8Array[] {
  const runs: FixtureContainer[] = [
    { kind: 'array', key: 0, values: [5, 9, 11] },
    { kind: 'run', key: 3, runs: [[0, 99], [200, 10]] },
    { kind: 'bitmap', key: 4, values: randomValues(rng, 4500, 65536) },
    { kind: 'run', key: 7, runs: [[1, 0], [65000, 535]] },
  ];
  return [
    new Bitmap().serialize(true),
    new Bitmap(randomValues(rng, 40, 2 ** 32)).serialize(true),
    new Bitmap(randomValues(rng, 6000, 65536)).serialize(true),
    encodePortableShard(runs),
    encodePortableShard(runs.slice(1, 2)),
  ];
}

function mutate(rng: Rng, source: Uint8Array): Uint8Array {
  const bytes = Uint8Array.from(source);
  const at = rng.nextInt(0, Math.max(bytes.length, 1));
  switch (rng.nextInt(0, 5)) {
    case 0:
      bytes[at] = (bytes[at] ?? 0) ^ (1 << rng.nextInt(0, 8));
      return bytes;
    case 1:
      bytes[at] = rng.nextInt(0, 256);
      return bytes;
    case 2:
      return bytes.subarray(0, at);
    case 3:
      return new Uint8Array([...bytes, ...randomValues(rng, rng.nextInt(1, 5), 256)]);
    default:
      bytes[at] = 0xff;
      bytes[at + 1] = 0xff;
      return bytes;
  }
}

function exercise(bitmap: RoaringBitmapSubset, Bitmap: RoaringBitmap32Constructor): void {
  const values = bitmap.toArray();
  values.forEach((value, index) => {
    if (index > 0 && value <= (values[index - 1] ?? -1)) {
      throw new Error(`admitted bitmap is not ordered at index ${String(index)}`);
    }
  });
  if (values.length !== bitmap.size) {
    throw new Error('admitted bitmap size disagrees with its values');
  }
  const first = values[0];
  if (first !== undefined && (!bitmap.has(first) || bitmap.rank(first) !== 1 || bitmap.at(0) !== first)) {
    throw new Error('admitted bitmap disagrees with its own lookups');
  }
  const copy = Bitmap.deserialize(bitmap.serialize(true), true);
  copy.orInPlace(bitmap);
  if (copy.size !== bitmap.size) {
    throw new Error('admitted bitmap does not round-trip');
  }
}

function admit(bytes: Uint8Array, Bitmap: RoaringBitmap32Constructor): string | null {
  try {
    exercise(Bitmap.deserialize(bytes, true), Bitmap);
    return null;
  } catch (error) {
    if (error instanceof RoaringShardRejectedError) {
      return error.code;
    }
    throw error;
  }
}

/** Runs `cases` mutations from `seed`; throws on the first boundary gap. */
export function fuzzPortableShards(Bitmap: RoaringBitmap32Constructor, seed: number, cases: number): FuzzSummary {
  const rng = createRng(seed);
  const shards = seedShards(rng, Bitmap);
  const rejections = new Map<string, number>();
  let admitted = 0;
  for (let index = 0; index < cases; index++) {
    const bytes = mutate(rng, rng.pick(shards));
    const code = admit(bytes, Bitmap);
    if (code === null) {
      admitted++;
    } else {
      rejections.set(code, (rejections.get(code) ?? 0) + 1);
    }
  }
  return { cases, admitted, rejections };
}
