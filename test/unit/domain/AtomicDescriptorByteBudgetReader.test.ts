import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import Intent from '../../../src/domain/api/Intent.ts';
import AtomicDescriptorByteBudgetReader, {
  MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES,
} from '../../../src/domain/api/AtomicDescriptorByteBudgetReader.ts';
import StagedContent from '../../../src/domain/api/StagedContent.ts';
import { canonicalStringify } from '../../../src/domain/utils/canonicalStringify.ts';
import { isPropValue, type PropValue } from '../../../src/domain/types/PropValue.ts';

function sequenceBytes(intents: readonly Intent[]): number {
  return new TextEncoder().encode(canonicalStringify({
    kind: 'intent.sequence', intents: intents.map(({ descriptor }) => descriptor),
  })).byteLength;
}

function assertOracle(intents: readonly Intent[]): void {
  const budget = new AtomicDescriptorByteBudgetReader();
  for (const intent of intents) { budget.include(intent.descriptor); }
  expect(MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES - budget.remainingBytes).toBe(sequenceBytes(intents));
  expect(Object.isFrozen(budget)).toBe(true);
}

function property(value: PropValue): Intent {
  return Intent.setProperty({ subject: 'n', key: 'p', value });
}

describe('AtomicDescriptorByteBudgetReader', () => {
  it.each([null, true, false, 0, -0, 1e30, -1e-30, NaN, Infinity, -Infinity])(
    'counts canonical scalar %s', (value) => { assertOracle([property(value)]); },
  );

  it('counts every UTF-16 code unit, including surrogate boundaries and escapes', () => {
    const units = Array.from({ length: 65536 }, (_, code) => String.fromCharCode(code)).join('');
    assertOracle([property(units), property('\ud800\udc00\udbff\udfff\udc00\ud800é😀\b\t\n\f\r"\\')]);
  });

  it('counts nested arrays, objects, binary index keys and empty containers', () => {
    assertOracle([property({
      'é😀\n': [null, {}, [], [new Uint8Array(0), new Uint8Array([0, 9, 10, 99, 100, 255])]],
      negative: -0,
    }), property(new Uint8Array(1024))]);
  });

  it('omits absent and inherited object members just as the canonical encoder does', () => {
    const descriptor = { ...Intent.addNode({ subject: 'n' }).descriptor };
    Object.defineProperty(descriptor, 'omitted', { value: undefined, enumerable: true });
    Object.setPrototypeOf(descriptor, { inherited: 'never encoded' });
    const budget = new AtomicDescriptorByteBudgetReader();
    budget.include(descriptor);
    const oracle = new TextEncoder().encode(canonicalStringify({ kind: 'intent.sequence', intents: [descriptor] }));
    expect(MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES - budget.remainingBytes).toBe(oracle.byteLength);
  });

  it('counts staged content metadata without changing its canonical identity', () => {
    const content = new StagedContent({ id: 'sha256:staged', mime: 'application/octet-stream', size: 1234 });
    assertOracle([
      Intent.attachNodeContent({ subject: 'n', content }),
      Intent.attachEdgeContent({ from: 'a', to: 'b', label: 'é', content }),
      Intent.attachNodeContent({ subject: 'n', content: new StagedContent({ id: 'id', mime: null, size: 0 }) }),
    ]);
  });

  it('counts every Intent descriptor variant and entity key escaping', () => {
    assertOracle([
      Intent.addNode({ subject: 'n' }), Intent.removeNode({ subject: 'n' }),
      Intent.addEdge({ from: 'a', to: 'b', label: 'l' }), Intent.removeEdge({ from: 'a', to: 'b', label: 'l' }),
      Intent.clearNodeContent({ subject: 'n' }), Intent.clearEdgeContent({ from: 'a', to: 'b', label: 'l' }),
      Intent.addEntity({ subject: 'n', properties: { 'é\u0000': ['nested', true] } }),
      Intent.addEntityAuto({ namespace: 'ns', properties: { p: null } }),
    ]);
  });

  it('matches an independent eager oracle on generated nested data', () => {
    fc.assert(fc.property(fc.jsonValue().filter(isPropValue), (value) => { assertOracle([property(value)]); }), {
      seed: 916, numRuns: 500,
    });
  });

  it('charges many small values to one aggregate budget', () => {
    const requested = property('x'.repeat(400));
    const budget = new AtomicDescriptorByteBudgetReader();
    let admitted = 0;
    try {
      for (; admitted < 50000; admitted += 1) { budget.include(requested.descriptor); }
    } catch (error) {
      expect(error).toMatchObject({ code: 'E_INTENT_SEQUENCE_SIZE' });
    }
    expect(admitted).toBeGreaterThan(1);
    expect(admitted).toBeLessThan(50000);
    expect(sequenceBytes(Array.from({ length: admitted }, () => requested))).toBeLessThanOrEqual(MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES);
    expect(sequenceBytes(Array.from({ length: admitted + 1 }, () => requested))).toBeGreaterThan(MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES);
  });
});
