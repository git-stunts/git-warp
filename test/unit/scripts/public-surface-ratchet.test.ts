import { describe, expect, it } from 'vitest';
import SurfaceFinding from '../../../scripts/public-surface/SurfaceFinding.ts';
import SurfaceRatchet from '../../../scripts/public-surface/SurfaceRatchet.ts';
import SurfaceRefusal from '../../../scripts/public-surface/SurfaceRefusal.ts';

function ratchet(text: string): SurfaceRatchet {
  const value = SurfaceRatchet.parse(text);
  if (value instanceof SurfaceRefusal) throw new Error(value.reason);
  return value;
}

describe('public surface ratchet', () => {
  const old = new SurfaceFinding(['.', 'Runtime', 'export', 'runtime'], 'index.d.ts:1');
  const added = new SurfaceFinding(['./late', 'checkpoint', 'export', 'checkpoint'], 'late.d.ts:2');

  it('accepts exactly the inventoried legacy capability', () => {
    expect(ratchet(`1054\t${old.key}\n`).compare([old])).toEqual([]);
  });

  it('rejects both new exposure and an obsolete allowance', () => {
    const inventory = ratchet(`1054\t${old.key}\n`);
    expect(inventory.compare([old, added])).toEqual([`NEW ${added.describe()}`]);
    expect(inventory.compare([])).toEqual([`STALE 1054\t${old.key}`]);
  });

  it('allows retirement but rejects growth or changed removal ownership', () => {
    const inventory = ratchet(`1054\t${old.key}\n`);
    expect(ratchet('').additionsSince(inventory)).toEqual([]);
    expect(ratchet(`1054\t${old.key}\n1054\t${added.key}\n`).additionsSince(inventory)).toEqual([`1054\t${added.key}`]);
    expect(ratchet(`1055\t${old.key}\n`).additionsSince(inventory)).toEqual([`1055\t${old.key}`]);
  });

  it('does not turn source line movement into a new allowance', () => {
    const moved = new SurfaceFinding(['.', 'Runtime', 'export', 'runtime'], 'index.d.ts:99');
    expect(ratchet(`1054\t${old.key}\n`).compare([moved])).toEqual([]);
  });

  it.each(['0\tentry', '-1\tentry', 'ticket\tentry', '1054\t', '1054\ta\n1054\ta', '9007199254740992\ta'])('rejects malformed owner or duplicate allowance: %s', (text) => {
    expect(SurfaceRatchet.parse(text)).toBeInstanceOf(SurfaceRefusal);
  });
});
