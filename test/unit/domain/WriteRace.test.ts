import { describe, expect, it } from 'vitest';
import WriteRace from '../../../src/domain/api/WriteRace.ts';
import WriteRaceError from '../../../src/domain/errors/WriteRaceError.ts';

const REGISTER = { kind: 'register', subject: 'doc', key: 'title', writers: ['bob'], overflow: 0, causality: 'observed' } as const;
const LIFECYCLE = { kind: 'lifecycle', subject: 'doc', key: null, writers: ['bob'], overflow: 0, causality: 'observed' } as const;

function refusal(build: () => WriteRace): WriteRaceError | null {
  try {
    build();
    return null;
  } catch (error) {
    return error instanceof WriteRaceError ? error : null;
  }
}

describe('WriteRace', () => {
  it('holds a register race on one property and a lifecycle race on none', () => {
    expect(new WriteRace({ ...REGISTER, overflow: Number.MAX_SAFE_INTEGER })).toMatchObject({ key: 'title', overflow: Number.MAX_SAFE_INTEGER });
    expect(new WriteRace(LIFECYCLE).key).toBeNull();
  });

  it.each([
    ['a register race with no key', () => new WriteRace({ ...REGISTER, key: null })],
    ['a register race with an empty key', () => new WriteRace({ ...REGISTER, key: '' })],
    ['a lifecycle race with a key', () => new WriteRace({ ...LIFECYCLE, key: 'title' })],
    ['a negative overflow', () => new WriteRace({ ...REGISTER, overflow: -1 })],
    ['a fractional overflow', () => new WriteRace({ ...REGISTER, overflow: 0.5 })],
    ['an overflow past the safe integers', () => new WriteRace({ ...REGISTER, overflow: 2 ** 53 })],
    ['a non-number overflow', () => new WriteRace({ ...REGISTER, overflow: Number.NaN })],
  ])('refuses %s with a typed error', (_name, build) => {
    expect(refusal(build)?.code).toBe('E_WRITE_RACE');
  });
});
