import { describe, expect, it, vi } from 'vitest';

import ProjectionHandle from '../../../../src/domain/services/ProjectionHandle.ts';
import LiveSelector from '../../../../src/domain/types/LiveSelector.ts';
import CoordinateSelector from '../../../../src/domain/types/CoordinateSelector.ts';
import StrandSelector from '../../../../src/domain/types/StrandSelector.ts';
import QueryError from '../../../../src/domain/errors/QueryError.ts';

/**
 * Presents a worldline source shape the compiler would reject.
 *
 * `selectorFromSource` guards a runtime boundary — a decoded DTO, a JavaScript
 * caller — that the type system does not police, so an unrecognised kind has
 * to reach it unchecked. One cast, confined here.
 */
function unrecognizedSource(fields: Readonly<Record<string, unknown>>): unknown {
  return fields;
}

function graphStub() {
  return { observer: vi.fn() } as unknown as ConstructorParameters<typeof ProjectionHandle>[0]['graph'];
}

type HandleOptions = ConstructorParameters<typeof ProjectionHandle>[0];

/**
 * `exactOptionalPropertyTypes` forbids passing an explicit `undefined` for an
 * optional property, so the key is omitted rather than set when no source is
 * given — which is also the case under test for the live default.
 */
function handleWith(...source: readonly [unknown] | readonly []): ProjectionHandle {
  if (source.length === 0) {
    return new ProjectionHandle({ graph: graphStub() });
  }
  return new ProjectionHandle({
    graph: graphStub(),
    source: source[0] as Exclude<HandleOptions['source'], undefined>,
  });
}

describe('ProjectionHandle worldline source resolution', () => {
  it('defaults to a live selector when no source is given', () => {
    expect(handleWith().source).toStrictEqual({ kind: 'live' });
  });

  it('defaults to a live selector for an explicitly null source', () => {
    expect(handleWith(null).source).toStrictEqual({ kind: 'live' });
  });

  it('round-trips a live source, preserving its ceiling', () => {
    expect(handleWith({ kind: 'live', ceiling: 12 }).source).toStrictEqual({
      kind: 'live',
      ceiling: 12,
    });
  });

  it('round-trips a strand source', () => {
    expect(handleWith({ kind: 'strand', strandId: 'strand:one' }).source).toMatchObject({
      kind: 'strand',
      strandId: 'strand:one',
    });
  });

  it('clones a selector instance rather than retaining the caller’s object', () => {
    const selector = new LiveSelector(3);
    const handle = new ProjectionHandle({ graph: graphStub(), source: selector });

    expect(handle.source).toStrictEqual({ kind: 'live', ceiling: 3 });
  });

  it('accepts each concrete selector subclass', () => {
    expect(new ProjectionHandle({ graph: graphStub(), source: new LiveSelector() }).source.kind)
      .toBe('live');
    expect(
      new ProjectionHandle({ graph: graphStub(), source: new StrandSelector('strand:two') }).source.kind,
    ).toBe('strand');
    expect(
      new ProjectionHandle({
        graph: graphStub(),
        source: new CoordinateSelector(new Map(), null, null),
      }).source.kind,
    ).toBe('coordinate');
  });

  it('rejects an unrecognised source kind instead of silently going live', () => {
    expect(() => handleWith(unrecognizedSource({ kind: 'teleport' }))).toThrow(QueryError);
    expect(() => handleWith(unrecognizedSource({ kind: 'teleport' }))).toThrow(
      /unrecognized worldline source kind/u,
    );
  });
});

describe('ProjectionHandle optic access', () => {
  it('refuses to produce an optic without a checkpoint-tail basis source', () => {
    expect(() => handleWith().optic()).toThrow(
      /worldline optic requires a checkpoint-tail bounded basis source/u,
    );
  });
});

describe('ProjectionHandle seek', () => {
  it('carries the current source forward when seek is given no override', async () => {
    const handle = handleWith({ kind: 'live', ceiling: 5 });

    const next = await handle.seek();

    expect(next).not.toBe(handle);
    expect(next.source).toStrictEqual({ kind: 'live', ceiling: 5 });
  });

  it('adopts the overriding source when seek is given one', async () => {
    const handle = handleWith({ kind: 'live', ceiling: 5 });

    const next = await handle.seek({ source: { kind: 'strand', strandId: 'strand:three' } });

    expect(next.source).toMatchObject({ kind: 'strand', strandId: 'strand:three' });
  });
});
