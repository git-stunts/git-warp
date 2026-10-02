import { describe, expect, it, vi } from 'vitest';
import * as canonical from '../../../src/domain/utils/canonicalStringify.ts';

import Intent from '../../../src/domain/api/Intent.ts';
import InlineBinaryBudget from '../../../src/domain/types/InlineBinaryBudget.ts';
import IntentSequence, {
  MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES,
  MAX_ATOMIC_WRITE_INTENTS,
} from '../../../src/domain/api/IntentSequence.ts';

describe('IntentSequence', () => {
  it('refuses oversized text before canonical serialization', () => {
    const requested = Intent.setProperty({ subject: 'n', key: 'p', value: '\u0000'.repeat(4 * 1024 * 1024) });
    const encode = vi.spyOn(canonical, 'canonicalStringify');
    try {
      expect(() => IntentSequence.from([requested])).toThrowError(
        expect.objectContaining({ code: 'E_INTENT_SEQUENCE_SIZE' }),
      );
      expect(encode).not.toHaveBeenCalled();
    } finally {
      encode.mockRestore();
    }
  });

  it('refuses nested oversized descriptors before allocating another property snapshot', () => {
    const requested = Intent.setProperty({ subject: 'n', key: 'p', value: { nested: ['\u0000'.repeat(4 * 1024 * 1024)] } });
    const snapshot = vi.spyOn(InlineBinaryBudget, 'copy');
    try {
      expect(() => IntentSequence.from([requested])).toThrowError(
        expect.objectContaining({ code: 'E_INTENT_SEQUENCE_SIZE' }),
      );
      expect(snapshot).not.toHaveBeenCalled();
    } finally {
      snapshot.mockRestore();
    }
  });

  it('counts the actual descriptor returned by an Intent subclass', () => {
    class SubstitutedDescriptorIntent extends Intent {
      override get descriptor() {
        return Intent.setProperty({ subject: 'n', key: 'p', value: 'x'.repeat(MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES) }).descriptor;
      }
    }
    const requested = new SubstitutedDescriptorIntent({ kind: 'node.add', subject: 'n' });
    expect(() => IntentSequence.from([requested])).toThrowError(
      expect.objectContaining({ code: 'E_INTENT_SEQUENCE_SIZE' }),
    );
  });

  it('admits the exact byte limit and refuses one additional ASCII byte', () => {
    const empty = Intent.setProperty({ subject: 'n', key: 'p', value: '' });
    const overhead = new TextEncoder().encode(canonical.canonicalStringify({
      kind: 'intent.sequence', intents: [empty.descriptor],
    })).byteLength;
    const atLimit = Intent.setProperty({ subject: 'n', key: 'p', value: 'x'.repeat(MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES - overhead) });
    expect(IntentSequence.from([atLimit]).intents).toEqual([atLimit]);
    const overLimit = Intent.setProperty({ subject: 'n', key: 'p', value: 'x'.repeat(MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES - overhead + 1) });
    expect(() => IntentSequence.from([overLimit])).toThrowError(expect.objectContaining({ code: 'E_INTENT_SEQUENCE_SIZE' }));
  });

  it('counts multibyte and escaped nested values exactly at the aggregate limit', () => {
    const first = Intent.addNode({ subject: 'n' });
    const make = (body: string) => Intent.setProperty({ subject: 'n', key: 'p', value: { nested: [body] } });
    const overhead = new TextEncoder().encode(canonical.canonicalStringify({
      kind: 'intent.sequence', intents: [first.descriptor, make('').descriptor],
    })).byteLength;
    const chunk = 'é😀\u0000"\\';
    const chunkBytes = new TextEncoder().encode(canonical.canonicalStringify(chunk)).byteLength - 2;
    const remaining = MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES - overhead;
    const value = chunk.repeat(Math.floor(remaining / chunkBytes)) + 'x'.repeat(remaining % chunkBytes);
    const admitted = IntentSequence.from([first, make(value)]);
    expect(new TextEncoder().encode(canonical.canonicalStringify(admitted.descriptor)).byteLength).toBe(MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES);
    expect(() => IntentSequence.from([first, make(value + 'x')])).toThrowError(
      expect.objectContaining({ code: 'E_INTENT_SEQUENCE_SIZE' }),
    );
  });

  it('admits maximum cardinality without changing canonical descriptor bytes', () => {
    const repeated = Intent.addNode({ subject: 'n' });
    const input = Array.from({ length: MAX_ATOMIC_WRITE_INTENTS }, () => repeated);
    const sequence = IntentSequence.from(input);
    expect(sequence.intents).toHaveLength(MAX_ATOMIC_WRITE_INTENTS);
    expect(canonical.canonicalStringify(sequence.descriptor)).toBe(canonical.canonicalStringify({
      kind: 'intent.sequence', intents: input.map(({ descriptor }) => descriptor),
    }));
  });

  it('copies and freezes an ordered caller-owned array', () => {
    const first = Intent.addNode({ subject: 'capture:first' });
    const second = Intent.addNode({ subject: 'capture:second' });
    const input = [first, second];

    const sequence = IntentSequence.from(input);
    input.reverse();

    expect(sequence.atomic).toBe(true);
    expect(sequence.input).not.toBe(input);
    expect(sequence.intents).toEqual([first, second]);
    expect(IntentSequence.snapshot(input)).toEqual([second, first]);
    expect(Object.isFrozen(sequence.input)).toBe(true);
    expect(Object.isFrozen(sequence.intents)).toBe(true);
    expect(IntentSequence.from(sequence.input)).toBe(sequence);
  });

  it('keeps singular Intent descriptors backward compatible', () => {
    const singular = Intent.addNode({ subject: 'capture:first' });
    const sequence = IntentSequence.from(singular);

    expect(sequence.atomic).toBe(false);
    expect(sequence.input).toBe(singular);
    expect(sequence.descriptor).toEqual(singular.descriptor);
  });

  it('rejects empty and malformed arrays before delegation', () => {
    expect(() => IntentSequence.from(
      // @ts-expect-error Exercise the JavaScript boundary.
      { kind: 'node.add' },
    )).toThrowError(
      expect.objectContaining({ code: 'E_INTENT_SEQUENCE_INPUT' }),
    );
    expect(() => IntentSequence.from([])).toThrowError(
      expect.objectContaining({ code: 'E_INTENT_SEQUENCE_EMPTY' }),
    );
    expect(() => IntentSequence.from([
      Intent.addNode({ subject: 'capture:first' }),
      // @ts-expect-error Exercise the JavaScript boundary.
      { kind: 'node.add' },
    ])).toThrowError(expect.objectContaining({ code: 'E_INTENT_SEQUENCE_MEMBER' }));
  });

  it('rejects arrays above the explicit Intent cardinality limit', () => {
    const repeated = Intent.addNode({ subject: 'capture:repeated' });
    const oversized = Array.from(
      { length: MAX_ATOMIC_WRITE_INTENTS + 1 },
      () => repeated,
    );

    expect(() => IntentSequence.from(oversized)).toThrowError(
      expect.objectContaining({ code: 'E_INTENT_SEQUENCE_CARDINALITY' }),
    );
  });

  it('rejects arrays above the explicit canonical descriptor byte limit', () => {
    const oversizedValue = 'x'.repeat(MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES);
    const oversized = Intent.setProperty({
      subject: 'capture:first',
      key: 'body',
      value: oversizedValue,
    });

    expect(() => IntentSequence.from([oversized])).toThrowError(
      expect.objectContaining({ code: 'E_INTENT_SEQUENCE_SIZE' }),
    );
  });
});
