import { describe, expect, it } from 'vitest';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import GraphOrdinal from '../../../../src/domain/retained/GraphOrdinal.ts';
import OrdinalGeometry from '../../../../src/domain/retained/OrdinalGeometry.ts';
import OrdinalSegment from '../../../../src/domain/retained/OrdinalSegment.ts';
import type { ConeDotSet } from '../../../../src/domain/services/cone/ConeRecordKey.ts';
import RetainedGraphError from '../../../../src/domain/errors/RetainedGraphError.ts';

const GEOMETRY = OrdinalGeometry.dotPages();
/** A value whose runtime shape contradicts its static type, as a corrupt decode would produce. */
function untyped<T>(json: string): T {
  const value: T = JSON.parse(json);
  return value;
}

describe('GraphOrdinal and OrdinalSegment (#815)', () => {
  it('names one dot of one OR-Set: kind, writer chain and counter', () => {
    const ordinal = GraphOrdinal.fromDot('node', new Dot('alice', 3));
    expect(ordinal.kind).toBe('node');
    expect(ordinal.writerId).toBe('alice');
    expect(ordinal.counter).toBe(3);
    expect(Dot.encode(ordinal.dot())).toBe('alice:3');
    expect(ordinal.toString()).toBe('node/alice:3');
    expect(Object.isFrozen(ordinal)).toBe(true);
    expect(ordinal.equals(new GraphOrdinal({ kind: 'node', writerId: 'alice', counter: 3 }))).toBe(true);
    expect(ordinal.equals(new GraphOrdinal({ kind: 'edge', writerId: 'alice', counter: 3 }))).toBe(false);
    expect(ordinal.equals(new GraphOrdinal({ kind: 'node', writerId: 'bob', counter: 3 }))).toBe(false);
    expect(ordinal.equals(new GraphOrdinal({ kind: 'node', writerId: 'alice', counter: 4 }))).toBe(false);
  });

  it('refuses unknown kinds, invalid writers and counters outside a dot', () => {
    expect(() => new GraphOrdinal({ kind: untyped<ConeDotSet>('"prop"'), writerId: 'alice', counter: 1 }))
      .toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_INVALID' }));
    expect(() => new GraphOrdinal({ kind: 'node', writerId: '', counter: 1 })).toThrow(expect.objectContaining({ code: 'E_CRDT_INVALID_MINT_ID' }));
    expect(() => new GraphOrdinal({ kind: 'node', writerId: 'a/b', counter: 1 })).toThrow(expect.objectContaining({ code: 'E_INVALID_WRITER_ID' }));
    expect(() => new GraphOrdinal({ kind: 'node', writerId: 'alice', counter: 0 })).toThrow(expect.objectContaining({ code: 'E_CRDT_INVALID_COUNTER' }));
  });

  it('places an ordinal in a segment with a 32-bit local ordinal and back', () => {
    const ordinal = new GraphOrdinal({ kind: 'edge', writerId: 'bob', counter: 2 ** 32 + 9 });
    const segment = ordinal.segment(GEOMETRY);
    expect(segment).toBeInstanceOf(OrdinalSegment);
    expect(segment.index).toBe(1);
    expect(segment.toString()).toBe('edge/bob/1');
    expect(ordinal.local(GEOMETRY)).toBe(9);
    expect(segment.ordinalAt(9, GEOMETRY).equals(ordinal)).toBe(true);
    expect(segment.equals(new OrdinalSegment({ kind: 'edge', writerId: 'bob', index: 1 }))).toBe(true);
    expect(segment.equals(new OrdinalSegment({ kind: 'node', writerId: 'bob', index: 1 }))).toBe(false);
    expect(segment.equals(new OrdinalSegment({ kind: 'edge', writerId: 'carol', index: 1 }))).toBe(false);
    expect(segment.equals(new OrdinalSegment({ kind: 'edge', writerId: 'bob', index: 0 }))).toBe(false);
  });

  it('continues in the next segment instead of widening the 32-bit namespace', () => {
    const last = new GraphOrdinal({ kind: 'node', writerId: 'w', counter: 2 ** 32 - 1 });
    const next = new GraphOrdinal({ kind: 'node', writerId: 'w', counter: 2 ** 32 });
    expect(last.segment(GEOMETRY).index).toBe(0);
    expect(last.local(GEOMETRY)).toBe(2 ** 32 - 1);
    expect(next.segment(GEOMETRY).index).toBe(1);
    expect(next.local(GEOMETRY)).toBe(0);
    const segment = new OrdinalSegment({ kind: 'node', writerId: 'w', index: 0 });
    expect(() => segment.ordinalAt(2 ** 32, GEOMETRY)).toThrow(RetainedGraphError);
    expect(() => segment.ordinalAt(0, GEOMETRY)).toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_OUT_OF_RANGE' }));
  });

  it('refuses invalid segments', () => {
    expect(() => new OrdinalSegment({ kind: untyped<ConeDotSet>('"label"'), writerId: 'w', index: 0 }))
      .toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_INVALID' }));
    expect(() => new OrdinalSegment({ kind: 'node', writerId: 'w', index: -1 }))
      .toThrow(expect.objectContaining({ code: 'E_RETAINED_ORDINAL_INVALID' }));
    expect(() => new OrdinalSegment({ kind: 'node', writerId: 'a/b', index: 0 })).toThrow(expect.objectContaining({ code: 'E_INVALID_WRITER_ID' }));
  });
});
