import { describe, expect, it } from 'vitest';
import MintId from '../../../../src/domain/crdt/MintId.ts';
import { requireStrandId } from '../../../../src/domain/crdt/StrandId.ts';

const STRAND = 'ab'.repeat(32);

describe('MintId (#1014)', () => {
  it('keeps a lane writer bare, as in v20', () => {
    const lane = MintId.root('alice');

    expect(lane.encode()).toBe('alice');
    expect(lane.isRoot).toBe(true);
    expect(MintId.decode('alice').equals(lane)).toBe(true);
  });

  it('spells a strand writer @w.<writer>@s.<strand-id>', () => {
    const strand = MintId.strand('ops.bot-1', STRAND);

    expect(strand.encode()).toBe(`@w.ops.bot-1@s.${STRAND}`);
    expect(strand.isRoot).toBe(false);
    expect(MintId.decode(strand.encode()).equals(strand)).toBe(true);
  });

  it('gives a lane writer and a strand writer of the same name distinct spellings', () => {
    expect(MintId.root('next').encode()).not.toBe(MintId.strand('next', STRAND).encode());
    expect(MintId.root('next').equals(MintId.strand('next', STRAND))).toBe(false);
  });

  it.each([
    ['@w.alice', 'an alternate spelling of a lane writer'],
    [`@s.${STRAND}@w.alice`, 'sigils out of order'],
    [`@w.alice@s.${STRAND}@s.${STRAND}`, 'extra sigils'],
    [`x@w.alice@s.${STRAND}`, 'text before the first sigil'],
    [`@b.braid@s.${STRAND}`, 'the reserved braid sigil'],
    [`@q.alice@s.${STRAND}`, 'an unknown kind'],
    ['@w.alice@s.next', 'a strand name instead of an immutable id'],
    [`@w.al/ice@s.${STRAND}`, 'an invalid writer id'],
    ['', 'an empty spelling'],
  ])('refuses %s (%s)', (spelling) => {
    expect(() => MintId.decode(spelling)).toThrow();
    expect(MintId.isSpelling(spelling)).toBe(false);
  });

  it('names the reserved braid sigil in its refusal', () => {
    expect(() => MintId.decode(`@b.x@s.${STRAND}`)).toThrow(/reserved braid sigil/);
  });

  it('accepts only 64 lowercase hex digits as a strand id', () => {
    expect(requireStrandId(STRAND)).toBe(STRAND);
    expect(() => requireStrandId(STRAND.toUpperCase())).toThrow(expect.objectContaining({ code: 'E_CRDT_INVALID_STRAND_ID' }));
    expect(() => MintId.strand('alice', 'next')).toThrow(expect.objectContaining({ code: 'E_CRDT_INVALID_STRAND_ID' }));
  });
});
