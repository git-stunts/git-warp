import { describe, expect, it } from 'vitest';
import RoaringShardRejectedError from '../../../../src/domain/errors/RoaringShardRejectedError.ts';
import InspectedRoaringShard from '../../../../src/infrastructure/adapters/InspectedRoaringShard.ts';
import inspectPortableRoaringShard from '../../../../src/infrastructure/adapters/PortableRoaringShardInspector.ts';
import RoaringShardBounds from '../../../../src/infrastructure/adapters/RoaringShardBounds.ts';
import { getRoaringBitmap32 } from '../../../../src/domain/utils/roaring.ts';
import {
  encodePortableShard,
  fullRunContainers,
  withUint16,
  withUint32,
  type FixtureContainer,
} from '../../../helpers/PortableRoaringShardFixture.ts';

const STANDARD = RoaringShardBounds.alive();

function rejectionCode(bytes: Uint8Array, bounds = STANDARD): string {
  const inspection = inspectPortableRoaringShard(bytes, bounds);
  if (!(inspection instanceof RoaringShardRejectedError)) {
    throw new Error('expected a rejection');
  }
  return inspection.code;
}

function faultOf(bytes: Uint8Array, bounds = STANDARD): string {
  const inspection = inspectPortableRoaringShard(bytes, bounds);
  if (!(inspection instanceof RoaringShardRejectedError)) {
    throw new Error('expected a rejection');
  }
  return String(inspection.context['fault']);
}

function accepted(bytes: Uint8Array, bounds = STANDARD): InspectedRoaringShard {
  const inspection = inspectPortableRoaringShard(bytes, bounds);
  if (!(inspection instanceof InspectedRoaringShard)) {
    throw inspection;
  }
  return inspection;
}

const ARRAY: FixtureContainer = { kind: 'array', key: 0, values: [1, 2, 3] };
const BITMAP_VALUES = Array.from({ length: 5000 }, (_, index) => index * 2);
const BITMAP: FixtureContainer = { kind: 'bitmap', key: 1, values: BITMAP_VALUES };
const RUN: FixtureContainer = { kind: 'run', key: 2, runs: [[0, 9], [20, 4]] };

describe('inspectPortableRoaringShard: golden shards', () => {
  it('accepts every shape the bitmap library serializes', () => {
    const Bitmap = getRoaringBitmap32();
    const shapes = [
      [],
      [1, 2, 3],
      BITMAP_VALUES,
      [0, 65536 * 3 + 7, 65536 * 9 + 1, 65536 * 12, 65536 * 13 + 5, 4_294_967_295],
    ];
    for (const values of shapes) {
      const bytes = new Bitmap(values).serialize(true);
      expect(accepted(bytes).cardinality).toBe(values.length);
    }
  });

  it('accepts hand-built array, bitmap and run containers with and without offsets', () => {
    expect(accepted(encodePortableShard([ARRAY, BITMAP])).cardinality).toBe(5003);
    expect(accepted(encodePortableShard([ARRAY, RUN])).cardinality).toBe(18);
    const fourWithRun = [ARRAY, BITMAP, RUN, { kind: 'array', key: 9, values: [7] } satisfies FixtureContainer];
    const inspection = accepted(encodePortableShard(fourWithRun));
    expect(inspection.cardinality).toBe(5019);
    expect(inspection.containerCount).toBe(4);
  });

  it('accepts adjacent runs, which carry the same values as one run', () => {
    const adjacent: FixtureContainer = { kind: 'run', key: 0, runs: [[0, 4], [5, 4]] };
    expect(accepted(encodePortableShard([adjacent])).cardinality).toBe(10);
  });
});

describe('inspectPortableRoaringShard: malformed shards', () => {
  it('rejects truncation at every byte boundary of a valid shard', () => {
    const bytes = encodePortableShard([ARRAY, BITMAP, RUN]);
    for (let length = 0; length < bytes.length; length++) {
      expect(rejectionCode(bytes.subarray(0, length))).toBe('E_ROARING_SHARD_MALFORMED');
    }
  });

  it('names the truncated section', () => {
    const plain = encodePortableShard([ARRAY]);
    expect(faultOf(plain.subarray(0, 3))).toBe('truncated-cookie');
    expect(faultOf(plain.subarray(0, 6))).toBe('truncated-count');
    expect(faultOf(plain.subarray(0, 12))).toBe('truncated-headers');
    expect(faultOf(plain.subarray(0, plain.length - 1))).toBe('truncated-container');
    const run = encodePortableShard([RUN]);
    expect(faultOf(run.subarray(0, run.length - 1))).toBe('truncated-container');
    expect(faultOf(run.subarray(0, 9))).toBe('truncated-container');
  });

  it('rejects an unknown cookie and an impossible container count', () => {
    const bytes = encodePortableShard([ARRAY]);
    expect(faultOf(withUint32(bytes, 0, 0xdeadbeef))).toBe('unknown-cookie');
    expect(faultOf(withUint32(bytes, 4, 65537))).toBe('container-count');
  });

  it('rejects container keys that are not strictly increasing', () => {
    const bytes = encodePortableShard([ARRAY, { kind: 'array', key: 4, values: [1] }]);
    expect(faultOf(withUint16(bytes, 12, 0))).toBe('key-order');
  });

  it('rejects a corrupt container header cardinality', () => {
    const bytes = encodePortableShard([ARRAY]);
    expect(faultOf(withUint16(bytes, 10, 3))).toBe('truncated-container');
    const roomy = new Uint8Array([...encodePortableShard([ARRAY]), 0, 0]);
    expect(faultOf(withUint16(roomy, 10, 3))).toBe('array-order');
  });

  it('rejects an offset that does not point at its container', () => {
    const bytes = encodePortableShard([ARRAY]);
    expect(faultOf(withUint32(bytes, 12, 17))).toBe('offset');
  });

  it('rejects array values that are unsorted or repeated', () => {
    const bytes = encodePortableShard([ARRAY]);
    expect(faultOf(withUint16(bytes, 18, 1))).toBe('array-order');
    expect(faultOf(withUint16(bytes, 20, 0))).toBe('array-order');
  });

  it('rejects a bitmap container whose bits disagree with its header', () => {
    const bytes = encodePortableShard([BITMAP]);
    const flipped = Uint8Array.from(bytes);
    flipped[16] = (flipped[16] ?? 0) | 2;
    expect(faultOf(flipped)).toBe('bitmap-cardinality');
  });

  it('rejects runs that overlap, run out of range or disagree with the header', () => {
    const bytes = encodePortableShard([RUN]);
    expect(faultOf(withUint16(bytes, 15, 5))).toBe('run-order');
    expect(faultOf(withUint16(bytes, 15, 0xfffe))).toBe('run-order');
    expect(faultOf(withUint16(bytes, 17, 5))).toBe('run-cardinality');
    expect(faultOf(withUint16(bytes, 9, 0))).toBe('run-cardinality');
  });

  it('rejects trailing bytes', () => {
    const bytes = new Uint8Array([...encodePortableShard([ARRAY]), 0]);
    expect(faultOf(bytes)).toBe('trailing-bytes');
  });
});

describe('inspectPortableRoaringShard: bounds', () => {
  it('accepts a shard of exactly the byte bound and rejects one byte more', () => {
    const bytes = encodePortableShard([ARRAY]);
    const exact = new RoaringShardBounds({ maxBytes: bytes.length, maxCardinality: 3 });
    expect(accepted(bytes, exact).cardinality).toBe(3);
    const below = new RoaringShardBounds({ maxBytes: bytes.length - 1, maxCardinality: 3 });
    expect(rejectionCode(bytes, below)).toBe('E_ROARING_SHARD_TOO_LARGE');
  });

  it('accepts a shard of exactly the cardinality bound and rejects one value more', () => {
    const bytes = encodePortableShard([ARRAY]);
    const exact = new RoaringShardBounds({ maxBytes: 1024, maxCardinality: 3 });
    expect(accepted(bytes, exact).cardinality).toBe(3);
    const below = new RoaringShardBounds({ maxBytes: 1024, maxCardinality: 2 });
    expect(rejectionCode(bytes, below)).toBe('E_ROARING_SHARD_CARDINALITY');
  });

  it('holds the alive cardinality bound at 2^24 values', () => {
    const atBound = encodePortableShard(fullRunContainers(256));
    expect(accepted(atBound).cardinality).toBe(2 ** 24);
    const above = encodePortableShard([
      ...fullRunContainers(256),
      { kind: 'array', key: 256, values: [0] },
    ]);
    expect(rejectionCode(above)).toBe('E_ROARING_SHARD_CARDINALITY');
  });

  it('rejects a cardinality bomb before it reads any container', () => {
    const bomb = encodePortableShard(fullRunContainers(65536));
    const broken = bomb.subarray(0, bomb.length - 1);
    expect(rejectionCode(broken)).toBe('E_ROARING_SHARD_CARDINALITY');
  });

  it('admits every cardinality of the id space under the edge bounds', () => {
    const wholeIdSpace = encodePortableShard(fullRunContainers(65536));
    expect(accepted(wholeIdSpace, RoaringShardBounds.edge()).cardinality).toBe(2 ** 32);
  });

  it.each([
    ['alive', RoaringShardBounds.alive()],
    ['edge', RoaringShardBounds.edge()],
  ])('rejects input above the byte bound of the %s bounds without reading it', (_name, bounds) => {
    const oversized = new Uint8Array(RoaringShardBounds.MAX_BYTES + 1);
    expect(rejectionCode(oversized, bounds)).toBe('E_ROARING_SHARD_TOO_LARGE');
  });

  it('derives the byte bound from an upper bound on the encoding of 2^24 values', () => {
    expect(RoaringShardBounds.MAX_ALIVE_CARDINALITY).toBe(16_777_216);
    expect(RoaringShardBounds.MAX_BYTES).toBe(8 + 8192 + 65536 * 8 + 2 * 16_777_216);
  });

  it('refuses bounds that are not positive safe integers', () => {
    expect(() => new RoaringShardBounds({ maxBytes: 0, maxCardinality: 1 })).toThrow(/maxBytes/u);
    expect(() => new RoaringShardBounds({ maxBytes: 1, maxCardinality: 1.5 })).toThrow(/maxCardinality/u);
  });
});
