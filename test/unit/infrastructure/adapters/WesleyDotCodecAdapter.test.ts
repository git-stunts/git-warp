import { describe, expect, it } from 'vitest';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { WesleyDotCodecAdapter } from '../../../../src/infrastructure/adapters/wesley/WesleyDotCodecAdapter.ts';

const codec = new WesleyDotCodecAdapter();

/**
 * Returns the Wesley LE-binary fixture for `Dot("alice", counter)`.
 */
function aliceDotBytes(counter: number): Uint8Array {
  return new Uint8Array([
    0x05, 0x00, 0x00, 0x00,
    0x61, 0x6c, 0x69, 0x63, 0x65,
    counter, 0x00, 0x00, 0x00,
  ]);
}

describe('WesleyDotCodecAdapter', () => {
  it('encodes Dot through the Wesley LE-binary golden layout', () => {
    const bytes = codec.encode(new Dot('alice', 42));

    expect(bytes).toEqual(aliceDotBytes(42));
  });

  it('decodes Wesley LE-binary bytes into a runtime Dot', () => {
    const dot = codec.decode(aliceDotBytes(42));

    expect(dot).toBeInstanceOf(Dot);
    expect(dot).toEqual({ writerId: 'alice', counter: 42 });
  });

  it('roundtrips writer ids that contain separators used by legacy string encoding', () => {
    const dot = new Dot('urn:uuid:abc', 7);

    expect(codec.decode(codec.encode(dot))).toEqual(dot);
  });

  it('rejects trailing bytes at the generated decode boundary', () => {
    const bytes = new Uint8Array([...aliceDotBytes(42), 0x00]);

    expect(() => codec.decode(bytes)).toThrow('trailing bytes after decode');
  });

  it('rejects generated transport shapes that violate Dot invariants', () => {
    expect(() => codec.decode(aliceDotBytes(0))).toThrow('counter must be a positive integer');
  });

  it('fails closed when a valid Dot exceeds Wesley GraphQL Int range', () => {
    const tooLargeForCurrentWesleyInt = new Dot('alice', 0x8000_0000);

    expect(() => codec.encode(tooLargeForCurrentWesleyInt)).toThrow('Wesley LE-binary i32 out of range');
  });
});
