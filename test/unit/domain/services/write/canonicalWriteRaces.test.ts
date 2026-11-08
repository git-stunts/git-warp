import { describe, expect, it } from 'vitest';
import WriteRace from '../../../../../src/domain/api/WriteRace.ts';
import { canonicalWriteRaces } from '../../../../../src/domain/services/write/canonicalWriteRaces.ts';

const RACE = { kind: 'register', subject: 'doc', key: 'body', writers: ['dave'], overflow: 2, causality: 'underdetermined' } as const;

function shape(races: readonly WriteRace[]): ReadonlyArray<readonly [readonly string[], number, string]> {
  return races.map(({ writers, overflow, causality }) => [writers, overflow, causality]);
}

describe('canonicalWriteRaces', () => {
  it('orders races that share kind, subject and key by writers, then overflow, then causality', () => {
    const races = [
      new WriteRace({ ...RACE, writers: ['erin'] }), new WriteRace(RACE), new WriteRace({ ...RACE, overflow: 1 }),
      new WriteRace({ ...RACE, causality: 'observed' }), new WriteRace(RACE),
    ];

    expect(shape(canonicalWriteRaces(races))).toEqual([
      [['dave'], 1, 'underdetermined'], [['dave'], 2, 'observed'], [['dave'], 2, 'underdetermined'], [['dave'], 2, 'underdetermined'], [['erin'], 2, 'underdetermined'],
    ]);
    expect(shape(canonicalWriteRaces([...races].reverse()))).toEqual(shape(canonicalWriteRaces(races)));
  });

  it('compares writer lists element by element, a shorter prefix first', () => {
    const joined = new WriteRace({ ...RACE, writers: ['a\u0000b'] });
    const split = new WriteRace({ ...RACE, writers: ['a', 'b'] });
    const prefix = new WriteRace({ ...RACE, writers: ['a'] });

    const forward = canonicalWriteRaces([joined, split, prefix]).map(({ writers }) => writers);
    const backward = canonicalWriteRaces([prefix, split, joined]).map(({ writers }) => writers);

    expect(forward).toEqual([['a'], ['a', 'b'], ['a\u0000b']]);
    expect(backward).toEqual(forward);
  });
});
