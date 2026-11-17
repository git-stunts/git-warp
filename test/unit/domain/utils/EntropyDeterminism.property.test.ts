/**
 * Seeded property checks for entropy-derived identity (#184 section 2e).
 *
 * Each property runs against the real minter and against calibrated broken
 * controls. A property that also passes on a broken control proves nothing,
 * so every control must fail under the same seed and run count.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { generateWriterId, validateWriterIdCanonical } from '../../../../src/domain/utils/WriterId.ts';
import type RandomPort from '../../../../src/ports/RandomPort.ts';

const PARAMETERS = Object.freeze({ seed: 184, numRuns: 500 });
const WRITER_ID_BYTES = 16;

type Minter = (bytes: Uint8Array) => string;

class FixedBytesRandomPort implements RandomPort {
  constructor(private readonly bytes: Uint8Array) {}

  randomBytes(_length: number): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

const entropy = fc.uint8Array({ minLength: WRITER_ID_BYTES, maxLength: WRITER_ID_BYTES });
const sameBytes = (left: Uint8Array, right: Uint8Array): boolean => left.every((byte, index) => byte === right[index]);

const realMinter: Minter = (bytes) => generateWriterId(new FixedBytesRandomPort(bytes));

/** Broken control: hidden state leaks into the id, like an ambient source would. */
function statefulMinter(): Minter {
  let calls = 0;
  return (bytes) => {
    calls += 1;
    const leaked = Uint8Array.from(bytes);
    leaked[0] = (leaked[0]! + calls) & 0xff;
    return generateWriterId(new FixedBytesRandomPort(leaked));
  };
}

/** Broken control: the last entropy byte is dropped, so distinct draws collide. */
const truncatingMinter: Minter = (bytes) => {
  const truncated = Uint8Array.from(bytes);
  truncated[WRITER_ID_BYTES - 1] = 0;
  return generateWriterId(new FixedBytesRandomPort(truncated));
};

const replays = (mint: Minter) => fc.property(entropy, (bytes) => mint(bytes) === mint(bytes));
const separates = (mint: Minter) => fc.property(entropy, entropy, (left, right) =>
  sameBytes(left, right) || mint(left) !== mint(right));
const staysCanonical = (mint: Minter) => fc.property(entropy, (bytes) => {
  validateWriterIdCanonical(mint(bytes));
  return true;
});

describe('entropy-derived writer ids (seeded properties)', () => {
  it('replay the same id from the same entropy', () => {
    fc.assert(replays(realMinter), PARAMETERS);
  });

  it('keep distinct entropy distinct', () => {
    fc.assert(separates(realMinter), PARAMETERS);
  });

  it('stay canonical for every entropy draw', () => {
    fc.assert(staysCanonical(realMinter), PARAMETERS);
  });

  it('detects a minter that leaks hidden state (calibrated broken control)', () => {
    expect(fc.check(replays(statefulMinter()), PARAMETERS).failed).toBe(true);
  });

  it('detects a minter that discards entropy (calibrated broken control)', () => {
    const truncatedPairs = fc.tuple(entropy, fc.integer({ min: 0, max: 0xff })).map(([bytes, last]): readonly [Uint8Array, Uint8Array] => {
      const twin = Uint8Array.from(bytes);
      twin[WRITER_ID_BYTES - 1] = last === bytes[WRITER_ID_BYTES - 1] ? (last + 1) & 0xff : last;
      return [bytes, twin];
    });
    const property = fc.property(truncatedPairs, ([left, right]) => truncatingMinter(left) !== truncatingMinter(right));

    expect(fc.check(property, PARAMETERS).failed).toBe(true);
    expect(fc.check(fc.property(truncatedPairs, ([left, right]) => realMinter(left) !== realMinter(right)), PARAMETERS).failed)
      .toBe(false);
  });
});
