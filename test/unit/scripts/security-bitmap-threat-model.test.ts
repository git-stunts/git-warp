import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import RoaringShardRejectedError from '../../../src/domain/errors/RoaringShardRejectedError.ts';
import { getRoaringBitmap32 } from '../../../src/domain/utils/roaring.ts';
import PackedArtifactBoundaryAdapter from '../../../src/infrastructure/adapters/PackedArtifactBoundaryAdapter.ts';
import RoaringShardBounds from '../../../src/infrastructure/adapters/RoaringShardBounds.ts';
import {
  encodePortableShard,
  fullRunContainers,
  withUint16,
  withUint32,
} from '../../helpers/PortableRoaringShardFixture.ts';

it('documents bitmap input provenance honestly', () => {
  const document = readFileSync('.github/SECURITY.md', 'utf8');
  const bitmapRows = document.split('\n').filter((line) => line.startsWith('| `roaring-wasm`'));
  expect(bitmapRows).toHaveLength(2);
  for (const row of bitmapRows) {
    expect(row).not.toContain('No network-facing input');
    expect(row).not.toContain('no untrusted input');
    expect(row).toContain('peer-controlled');
  }
});

it('keeps the dependency risk inventory aligned with direct production dependencies', () => {
  const { dependencies } = new PackedArtifactBoundaryAdapter().read(
    'package.json', z.object({ dependencies: z.record(z.string(), z.string()) })
  );
  const document = readFileSync('.github/SECURITY.md', 'utf8');
  const table = document.split('## Dependency Risk Assessment')[1]?.split('## Accepted Risks')[0] ?? '';
  const packages = [...table.matchAll(/^\| `([^`]+)` \|/gmu)].map((match) => match[1]);
  expect(packages.sort()).toEqual(Object.keys(dependencies).sort());
});

describe('peer-controlled bitmap shards meet the boundary before the bitmap library', () => {
  const Bitmap = getRoaringBitmap32();
  const golden = new Bitmap([1, 2, 3, 70_000, 4_000_000_000]).serialize(true);

  function rejection(bytes: Uint8Array): RoaringShardRejectedError {
    try {
      Bitmap.deserialize(bytes, true);
    } catch (error) {
      if (error instanceof RoaringShardRejectedError) {
        return error;
      }
      throw error;
    }
    throw new Error('the shard was admitted');
  }

  it('round-trips a valid shard', () => {
    const bitmap = Bitmap.deserialize(golden, true);
    expect(bitmap.toArray()).toEqual([1, 2, 3, 70_000, 4_000_000_000]);
    expect(bitmap.serialize(true)).toEqual(golden);
  });

  it.each([
    ['a truncated shard', golden.subarray(0, golden.length - 1), 'truncated-container'],
    ['a corrupt container header', withUint16(golden, 10, 9), 'truncated-container'],
    ['a container key out of order', withUint16(golden, 12, 0), 'key-order'],
    ['an offset that skips its container', withUint32(golden, 24, 0), 'offset'],
    ['unsorted array values', withUint16(golden, 34, 9), 'array-order'],
    ['trailing bytes', new Uint8Array([...golden, 0]), 'trailing-bytes'],
    ['an unknown cookie', withUint32(golden, 0, 1), 'unknown-cookie'],
  ])('rejects %s as malformed', (_name, bytes, fault) => {
    const error = rejection(bytes);
    expect(error.code).toBe('E_ROARING_SHARD_MALFORMED');
    expect(error.context['fault']).toBe(fault);
  });

  function aliveRejection(bytes: Uint8Array): RoaringShardRejectedError {
    try {
      Bitmap.deserializeAlive(bytes);
    } catch (error) {
      if (error instanceof RoaringShardRejectedError) {
        return error;
      }
      throw error;
    }
    throw new Error('the alive bitmap was admitted');
  }

  it('admits an alive bitmap that holds exactly the id space of one meta shard', () => {
    const atBound = encodePortableShard(fullRunContainers(256));
    expect(Bitmap.deserializeAlive(atBound).size).toBe(RoaringShardBounds.MAX_ALIVE_CARDINALITY);
  });

  it('rejects a hand-built alive bitmap one value above the id space of one meta shard', () => {
    const oneAbove = encodePortableShard([
      ...fullRunContainers(256),
      { kind: 'array', key: 256, values: [0] },
    ]);
    const error = aliveRejection(oneAbove);
    expect(error.code).toBe('E_ROARING_SHARD_CARDINALITY');
    expect(error.context).toEqual({
      cardinality: RoaringShardBounds.MAX_ALIVE_CARDINALITY + 1,
      maxCardinality: RoaringShardBounds.MAX_ALIVE_CARDINALITY,
    });
  });

  it('rejects an alive bitmap that declares the whole id space, although its last byte is missing', () => {
    const bomb = encodePortableShard(fullRunContainers(65536));
    expect(aliveRejection(bomb.subarray(0, bomb.length - 1)).code).toBe('E_ROARING_SHARD_CARDINALITY');
  });

  it('reads an edge bitmap one value above the alive bound, grows it and writes it again', () => {
    const edge = Bitmap.deserialize(encodePortableShard([
      ...fullRunContainers(256),
      { kind: 'array', key: 256, values: [0] },
    ]), true);
    edge.add(4_000_000_000);

    const written = edge.serialize(true);

    expect(Bitmap.deserialize(written, true).size).toBe(RoaringShardBounds.MAX_ALIVE_CARDINALITY + 2);
  });

  it('reads an edge bitmap that holds the whole id space', () => {
    const wholeIdSpace = encodePortableShard(fullRunContainers(65536));
    expect(Bitmap.deserialize(wholeIdSpace, true).size).toBe(2 ** 32);
  });

  it('rejects a shard one byte above the size bound before it is loaded', () => {
    const oversized = new Uint8Array(RoaringShardBounds.MAX_BYTES + 1);
    expect(rejection(oversized).code).toBe('E_ROARING_SHARD_TOO_LARGE');
  });

  // Pins the compatibility basis for the zero-byte refusal: the bitmap
  // library alone reads zero bytes as an empty bitmap, but every edge writer
  // stores `serialize(true)` output, which is never empty.
  it.each([
    ['a new bitmap', (): Uint8Array => new Bitmap().serialize(true)],
    ['a cleared bitmap', (): Uint8Array => {
      const cleared = new Bitmap([1, 70_000]);
      cleared.clear();
      return cleared.serialize(true);
    }],
    ['a bitmap whose last value was removed', (): Uint8Array => {
      const emptied = new Bitmap([7]);
      emptied.remove(7);
      return emptied.serialize(true);
    }],
  ])('writes %s as eight bytes that read back as an empty bitmap', (_name, write) => {
    const written = write();

    expect(written.byteLength).toBe(8);
    expect(Bitmap.deserialize(written, true).size).toBe(0);
  });

  it('rejects zero bytes as a truncated shard', () => {
    const error = rejection(new Uint8Array(0));

    expect(error.code).toBe('E_ROARING_SHARD_MALFORMED');
    expect(error.context['fault']).toBe('truncated-cookie');
  });

  it('rejects a request for a format the boundary does not validate', () => {
    expect(() => Bitmap.deserialize(golden, false)).toThrow(expect.objectContaining({
      code: 'E_ROARING_SHARD_FORMAT',
    }));
  });
});
