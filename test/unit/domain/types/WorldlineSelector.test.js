import { describe, it, expect } from 'vitest';
import QueryError from '../../../../src/domain/errors/QueryError.ts';
import WorldlineSelector from '../../../../src/domain/types/WorldlineSelector.ts';
import LiveSelector from '../../../../src/domain/types/LiveSelector.ts';
import CoordinateSelector from '../../../../src/domain/types/CoordinateSelector.ts';
import StrandSelector from '../../../../src/domain/types/StrandSelector.ts';

// ─── LiveSelector ────────────────────────────────────────────────────────────

describe('LiveSelector', () => {
  it('extends WorldlineSelector', () => {
    const sel = new LiveSelector();
    expect(sel).toBeInstanceOf(WorldlineSelector);
    expect(sel).toBeInstanceOf(LiveSelector);
  });

  it('defaults ceiling to null', () => {
    const sel = new LiveSelector();
    expect(sel.ceiling).toBe(null);
  });

  it('accepts null ceiling', () => {
    const sel = new LiveSelector(null);
    expect(sel.ceiling).toBe(null);
  });

  it('accepts non-negative integer ceiling', () => {
    const sel = new LiveSelector(42);
    expect(sel.ceiling).toBe(42);
  });

  it('accepts zero ceiling', () => {
    const sel = new LiveSelector(0);
    expect(sel.ceiling).toBe(0);
  });

  it('rejects negative ceiling', () => {
    expect(() => new LiveSelector(-1)).toThrow(QueryError);
  });

  it('rejects non-integer ceiling', () => {
    expect(() => new LiveSelector(3.14)).toThrow(QueryError);
  });

  it('rejects string ceiling', () => {
    expect(() => new LiveSelector(/** @type {any} */ ('42'))).toThrow(QueryError);
  });

  it('is frozen', () => {
    const sel = new LiveSelector(10);
    expect(Object.isFrozen(sel)).toBe(true);
  });

  it('clone returns an independent LiveSelector', () => {
    const sel = new LiveSelector(42);
    const copy = sel.clone();
    expect(copy).toBeInstanceOf(LiveSelector);
    expect(copy).not.toBe(sel);
    expect(copy.ceiling).toBe(42);
  });

  it('clone of no-ceiling returns no-ceiling', () => {
    const sel = new LiveSelector();
    const copy = sel.clone();
    expect(copy.ceiling).toBe(null);
  });

  it('toDTO returns plain object with kind', () => {
    const sel = new LiveSelector(42);
    const dto = sel.toDTO();
    expect(dto).toEqual({ kind: 'live', ceiling: 42 });
    expect(dto.constructor).toBe(Object);
  });

  it('toDTO with null ceiling omits ceiling key', () => {
    const sel = new LiveSelector();
    const dto = sel.toDTO();
    expect(dto).toEqual({ kind: 'live' });
    expect('ceiling' in dto).toBe(false);
  });
});

// ─── CoordinateSelector ─────────────────────────────────────────────────────

describe('CoordinateSelector', () => {
  it('extends WorldlineSelector', () => {
    const sel = new CoordinateSelector(new Map([['alice', 'abc']]));
    expect(sel).toBeInstanceOf(WorldlineSelector);
    expect(sel).toBeInstanceOf(CoordinateSelector);
  });

  it('accepts Map frontier', () => {
    const frontier = new Map([['alice', 'abc'], ['bob', 'def']]);
    const sel = new CoordinateSelector(frontier);
    expect(sel.frontier).toEqual(frontier);
  });

  it('accepts plain object frontier and normalizes to Map', () => {
    const sel = new CoordinateSelector({ alice: 'abc', bob: 'def' });
    expect(sel.frontier).toBeInstanceOf(Map);
    expect(sel.frontier.get('alice')).toBe('abc');
    expect(sel.frontier.get('bob')).toBe('def');
  });

  it('accepts empty frontier', () => {
    const sel = new CoordinateSelector(new Map());
    expect(sel.frontier.size).toBe(0);
  });

  it('accepts empty object frontier', () => {
    const sel = new CoordinateSelector({});
    expect(sel.frontier.size).toBe(0);
  });

  it('defaults ceiling to null', () => {
    const sel = new CoordinateSelector(new Map());
    expect(sel.ceiling).toBe(null);
  });

  it('accepts ceiling', () => {
    const sel = new CoordinateSelector(new Map(), 42);
    expect(sel.ceiling).toBe(42);
  });

  it('rejects null frontier', () => {
    expect(() => new CoordinateSelector(/** @type {any} */ (null))).toThrow(QueryError);
  });

  it('rejects non-object frontier', () => {
    expect(() => new CoordinateSelector(/** @type {any} */ ('bad'))).toThrow(QueryError);
  });

  it('rejects negative ceiling', () => {
    expect(() => new CoordinateSelector(new Map(), -1)).toThrow(QueryError);
  });

  it('is frozen', () => {
    const sel = new CoordinateSelector(new Map([['a', 'b']]));
    expect(Object.isFrozen(sel)).toBe(true);
  });

  it('frontier getter returns a defensive copy', () => {
    const sel = new CoordinateSelector(new Map([['alice', 'abc']]));
    const f1 = sel.frontier;
    const f2 = sel.frontier;
    expect(f1).not.toBe(f2);
    expect(f1).toEqual(f2);
  });

  it('mutating the returned frontier does not affect the selector', () => {
    const sel = new CoordinateSelector(new Map([['alice', 'abc']]));
    const f = sel.frontier;
    f.set('evil', 'mutation');
    expect(sel.frontier.has('evil')).toBe(false);
    expect(sel.frontier.size).toBe(1);
  });

  it('mutating the input Map does not affect the selector', () => {
    const input = new Map([['alice', 'abc']]);
    const sel = new CoordinateSelector(input);
    input.set('evil', 'mutation');
    expect(sel.frontier.has('evil')).toBe(false);
  });

  it('clone returns an independent CoordinateSelector', () => {
    const sel = new CoordinateSelector(new Map([['alice', 'abc']]), 42);
    const copy = sel.clone();
    expect(copy).toBeInstanceOf(CoordinateSelector);
    expect(copy).not.toBe(sel);
    expect(copy.frontier).toEqual(sel.frontier);
    expect(copy.frontier).not.toBe(sel.frontier);
    expect(copy.ceiling).toBe(42);
  });

  it('toDTO returns plain object with kind and Map frontier', () => {
    const sel = new CoordinateSelector(new Map([['alice', 'abc']]), 10);
    const dto = sel.toDTO();
    expect(dto.kind).toBe('coordinate');
    expect(dto.frontier).toBeInstanceOf(Map);
    expect(dto.frontier.get('alice')).toBe('abc');
    expect(dto.ceiling).toBe(10);
    expect(dto.constructor).toBe(Object);
  });
});

// ─── StrandSelector ─────────────────────────────────────────────────────────

describe('StrandSelector', () => {
  it('extends WorldlineSelector', () => {
    const sel = new StrandSelector('strand-abc');
    expect(sel).toBeInstanceOf(WorldlineSelector);
    expect(sel).toBeInstanceOf(StrandSelector);
  });

  it('stores strandId', () => {
    const sel = new StrandSelector('strand-abc');
    expect(sel.strandId).toBe('strand-abc');
  });

  it('defaults ceiling to null', () => {
    const sel = new StrandSelector('strand-abc');
    expect(sel.ceiling).toBe(null);
  });

  it('accepts ceiling', () => {
    const sel = new StrandSelector('strand-abc', 42);
    expect(sel.ceiling).toBe(42);
  });

  it('rejects empty strandId', () => {
    expect(() => new StrandSelector('')).toThrow(QueryError);
  });

  it('rejects non-string strandId', () => {
    expect(() => new StrandSelector(/** @type {any} */ (123))).toThrow(QueryError);
  });

  it('rejects null strandId', () => {
    expect(() => new StrandSelector(/** @type {any} */ (null))).toThrow(QueryError);
  });

  it('rejects negative ceiling', () => {
    expect(() => new StrandSelector('strand-abc', -1)).toThrow(QueryError);
  });

  it('is frozen', () => {
    const sel = new StrandSelector('strand-abc');
    expect(Object.isFrozen(sel)).toBe(true);
  });

  it('clone returns an independent StrandSelector', () => {
    const sel = new StrandSelector('strand-abc', 42);
    const copy = sel.clone();
    expect(copy).toBeInstanceOf(StrandSelector);
    expect(copy).not.toBe(sel);
    expect(copy.strandId).toBe('strand-abc');
    expect(copy.ceiling).toBe(42);
  });

  it('toDTO returns plain object with kind', () => {
    const sel = new StrandSelector('strand-abc', 10);
    const dto = sel.toDTO();
    expect(dto).toEqual({ kind: 'strand', strandId: 'strand-abc', ceiling: 10 });
    expect(dto.constructor).toBe(Object);
  });
});

// ─── WorldlineSelector.from() ───────────────────────────────────────────────

describe('WorldlineSelector.from()', () => {
  it('returns existing selector instance as-is', () => {
    const sel = new LiveSelector(42);
    expect(WorldlineSelector.from(sel)).toBe(sel);
  });

  it('converts { kind: "live" } to LiveSelector', () => {
    const sel = WorldlineSelector.from({ kind: 'live' });
    expect(sel).toBeInstanceOf(LiveSelector);
    const live = /** @type {LiveSelector} */ (sel);
    expect(live.ceiling).toBe(null);
  });

  it('converts { kind: "live", ceiling: 42 } to LiveSelector', () => {
    const sel = WorldlineSelector.from({ kind: 'live', ceiling: 42 });
    expect(sel).toBeInstanceOf(LiveSelector);
    const live = /** @type {LiveSelector} */ (sel);
    expect(live.ceiling).toBe(42);
  });

  it('converts { kind: "coordinate" } to CoordinateSelector', () => {
    const sel = WorldlineSelector.from({
      kind: 'coordinate',
      frontier: new Map([['alice', 'abc']]),
      ceiling: null,
    });
    expect(sel).toBeInstanceOf(CoordinateSelector);
    const coord = /** @type {CoordinateSelector} */ (sel);
    expect(coord.frontier.get('alice')).toBe('abc');
  });

  it('converts { kind: "coordinate" } with plain object frontier', () => {
    const sel = WorldlineSelector.from({
      kind: 'coordinate',
      frontier: { alice: 'abc' },
    });
    expect(sel).toBeInstanceOf(CoordinateSelector);
    const coord = /** @type {CoordinateSelector} */ (sel);
    expect(coord.frontier).toBeInstanceOf(Map);
  });

  it('converts { kind: "strand" } to StrandSelector', () => {
    const sel = WorldlineSelector.from({
      kind: 'strand',
      strandId: 'strand-abc',
      ceiling: 10,
    });
    expect(sel).toBeInstanceOf(StrandSelector);
    const strand = /** @type {StrandSelector} */ (sel);
    expect(strand.strandId).toBe('strand-abc');
    expect(strand.ceiling).toBe(10);
  });

  it('converts null to LiveSelector', () => {
    const sel = WorldlineSelector.from(null);
    expect(sel).toBeInstanceOf(LiveSelector);
    const live = /** @type {LiveSelector} */ (sel);
    expect(live.ceiling).toBe(null);
  });

  it('converts undefined to LiveSelector', () => {
    const sel = WorldlineSelector.from(undefined);
    expect(sel).toBeInstanceOf(LiveSelector);
  });

  it('throws on coordinate without frontier', () => {
    expect(() => WorldlineSelector.from({ kind: 'coordinate' })).toThrow(QueryError);
  });

  it('returns frozen selector as-is without mutation', () => {
    const sel = new LiveSelector(42);
    expect(Object.isFrozen(sel)).toBe(true);
    const result = WorldlineSelector.from(sel);
    expect(result).toBe(sel);
    const live = /** @type {LiveSelector} */ (result);
    expect(live.ceiling).toBe(42);
  });

  it('throws on unknown kind', () => {
    expect(() => WorldlineSelector.from({ kind: 'bogus' })).toThrow(QueryError);
  });
});

// ─── WorldlineSelector base class ───────────────────────────────────────────

describe('WorldlineSelector (base)', () => {
  it('clone() throws on base class', () => {
    // Cannot construct directly in normal use, but verify the guard
    const base = Object.create(WorldlineSelector.prototype);
    expect(() => base.clone()).toThrow();
  });

  it('toDTO() throws on base class', () => {
    const base = Object.create(WorldlineSelector.prototype);
    expect(() => base.toDTO()).toThrow();
  });
});
