import { describe, expect, it } from 'vitest';

import EntityOccurrence from '../../../src/domain/api/EntityOccurrence.ts';
import { createEntityOccurrence } from '../../../src/domain/api/EntityOccurrenceRuntime.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import { EventId } from '../../../src/domain/utils/EventId.ts';

describe('EntityOccurrence', () => {
  it('keeps occurrence identity, subject identity, and application time separate', () => {
    const first = occurrence({
      context: { writer: 1 },
      counter: 1,
      lamport: 1,
      patchSha: 'aaaa',
      subject: 'entry:semantic',
    });
    const second = occurrence({
      context: { writer: 2 },
      counter: 2,
      lamport: 2,
      patchSha: 'bbbb',
      subject: 'entry:semantic',
    });

    expect(first.subject).toBe(second.subject);
    expect(first.id).not.toBe(second.id);
    expect(first.relationTo(first)).toBe('same');
    expect(first.relationTo(second)).toBe('before');
    expect(second.relationTo(first)).toBe('after');
    expect(first.compare(second)).toBeLessThan(0);
    expect(second.compare(first)).toBeGreaterThan(0);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it('keeps concurrent vectors incomparable while EventId supplies a stable order', () => {
    const left = occurrence({
      context: { alice: 1 },
      counter: 1,
      lamport: 1,
      patchSha: 'aaaa',
      subject: 'entry:left',
      writer: 'alice',
    });
    const right = occurrence({
      context: { bob: 1 },
      counter: 1,
      lamport: 1,
      patchSha: 'bbbb',
      subject: 'entry:right',
      writer: 'bob',
    });

    expect(left.relationTo(right)).toBe('concurrent');
    expect(right.relationTo(left)).toBe('concurrent');
    expect(left.compare(right)).toBeLessThan(0);
    expect(right.compare(left)).toBeGreaterThan(0);
  });

  it('rejects impossible causal cycles between distinct dots', () => {
    const left = occurrence({
      context: { alice: 1, bob: 1 },
      counter: 1,
      lamport: 1,
      patchSha: 'aaaa',
      subject: 'entry:left',
      writer: 'alice',
    });
    const right = occurrence({
      context: { alice: 1, bob: 1 },
      counter: 1,
      lamport: 1,
      patchSha: 'bbbb',
      subject: 'entry:right',
      writer: 'bob',
    });

    expect(() => left.relationTo(right)).toThrowError(expect.objectContaining({
      code: 'E_ENTITY_OCCURRENCE_CAUSAL_CYCLE',
    }));
  });

  it('admits only substrate-issued occurrences into coordinate operations', () => {
    const issued = occurrence({
      context: { writer: 1 },
      counter: 1,
      lamport: 1,
      patchSha: 'aaaa',
      subject: 'entry:issued',
    });
    const forged = new EntityOccurrence({
      compare: () => 0,
      id: 'occurrence:forged',
      relationTo: () => 'same',
      subject: 'entry:forged',
    });

    expect(() => issued.compare(forged)).toThrowError(expect.objectContaining({
      code: 'E_ENTITY_OCCURRENCE_UNAVAILABLE',
    }));
    // @ts-expect-error Exercise the JavaScript boundary.
    expect(() => issued.compare(null)).toThrowError(expect.objectContaining({
      code: 'E_ENTITY_OCCURRENCE_TYPE',
    }));
  });

  it('validates public and substrate construction boundaries', () => {
    expect(() => new EntityOccurrence({
      compare: () => 0,
      id: '',
      relationTo: () => 'same',
      subject: 'entry:1',
    })).toThrow();
    expect(() => new EntityOccurrence({
      compare: () => 0,
      id: 'occurrence:1',
      relationTo: () => 'same',
      subject: '',
    })).toThrow();
    expect(() => new EntityOccurrence({
      // @ts-expect-error Exercise the JavaScript boundary.
      compare: null,
      id: 'occurrence:1',
      relationTo: () => 'same',
      subject: 'entry:1',
    })).toThrowError(expect.objectContaining({ code: 'E_ENTITY_OCCURRENCE_COORDINATE' }));
    expect(() => createEntityOccurrence({
      context: {},
      // @ts-expect-error Exercise the JavaScript boundary.
      dot: {},
      eventId: new EventId(1, 'writer', 'aaaa', 0),
      subject: 'entry:1',
      worldline: 'events',
    })).toThrowError(expect.objectContaining({ code: 'E_ENTITY_OCCURRENCE_DOT' }));
    expect(() => createEntityOccurrence({
      context: {},
      dot: Dot.create('writer', 1),
      // @ts-expect-error Exercise the JavaScript boundary.
      eventId: {},
      subject: 'entry:1',
      worldline: 'events',
    })).toThrowError(expect.objectContaining({ code: 'E_ENTITY_OCCURRENCE_EVENT' }));
    expect(() => createEntityOccurrence({
      context: {},
      dot: Dot.create('writer', 1),
      eventId: new EventId(1, 'writer', 'aaaa', 0),
      subject: 'entry:1',
      worldline: '',
    })).toThrowError(expect.objectContaining({ code: 'E_VALIDATION' }));
  });
});

function occurrence(fields: {
  readonly context: Readonly<Record<string, number>>;
  readonly counter: number;
  readonly lamport: number;
  readonly patchSha: string;
  readonly subject: string;
  readonly writer?: string;
  readonly worldline?: string;
}): EntityOccurrence {
  const writer = fields.writer ?? 'writer';
  return createEntityOccurrence({
    context: fields.context,
    dot: Dot.create(writer, fields.counter),
    eventId: new EventId(fields.lamport, writer, fields.patchSha, 0),
    subject: fields.subject,
    worldline: fields.worldline ?? 'events',
  });
}
