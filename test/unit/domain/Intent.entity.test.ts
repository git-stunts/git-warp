import { describe, expect, it } from 'vitest';

import Intent from '../../../src/domain/api/Intent.ts';
import { intent } from '../../../src/domain/api/IntentBuilders.ts';
import type { PropValue } from '../../../src/domain/types/PropValue.ts';

describe('Intent entity descriptors', () => {
  it('describes one entity creation with its complete payload', () => {
    const created = Intent.addEntity({
      subject: 'entry:1',
      properties: { kind: 'capture', text: 'a fact' },
    });

    expect(created.kind).toBe('entity.add');
    expect(created.descriptor).toEqual({
      kind: 'entity.add',
      subject: 'entry:1',
      properties: { kind: 'capture', text: 'a fact' },
    });
  });

  it('is reachable through the public intent builders', () => {
    expect(intent.entity.add({
      subject: 'entry:1',
      properties: { kind: 'capture' },
    }).kind).toBe('entity.add');
  });

  it('describes substrate allocation without inventing an application subject', () => {
    const created = Intent.addEntityAuto({
      namespace: 'entry',
      properties: { kind: 'capture', capturedAt: '2026-08-03T20:00:00.000Z' },
    });

    expect(created.kind).toBe('entity.add');
    expect(created.descriptor).toEqual({
      kind: 'entity.add',
      namespace: 'entry',
      properties: { capturedAt: '2026-08-03T20:00:00.000Z', kind: 'capture' },
    });
    expect('subject' in created.descriptor).toBe(false);
  });

  it('exposes substrate allocation through a distinct public builder', () => {
    expect(intent.entity.addAuto({
      namespace: 'entry',
      properties: { kind: 'capture' },
    }).descriptor).toEqual({
      kind: 'entity.add',
      namespace: 'entry',
      properties: { kind: 'capture' },
    });
  });

  it('rejects an empty allocation namespace', () => {
    expect(() => Intent.addEntityAuto({
      namespace: '',
      properties: { kind: 'capture' },
    })).toThrow();
  });

  it('copies the payload so the descriptor cannot be mutated after the fact', () => {
    const properties = { tags: ['first'] };
    const created = Intent.addEntity({ subject: 'entry:1', properties });

    properties.tags.push('second');
    const first = created.descriptor;
    const second = created.descriptor;

    expect(first).toEqual({
      kind: 'entity.add',
      subject: 'entry:1',
      properties: { tags: ['first'] },
    });
    expect(first).not.toBe(second);
  });

  it('rejects an entity with no properties', () => {
    expect(() => Intent.addEntity({ subject: 'entry:1', properties: {} }))
      .toThrowError(expect.objectContaining({ code: 'E_INTENT_ENTITY_EMPTY' }));
  });

  it('rejects a missing subject', () => {
    expect(() => Intent.addEntity({ subject: '', properties: { kind: 'capture' } }))
      .toThrow();
  });

  it('rejects payload values that are not property-compatible', () => {
    expect(() => Intent.addEntity({
      subject: 'entry:1',
      // @ts-expect-error Exercise the JavaScript boundary.
      properties: { broken: new InvalidPropertyCarrier() },
    })).toThrowError(expect.objectContaining({ code: 'E_INTENT_VALUE' }));
  });

  it('rejects an empty property key', () => {
    expect(() => Intent.addEntity({
      subject: 'entry:1',
      properties: { '': 'capture' },
    })).toThrow();
  });

  it('describes payloads that differ only in key order identically', () => {
    expect(Intent.addEntity({
      subject: 'entry:1',
      properties: { kind: 'capture', text: 'hello' },
    }).descriptor).toEqual(Intent.addEntity({
      subject: 'entry:1',
      properties: { text: 'hello', kind: 'capture' },
    }).descriptor);
  });

  it('orders payload keys canonically rather than by insertion', () => {
    const created = Intent.addEntity({
      subject: 'entry:1',
      properties: { c: 3, a: 1, b: 2 },
    });

    expect(Object.keys(entityProperties(created))).toEqual(['a', 'b', 'c']);
  });

  it('keeps a prototype-shaped key as ordinary data', () => {
    const created = Intent.addEntity({
      subject: 'entry:1',
      properties: { ['__proto__']: 'polluted', kind: 'capture' },
    });

    const properties = entityProperties(created);
    expect(Object.hasOwn(properties, '__proto__')).toBe(true);
    expect(properties['__proto__']).toBe('polluted');
    expect({}.constructor).toBe(Object);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('keeps constructor and prototype keys as ordinary data', () => {
    const properties = entityProperties(Intent.addEntity({
      subject: 'entry:1',
      properties: { constructor: 'not-a-function', prototype: 'inert' },
    }));

    expect(properties['constructor']).toBe('not-a-function');
    expect(properties['prototype']).toBe('inert');
  });
});

function entityProperties(created: Intent): Record<string, PropValue> {
  const { descriptor } = created;
  if (descriptor.kind !== 'entity.add') {
    throw new Error('expected an entity.add descriptor');
  }
  return descriptor.properties;
}

class InvalidPropertyCarrier {}
