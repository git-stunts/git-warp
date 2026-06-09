import { describe, expect, it } from 'vitest';
import VersionVector from '../../../../../src/domain/crdt/VersionVector.ts';
import { normalizePatch, type DecodedPatch } from '../../../../../src/domain/services/sync/syncPatchLoader.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';

describe('syncPatchLoader', () => {
  describe('normalizePatch', () => {
    it('materializes a Patch when context is already a VersionVector', () => {
      const context = VersionVector.empty();
      context.set('writer-0', 1);
      const decoded = {
        schema: 2,
        writer: 'writer-1',
        lamport: 1,
        context,
        ops: [],
        reads: ['node:a'],
        writes: ['node:b'],
      } satisfies DecodedPatch;

      const normalized = normalizePatch(decoded);

      expect(normalized).toBeInstanceOf(Patch);
      expect(normalized).not.toBe(decoded);
      expect(Object.isFrozen(normalized)).toBe(true);
      if (!(normalized instanceof Patch) || !(normalized.context instanceof VersionVector)) {
        expect.fail('normalized patch should carry cloned VersionVector context');
      }
      context.set('writer-0', 2);
      expect(normalized.context.get('writer-0')).toBe(1);
    });
  });
});
