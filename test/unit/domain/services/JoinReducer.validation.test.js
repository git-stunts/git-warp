/**
 * JoinReducer validation tests (C2/C3).
 *
 * C2: Unknown op type is silently ignored in reduceV5() — documented baseline.
 * C2: Empty ops array doesn't crash.
 * C3: Receipt path with malformed ops — now throws PatchError with E_PATCH_MALFORMED.
 */

import { describe, it, expect } from 'vitest';
import {
  createEmptyState,
  applyOpV2,
  reduceV5 as _reduceV5,
} from '../../../../src/domain/services/JoinReducer.ts';
import { createEventId } from '../../../../src/domain/utils/EventId.ts';
import { createDot } from '../../../../src/domain/crdt/Dot.ts';
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import PatchError from '../../../../src/domain/errors/PatchError.ts';

/** @type {(...args: any[]) => any} */
const reduceV5 = _reduceV5;

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
    it('silently ignores unknown op type in applyOpV2', () => {
      const state = createEmptyState();
      const eventId = createEventId(1, 'w1', 'a'.repeat(40), 0);

      // Should not throw
      applyOpV2(state, /** @type {any} */ ({ type: 'FutureOp', data: 42 }), eventId);

      // State unchanged
      expect([...state.nodeAlive.elements()]).toHaveLength(0);
    });

    it('silently ignores unknown op type in reduceV5', () => {
      const entry = makePatchEntry([
        { type: 'NodeAdd', node: 'node:a', dot: createDot('w1', 1) },
        { type: 'UnknownFutureOp', payload: {} },
      ]);

      const state = reduceV5([entry]);

      // The known NodeAdd should still apply
      expect(state.nodeAlive.contains('node:a')).toBe(true);
    });
  });

  describe('C2 — empty ops array', () => {
    it('reduceV5 with empty ops array produces empty state', () => {
      const entry = makePatchEntry([]);
      const state = reduceV5([entry]);

      expect([...state.nodeAlive.elements()]).toHaveLength(0);
      expect(state.prop.size).toBe(0);
    });

    it('reduceV5 with zero patches produces empty state', () => {
      const state = reduceV5([]);

      expect([...state.nodeAlive.elements()]).toHaveLength(0);
      expect(state.prop.size).toBe(0);
    });
  });

  describe('C3 — malformed op runtime guards', () => {
    it('throws PatchError for NodeAdd missing dot', () => {
      const entry = makePatchEntry([
        { type: 'NodeAdd', node: 'node:a' /* missing dot */ },
      ]);

      expect(() => reduceV5([entry], undefined, { receipts: true })).toThrow(PatchError);
      try {
        reduceV5([entry], undefined, { receipts: true });
      } catch (/** @type {any} */ err) {
        expect(err.code).toBe('E_PATCH_MALFORMED');
      }
    });

    it('throws PatchError for NodeAdd missing node', () => {
      const entry = makePatchEntry([
        { type: 'NodeAdd', dot: createDot('w1', 1) /* missing node */ },
      ]);

      expect(() => reduceV5([entry], undefined, { receipts: true })).toThrow(PatchError);
      try {
        reduceV5([entry], undefined, { receipts: true });
      } catch (/** @type {any} */ err) {
        expect(err.code).toBe('E_PATCH_MALFORMED');
      }
    });

    it('fast path also throws PatchError for malformed NodeAdd (no dot)', () => {
      const entry = makePatchEntry([
        { type: 'NodeAdd', node: 'node:a' /* missing dot */ },
      ]);

      expect(() => reduceV5([entry])).toThrow(PatchError);
      try {
        reduceV5([entry]);
      } catch (/** @type {any} */ err) {
        expect(err.code).toBe('E_PATCH_MALFORMED');
      }
    });

    it('throws PatchError for null op', () => {
      const state = createEmptyState();
      const eventId = createEventId(1, 'w1', 'a'.repeat(40), 0);

      expect(() => applyOpV2(state, /** @type {any} */ (null), eventId)).toThrow(PatchError);
    });

    it('throws PatchError for op without type field', () => {
      const state = createEmptyState();
      const eventId = createEventId(1, 'w1', 'a'.repeat(40), 0);

      expect(() => applyOpV2(state, /** @type {any} */ ({ node: 'x' }), eventId)).toThrow(PatchError);
    });

    it('throws PatchError for op with non-string type', () => {
      const state = createEmptyState();
      const eventId = createEventId(1, 'w1', 'a'.repeat(40), 0);

      expect(() => applyOpV2(state, /** @type {any} */ ({ type: 42 }), eventId)).toThrow(PatchError);
    });
  });

  describe('C3 — per-op-type validation', () => {
    const state = () => createEmptyState();
    const eid = createEventId(1, 'w1', 'a'.repeat(40), 0);

    describe('NodeAdd', () => {
      it('throws when node is missing', () => {
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'NodeAdd', dot: createDot('w1', 1) }), eid)).toThrow(PatchError);
      });

      it('throws when node is not a string', () => {
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'NodeAdd', node: 123, dot: createDot('w1', 1) }), eid)).toThrow(PatchError);
      });

      it('throws when dot is missing', () => {
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'NodeAdd', node: 'n' }), eid)).toThrow(PatchError);
      });

      it('throws when dot.writerId is not a string', () => {
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'NodeAdd', node: 'n', dot: { writerId: 1, counter: 1 } }), eid)).toThrow(PatchError);
      });

      it('throws when dot.counter is not a number', () => {
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'NodeAdd', node: 'n', dot: { writerId: 'w', counter: 'x' } }), eid)).toThrow(PatchError);
      });
    });

    describe('NodeRemove', () => {
      it('throws when observedDots is missing', () => {
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'NodeRemove', node: 'n' }), eid)).toThrow(PatchError);
      });

      it('throws when observedDots is not iterable', () => {
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'NodeRemove', node: 'n', observedDots: 42 }), eid)).toThrow(PatchError);
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'NodeRemove', node: 'n', observedDots: {} }), eid)).toThrow(PatchError);
      });

      it('accepts Set as observedDots', () => {
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'NodeRemove', node: 'n', observedDots: new Set() }), eid)).not.toThrow();
      });

      it('accepts NodeRemove without node field (informational only)', () => {
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'NodeRemove', observedDots: [] }), eid)).not.toThrow();
      });
    });

    describe('EdgeAdd', () => {
      it('throws when from is missing', () => {
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'EdgeAdd', to: 'b', label: 'l', dot: createDot('w', 1) }), eid)).toThrow(PatchError);
      });

      it('throws when to is missing', () => {
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'EdgeAdd', from: 'a', label: 'l', dot: createDot('w', 1) }), eid)).toThrow(PatchError);
      });

      it('throws when label is missing', () => {
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'EdgeAdd', from: 'a', to: 'b', dot: createDot('w', 1) }), eid)).toThrow(PatchError);
      });

      it('throws when dot is missing', () => {
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'EdgeAdd', from: 'a', to: 'b', label: 'l' }), eid)).toThrow(PatchError);
      });
    });

    describe('EdgeRemove', () => {
      it('throws when observedDots is missing', () => {
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'EdgeRemove', from: 'a', to: 'b', label: 'l' }), eid)).toThrow(PatchError);
      });

      it('throws when observedDots is not iterable', () => {
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'EdgeRemove', from: 'a', to: 'b', label: 'l', observedDots: 42 }), eid)).toThrow(PatchError);
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'EdgeRemove', from: 'a', to: 'b', label: 'l', observedDots: {} }), eid)).toThrow(PatchError);
      });

      it('accepts Set as observedDots', () => {
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'EdgeRemove', from: 'a', to: 'b', label: 'l', observedDots: new Set() }), eid)).not.toThrow();
      });

      it('accepts EdgeRemove without from/to/label (informational only)', () => {
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'EdgeRemove', observedDots: [] }), eid)).not.toThrow();
      });
    });

    describe('PropSet', () => {
      it('throws when node is missing', () => {
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'PropSet', key: 'k', value: 'v' }), eid)).toThrow(PatchError);
      });

      it('throws when key is missing', () => {
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'PropSet', node: 'n', value: 'v' }), eid)).toThrow(PatchError);
      });
    });

    describe('forward-compat', () => {
      it('BlobValue does NOT throw', () => {
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'BlobValue', oid: 'abc' }), eid)).not.toThrow();
      });

      it('unknown type does NOT throw', () => {
        expect(() => applyOpV2(state(), /** @type {any} */ ({ type: 'FutureOpV99', data: {} }), eid)).not.toThrow();
      });
    });
  });
});
