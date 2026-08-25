import { describe, expect, it } from 'vitest';

import Intent from '../../../src/domain/api/Intent.ts';
import IntentSequence, {
  MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES,
  MAX_ATOMIC_WRITE_INTENTS,
} from '../../../src/domain/api/IntentSequence.ts';

describe('IntentSequence', () => {
  it('copies and freezes an ordered caller-owned array', () => {
    const first = Intent.addNode({ subject: 'capture:first' });
    const second = Intent.addNode({ subject: 'capture:second' });
    const input = [first, second];

    const sequence = IntentSequence.from(input);
    input.reverse();

    expect(sequence.atomic).toBe(true);
    expect(sequence.input).not.toBe(input);
    expect(sequence.intents).toEqual([first, second]);
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
    expect(() => IntentSequence.from({ kind: 'node.add' } as never)).toThrowError(
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
