import { describe, expect, it } from 'vitest';
import WriteRace from '../../../src/domain/api/WriteRace.ts';
import WriteRaceError from '../../../src/domain/errors/WriteRaceError.ts';

const REGISTER = { kind: 'register', subject: 'doc', key: 'title', writers: ['bob'], overflow: 0, causality: 'observed' } satisfies ConstructorParameters<typeof WriteRace>[0];
const LIFECYCLE = { kind: 'lifecycle', subject: 'doc', key: null, writers: ['bob'], overflow: 0, causality: 'observed' } satisfies ConstructorParameters<typeof WriteRace>[0];

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
    expect(new WriteRace({ ...REGISTER, writers: [], overflow: 1 }).writers).toEqual([]);
  });

  it.each([
    ['a register race with no key', () => new WriteRace({ ...REGISTER, key: null })],
    ['a register race with an empty key', () => new WriteRace({ ...REGISTER, key: '' })],
    ['a lifecycle race with a key', () => new WriteRace({ ...LIFECYCLE, key: 'title' })],
    ['a negative overflow', () => new WriteRace({ ...REGISTER, overflow: -1 })],
    ['a fractional overflow', () => new WriteRace({ ...REGISTER, overflow: 0.5 })],
    ['an overflow past the safe integers', () => new WriteRace({ ...REGISTER, overflow: 2 ** 53 })],
    ['a non-number overflow', () => new WriteRace({ ...REGISTER, overflow: Number.NaN })],
    ['a race with no writer and no overflow', () => new WriteRace({ ...REGISTER, writers: [] })],
    ['a race on no subject', () => new WriteRace({ ...LIFECYCLE, subject: '' })],
  ])('refuses %s with a typed error', (_name, build) => {
    expect(refusal(build)?.code).toBe('E_WRITE_RACE');
  });

  it.each(['', 'a/b', 'x'.repeat(65)])('refuses the writer id %j by the writer-id rule', (writer) => {
    expect(() => new WriteRace({ ...REGISTER, writers: ['bob', writer] })).toThrow(expect.objectContaining({ code: 'E_INVALID_WRITER_ID' }));
  });
});
