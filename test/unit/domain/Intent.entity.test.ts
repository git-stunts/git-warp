import { describe, expect, it } from 'vitest';

import Intent from '../../../src/domain/api/Intent.ts';
import { intent } from '../../../src/domain/api/IntentBuilders.ts';

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
});

class InvalidPropertyCarrier {}
