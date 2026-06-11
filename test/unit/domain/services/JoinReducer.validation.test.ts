/**
 * JoinReducer validation tests (C2/C3).
 *
 * C2: Unknown op type fails closed in reducePatches().
 * C2: Empty ops array doesn't crash.
 * C3: Receipt path with malformed ops — now throws PatchError with E_PATCH_MALFORMED.
 */

import { describe, it, expect } from 'vitest';
import {
  createEmptyState,
  applyPatchOp,
  reducePatches as _reducePatches,
} from '../../../../src/domain/services/JoinReducer.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import PatchError from '../../../../src/domain/errors/PatchError.ts';

const reducePatches = (_reducePatches) as (...args: any[]) => any;

const makePatchEntry = (/** @type {any[]} */ ops) => ({
  patch: {
    schema: 2,
    writer: 'w1',
    lamport: 1,
    context: new Map(),
    ops,
    reads: [],
    writes: [],
  },
  sha: 'a'.repeat(40),
});

describe('JoinReducer validation', () => {
  describe('C2 — unknown op types', () => {
    it('throws PatchError for unknown op type in applyPatchOp', () => {
      const state = createEmptyState();
      const eventId = new EventId(1, 'w1', 'a'.repeat(40), 0);

      expect(() => {
        applyPatchOp(state, { type: 'FutureOp' }, eventId);
      }).toThrow(PatchError);

      expect([...state.nodeAlive.elements()]).toHaveLength(0);
    });

    it('throws PatchError for unknown op type in reducePatches', () => {
      const entry = makePatchEntry([
        { type: 'NodeAdd', node: 'node:a', dot: Dot.create('w1', 1) },
        { type: 'UnknownFutureOp', payload: {} },
      ]);

      expect(() => reducePatches([entry])).toThrow(PatchError);
    });
  });

  describe('C2 — empty ops array', () => {
    it('reducePatches with empty ops array produces empty state', () => {
      const entry = makePatchEntry([]);
      const state = reducePatches([entry]);

      expect([...state.nodeAlive.elements()]).toHaveLength(0);
      expect(state.prop.size).toBe(0);
    });

    it('reducePatches with zero patches produces empty state', () => {
      const state = reducePatches([]);

      expect([...state.nodeAlive.elements()]).toHaveLength(0);
      expect(state.prop.size).toBe(0);
    });
  });

  describe('C3 — malformed op runtime guards', () => {
    it('throws PatchError for NodeAdd missing dot', () => {
      const entry = makePatchEntry([
        { type: 'NodeAdd', node: 'node:a' /* missing dot */ },
      ]);

      expect(() => reducePatches([entry], undefined, { receipts: true })).toThrow(PatchError);
      try {
        reducePatches([entry], undefined, { receipts: true });
      } catch (err) {
        expect((err as any).code).toBe('E_PATCH_MALFORMED');
      }
    });

    it('throws PatchError for NodeAdd missing node', () => {
      const entry = makePatchEntry([
        { type: 'NodeAdd', dot: Dot.create('w1', 1) /* missing node */ },
      ]);

      expect(() => reducePatches([entry], undefined, { receipts: true })).toThrow(PatchError);
      try {
        reducePatches([entry], undefined, { receipts: true });
      } catch (err) {
        expect((err as any).code).toBe('E_PATCH_MALFORMED');
      }
    });

    it('fast path also throws PatchError for malformed NodeAdd (no dot)', () => {
      const entry = makePatchEntry([
        { type: 'NodeAdd', node: 'node:a' /* missing dot */ },
      ]);

      expect(() => reducePatches([entry])).toThrow(PatchError);
      try {
        reducePatches([entry]);
      } catch (err) {
        expect((err as any).code).toBe('E_PATCH_MALFORMED');
      }
    });

    it('throws PatchError for null op', () => {
      const state = createEmptyState();
      const eventId = new EventId(1, 'w1', 'a'.repeat(40), 0);

      expect(() => applyPatchOp(state, (null as any), eventId)).toThrow(PatchError);
    });

    it('throws PatchError for null ops through all reducePatches paths', () => {
      const entry = makePatchEntry([null]);

      expect(() => reducePatches([entry])).toThrow(PatchError);
      expect(() => reducePatches([entry], undefined, { receipts: true })).toThrow(PatchError);
      expect(() => reducePatches([entry], undefined, { trackDiff: true })).toThrow(PatchError);
    });

    it('throws PatchError for op without type field', () => {
      const state = createEmptyState();
      const eventId = new EventId(1, 'w1', 'a'.repeat(40), 0);

      expect(() => applyPatchOp(state, ({ node: 'x' } as any), eventId)).toThrow(PatchError);
    });

    it('throws PatchError for op with non-string type', () => {
      const state = createEmptyState();
      const eventId = new EventId(1, 'w1', 'a'.repeat(40), 0);

      expect(() => applyPatchOp(state, ({ type: 42 } as any), eventId)).toThrow(PatchError);
    });
  });

  describe('C3 — per-op-type validation', () => {
    const state = () => createEmptyState();
    const eid = new EventId(1, 'w1', 'a'.repeat(40), 0);

    describe('NodeAdd', () => {
      it('throws when node is missing', () => {
        expect(() => applyPatchOp(state(), ({ type: 'NodeAdd', dot: Dot.create('w1', 1) } as any), eid)).toThrow(PatchError);
      });

      it('throws when node is not a string', () => {
        expect(() => applyPatchOp(state(), ({ type: 'NodeAdd', node: 123, dot: Dot.create('w1', 1) } as any), eid)).toThrow(PatchError);
      });

      it('throws when dot is missing', () => {
        expect(() => applyPatchOp(state(), ({ type: 'NodeAdd', node: 'n' } as any), eid)).toThrow(PatchError);
      });

      it('throws when dot.writerId is not a string', () => {
        expect(() => applyPatchOp(state(), ({ type: 'NodeAdd', node: 'n', dot: { writerId: 1, counter: 1 } } as any), eid)).toThrow(PatchError);
      });

      it('throws when dot.counter is not a number', () => {
        expect(() => applyPatchOp(state(), ({ type: 'NodeAdd', node: 'n', dot: { writerId: 'w', counter: 'x' } } as any), eid)).toThrow(PatchError);
      });
    });

    describe('NodeRemove', () => {
      it('throws when observedDots is missing', () => {
        expect(() => applyPatchOp(state(), ({ type: 'NodeRemove', node: 'n' } as any), eid)).toThrow(PatchError);
      });

      it('throws when observedDots is not iterable', () => {
        expect(() => applyPatchOp(state(), ({ type: 'NodeRemove', node: 'n', observedDots: 42 } as any), eid)).toThrow(PatchError);
        expect(() => applyPatchOp(state(), ({ type: 'NodeRemove', node: 'n', observedDots: {} } as any), eid)).toThrow(PatchError);
      });

      it('accepts Set as observedDots', () => {
        expect(() => applyPatchOp(state(), ({ type: 'NodeRemove', node: 'n', observedDots: new Set() } as any), eid)).not.toThrow();
      });

      it('accepts NodeRemove without node field (informational only)', () => {
        expect(() => applyPatchOp(state(), ({ type: 'NodeRemove', observedDots: [] } as any), eid)).not.toThrow();
      });
    });

    describe('EdgeAdd', () => {
      it('throws when from is missing', () => {
        expect(() => applyPatchOp(state(), ({ type: 'EdgeAdd', to: 'b', label: 'l', dot: Dot.create('w', 1) } as any), eid)).toThrow(PatchError);
      });

      it('throws when to is missing', () => {
        expect(() => applyPatchOp(state(), ({ type: 'EdgeAdd', from: 'a', label: 'l', dot: Dot.create('w', 1) } as any), eid)).toThrow(PatchError);
      });

      it('throws when label is missing', () => {
        expect(() => applyPatchOp(state(), ({ type: 'EdgeAdd', from: 'a', to: 'b', dot: Dot.create('w', 1) } as any), eid)).toThrow(PatchError);
      });

      it('throws when dot is missing', () => {
        expect(() => applyPatchOp(state(), ({ type: 'EdgeAdd', from: 'a', to: 'b', label: 'l' } as any), eid)).toThrow(PatchError);
      });
    });

    describe('EdgeRemove', () => {
      it('throws when observedDots is missing', () => {
        expect(() => applyPatchOp(state(), ({ type: 'EdgeRemove', from: 'a', to: 'b', label: 'l' } as any), eid)).toThrow(PatchError);
      });

      it('throws when observedDots is not iterable', () => {
        expect(() => applyPatchOp(state(), ({ type: 'EdgeRemove', from: 'a', to: 'b', label: 'l', observedDots: 42 } as any), eid)).toThrow(PatchError);
        expect(() => applyPatchOp(state(), ({ type: 'EdgeRemove', from: 'a', to: 'b', label: 'l', observedDots: {} } as any), eid)).toThrow(PatchError);
      });

      it('accepts Set as observedDots', () => {
        expect(() => applyPatchOp(state(), ({ type: 'EdgeRemove', from: 'a', to: 'b', label: 'l', observedDots: new Set() } as any), eid)).not.toThrow();
      });

      it('accepts EdgeRemove without from/to/label (informational only)', () => {
        expect(() => applyPatchOp(state(), ({ type: 'EdgeRemove', observedDots: [] } as any), eid)).not.toThrow();
      });
    });

    describe('PropSet', () => {
      it('throws when node is missing', () => {
        expect(() => applyPatchOp(state(), ({ type: 'PropSet', key: 'k', value: 'v' } as any), eid)).toThrow(PatchError);
      });

      it('throws when key is missing', () => {
        expect(() => applyPatchOp(state(), ({ type: 'PropSet', node: 'n', value: 'v' } as any), eid)).toThrow(PatchError);
      });
    });

    describe('fail-closed op recognition', () => {
      it('BlobValue does NOT throw', () => {
        expect(() => applyPatchOp(state(), ({ type: 'BlobValue', oid: 'abc' } as any), eid)).not.toThrow();
      });

      it('unknown type throws', () => {
        expect(() => applyPatchOp(state(), { type: 'FutureOpV99' }, eid)).toThrow(PatchError);
      });
    });
  });
});
