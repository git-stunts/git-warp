import { describe, expect, it } from 'vitest';

import SeededRandom from '../../../benchmarks/cone-showcase/SeededRandom.ts';
import { CORPUS_SEED } from '../../../benchmarks/cone-showcase/WitnessWorkload.ts';

const DRAWS = 1000;
const TWO_TO_THE_32 = 4294967296;

// Oracle: reference implementation. This is the published mulberry32 generator
// (Tommy Ettinger), written in its usual closure form, independent of the class.
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / TWO_TO_THE_32;
  };
}

function draws(next: () => number): readonly number[] {
  return Array.from({ length: DRAWS }, () => next());
}

describe('cone-showcase seeded random stream', () => {
  it.each([0, 1, CORPUS_SEED, 2 ** 31 - 1, 2 ** 32 - 1])('matches the published mulberry32 stream for seed %d', (seed) => {
    const random = new SeededRandom(seed);
    expect(draws(() => random.next())).toEqual(draws(mulberry32(seed)));
  });

  it('draws every value in [0, 1), and the same stream for the same seed', () => {
    const first = draws(() => new SeededRandom(CORPUS_SEED).next());
    const random = new SeededRandom(CORPUS_SEED);
    const stream = draws(() => random.next());
    const again = new SeededRandom(CORPUS_SEED);
    expect(draws(() => again.next())).toEqual(stream);
    expect(stream.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(new Set(first).size).toBe(1);
    expect(new Set(stream).size).toBeGreaterThan(DRAWS * 0.99);
  });

  it('picks the item at floor(draw * length), so every item can be drawn', () => {
    const items = ['a', 'b', 'c', 'd'] as const;
    const random = new SeededRandom(7);
    const reference = mulberry32(7);
    const picked = Array.from({ length: 200 }, () => random.pick(items));
    expect(picked).toEqual(Array.from({ length: 200 }, () => items[Math.floor(reference() * items.length)]));
    expect(new Set(picked)).toEqual(new Set(items));
  });

  it('refuses a non-integer seed and an empty list', () => {
    expect(() => new SeededRandom(0.5)).toThrow('SeededRandom needs an integer seed');
    expect(() => new SeededRandom(Number.NaN)).toThrow('SeededRandom needs an integer seed');
    expect(() => new SeededRandom(1).pick([])).toThrow('cannot pick from an empty list');
  });
});
