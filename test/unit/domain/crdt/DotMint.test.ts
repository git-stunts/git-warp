import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import DotMint from '../../../../src/domain/crdt/DotMint.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';

describe('DotMint', () => {
  it('mints the counter after its high-water mark and records it in the patch context', () => {
    const mint = DotMint.after('alice', 4);
    const context = VersionVector.from({ bob: 2 });

    expect(mint.mintInto(context)).toEqual(new Dot('alice', 5));
    expect(mint.mintInto(context)).toEqual(new Dot('alice', 6));
    expect(VersionVector.serialize(context)).toEqual({ alice: 6, bob: 2 });
    expect(mint.issued).toBe(6);
  });

  it('never mints below its high-water mark when the context is stale', () => {
    const mint = DotMint.after('alice', 9);
    const stale = VersionVector.from({ alice: 2 });

    expect(mint.mintInto(stale)).toEqual(new Dot('alice', 10));
  });

  it('learns a higher counter from an observed context but never lowers', () => {
    const mint = DotMint.after('alice', 3);

    mint.observed(VersionVector.from({ alice: 7, bob: 40 }));
    expect(mint.peek()).toEqual(new Dot('alice', 8));
    mint.observed(VersionVector.from({ alice: 1 }));
    expect(mint.peek()).toEqual(new Dot('alice', 8));
  });

  it('peek does not consume a counter', () => {
    const mint = DotMint.after('alice', 0);

    expect(mint.peek()).toEqual(mint.peek());
    expect(mint.mintInto(VersionVector.empty())).toEqual(new Dot('alice', 1));
  });

  it('refuses an empty writer or an invalid high-water mark', () => {
    expect(() => DotMint.after('', 0)).toThrow(expect.objectContaining({ code: 'E_CRDT_INVALID_WRITER_ID' }));
    expect(() => DotMint.after('alice', -1)).toThrow(expect.objectContaining({ code: 'E_CRDT_INVALID_COUNTER' }));
    expect(() => DotMint.after('alice', 1.5)).toThrow(expect.objectContaining({ code: 'E_CRDT_INVALID_COUNTER' }));
  });

  it('is the only producer of dots: a version vector cannot hand one out', () => {
    const vv = VersionVector.empty();

    expect(vv.increment('alice')).toBe(1);
    expect(vv.increment('alice')).not.toBeInstanceOf(Dot);
  });
});
