import { describe, expect, it, vi } from 'vitest';
import Intent, { type IntentDescriptor } from '../../../src/domain/api/Intent.ts';
import IntentSequence from '../../../src/domain/api/IntentSequence.ts';
import AtomicDescriptorByteBudgetReader, {
  MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES,
} from '../../../src/domain/api/AtomicDescriptorByteBudgetReader.ts';
import type { PropValue } from '../../../src/domain/types/PropValue.ts';
import * as canonical from '../../../src/domain/utils/canonicalStringify.ts';

class SubstitutedIntent extends Intent {
  readonly #supplied: IntentDescriptor;

  constructor(descriptor: IntentDescriptor) {
    super({ kind: 'node.add', subject: 'n' });
    this.#supplied = descriptor;
  }

  override get descriptor(): IntentDescriptor { return this.#supplied; }
}

function property(value: PropValue): IntentDescriptor {
  return { kind: 'property.set', subject: 'n', key: 'payload', value };
}

function byteCount(descriptor: IntentDescriptor): number {
  return new TextEncoder().encode(canonical.canonicalStringify({ kind: 'intent.sequence', intents: [descriptor] })).byteLength;
}

function assertOracle(descriptor: IntentDescriptor): void {
  const budget = new AtomicDescriptorByteBudgetReader();
  budget.include(descriptor);
  expect(MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES - budget.remainingBytes).toBe(byteCount(descriptor));
}

describe('Atomic descriptor substitutions', () => {
  it('refuses oversized enumerable binary metadata before canonical allocation', () => {
    const value = new Uint8Array(0);
    Object.defineProperty(value, 'extra', { value: 'x'.repeat(MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES), enumerable: true });
    const requested = new SubstitutedIntent(property(value));
    const encode = vi.spyOn(canonical, 'canonicalStringify');
    try {
      expect(() => IntentSequence.from([requested])).toThrowError(expect.objectContaining({ code: 'E_INTENT_SEQUENCE_SIZE' }));
      expect(encode).not.toHaveBeenCalled();
    } finally { encode.mockRestore(); }
  });

  it('counts actual binary own keys instead of an overridable length', () => {
    const value = new Uint8Array([0, 255]);
    Object.defineProperty(value, 'length', { value: 0, enumerable: true });
    Object.defineProperty(value, 'extra', { value: ['é😀', { nested: true }], enumerable: true });
    Object.defineProperty(value, 'hidden', { value: 'not encoded', enumerable: false });
    assertOracle(property(value));
  });

  it('never reads a non-enumerable shadowing binary length getter', () => {
    const value = new Uint8Array([1]);
    const length = vi.fn(() => { throw new Error('shadowing length must not be read'); });
    Object.defineProperty(value, 'length', { get: length });
    expect(IntentSequence.from([new SubstitutedIntent(property(value))]).atomic).toBe(true);
    expect(length).not.toHaveBeenCalled();
    assertOracle(property(value));
  });

  it('admits a small returned descriptor even when the private constructor snapshot is oversized', () => {
    class ShrinkingIntent extends Intent {
      override get descriptor(): IntentDescriptor { return { kind: 'node.add', subject: 'n' }; }
    }
    const requested = new ShrinkingIntent(property('x'.repeat(MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES)));
    const sequence = IntentSequence.from([requested]);
    expect(byteCount(requested.descriptor)).toBe(72);
    expect(sequence.descriptor).toEqual({ kind: 'intent.sequence', intents: [requested.descriptor] });
  });

  it('counts sparse array holes exactly at the admission boundary', () => {
    const value = new Array<PropValue>(10);
    assertOracle(property(value));
    const empty = new Array<PropValue>(10);
    empty.push('');
    const overhead = byteCount(property(empty));
    const sparse = new Array<PropValue>(10);
    sparse.push('x'.repeat(MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES - overhead));
    const descriptor = property(sparse);
    expect(byteCount(descriptor)).toBeLessThanOrEqual(MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES);
    expect(IntentSequence.from([new SubstitutedIntent(descriptor)]).atomic).toBe(true);
  });

  it('includes inherited array slots while omitting absent slots', () => {
    const value = new Array<PropValue>(3);
    Object.setPrototypeOf(value, Object.assign(Object.create(Array.prototype), { 1: 'inherited' }));
    assertOracle(property(value));
  });

  it('matches omitted object members and explicit nullish array members', () => {
    const descriptor = property([]);
    Object.defineProperties(descriptor, {
      absent: { value: undefined, enumerable: true },
      callable: { value: () => 1, enumerable: true },
      symbolic: { value: Symbol('omitted'), enumerable: true },
    });
    const values: (undefined | (() => number) | symbol)[] = [];
    values.push(undefined, () => 1, Symbol('null'));
    Object.defineProperty(descriptor, 'value', { value: values, enumerable: true });
    assertOracle(descriptor);
  });

  it('preserves the canonical encoder failure for a substituted BigInt', () => {
    const descriptor = property(null);
    Object.defineProperty(descriptor, 'value', { value: 1n, enumerable: true });
    expect(() => byteCount(descriptor)).toThrowError(TypeError);
    expect(() => IntentSequence.from([new SubstitutedIntent(descriptor)])).toThrowError(TypeError);
  });

  it('rereads selected accessor values before admitting an oversized second value', () => {
    const value = {};
    let reads = 0;
    Object.defineProperty(value, 'payload', {
      enumerable: true,
      get: () => { reads += 1; return reads === 1 ? '' : 'x'.repeat(MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES); },
    });
    expect(() => IntentSequence.from([new SubstitutedIntent(property(value))])).toThrowError(
      expect.objectContaining({ code: 'E_INTENT_SEQUENCE_SIZE' }),
    );
    expect(reads).toBe(2);
  });

  it('selects accessors in enumeration order and rereads them in canonical sorted order', () => {
    const reads: string[] = [];
    const value = {};
    Object.defineProperties(value, {
      z: { enumerable: true, get: () => { reads.push('z'); return 'é'; } },
      a: { enumerable: true, get: () => { reads.push('a'); return 'x'; } },
    });
    const descriptor = property(value);
    const budget = new AtomicDescriptorByteBudgetReader();
    budget.include(descriptor);
    expect(reads).toEqual(['z', 'a', 'a', 'z']);
    reads.length = 0;
    expect(MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES - budget.remainingBytes).toBe(byteCount(descriptor));
    expect(reads).toEqual(['z', 'a', 'a', 'z']);
  });

  it('refuses impossible native binary size before enumerating its keys', () => {
    const value = new Uint8Array(MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES);
    Object.defineProperty(value, 'length', { value: 0 });
    const own = vi.spyOn(Object, 'hasOwn');
    try {
      expect(() => IntentSequence.from([new SubstitutedIntent(property(value))])).toThrowError(
        expect.objectContaining({ code: 'E_INTENT_SEQUENCE_SIZE' }),
      );
      expect(own.mock.calls.some(([visited]) => visited === value)).toBe(false);
    } finally { own.mockRestore(); }
  });

  it('preserves typed cycle failure and restores preview state for retry', () => {
    const cyclic: { [key: string]: PropValue } = {};
    cyclic['self'] = cyclic;
    const descriptor = property(cyclic);
    expect(() => IntentSequence.from([new SubstitutedIntent(descriptor)])).toThrowError(
      expect.objectContaining({ code: 'E_CIRCULAR_REFERENCE' }),
    );
    const budget = new AtomicDescriptorByteBudgetReader();
    const before = budget.remainingBytes;
    expect(() => budget.preview(descriptor)).toThrowError(expect.objectContaining({ code: 'E_CIRCULAR_REFERENCE' }));
    expect(budget.remainingBytes).toBe(before);
    const shared = { leaf: ['é', true] };
    const retry = property([shared, shared]);
    budget.preview(retry);
    budget.include(retry);
    expect(MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES - budget.remainingBytes).toBe(byteCount(retry));
  });
});
