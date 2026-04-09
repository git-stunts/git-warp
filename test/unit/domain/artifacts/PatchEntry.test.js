import { describe, it, expect } from 'vitest';
import PatchEntry from '../../../../src/domain/artifacts/PatchEntry.ts';
import ProvenanceEntry from '../../../../src/domain/artifacts/ProvenanceEntry.ts';
import Patch from '../../../../src/domain/types/Patch.ts';

/** @returns {Patch} */
function minimalPatch() {
  return new Patch({ schema: 2, writer: 'w1', lamport: 1, context: {}, ops: [] });
}

describe('PatchEntry', () => {
  it('constructs with valid fields', () => {
    const e = new PatchEntry({ patch: minimalPatch(), sha: 'a'.repeat(40) });
    expect(e).toBeInstanceOf(PatchEntry);
    expect(e.patch.schema).toBe(2);
    expect(e.sha).toBe('a'.repeat(40));
  });

  it('is frozen', () => {
    const e = new PatchEntry({ patch: minimalPatch(), sha: 'a'.repeat(40) });
    expect(Object.isFrozen(e)).toBe(true);
  });

  it('rejects null patch', () => {
    expect(() => new PatchEntry({ patch: /** @type {any} */ (null), sha: 'abc' })).toThrow('requires a patch');
  });

  it('rejects empty sha', () => {
    expect(() => new PatchEntry({ patch: minimalPatch(), sha: '' })).toThrow('non-empty sha');
  });
});

describe('ProvenanceEntry', () => {
  it('constructs with valid fields', () => {
    const e = new ProvenanceEntry({ entityId: 'user:alice', patchShas: new Set(['abc']) });
    expect(e).toBeInstanceOf(ProvenanceEntry);
    expect(e.entityId).toBe('user:alice');
    expect(e.patchShas.has('abc')).toBe(true);
  });

  it('is frozen', () => {
    const e = new ProvenanceEntry({ entityId: 'x', patchShas: new Set() });
    expect(Object.isFrozen(e)).toBe(true);
  });

  it('rejects empty entityId', () => {
    expect(() => new ProvenanceEntry({ entityId: '', patchShas: new Set() })).toThrow('non-empty entityId');
  });

  it('rejects non-Set patchShas', () => {
    expect(() => new ProvenanceEntry({ entityId: 'x', patchShas: /** @type {any} */ ([]) })).toThrow('requires a Set');
  });
});
