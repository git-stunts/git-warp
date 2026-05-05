import { describe, it, expect } from 'vitest';
import {
  createEmptyState,
  applyOpV2,
  encodePropKey,
  encodeEdgePropKey,
} from '../../../../src/domain/services/JoinReducer.ts';
import OpValidator from '../../../../src/domain/services/OpValidator.ts';
const { RAW_KNOWN_OPS, CANONICAL_KNOWN_OPS } = OpValidator;
const isKnownRawOp = OpValidator.isKnownRaw.bind(OpValidator);
const isKnownCanonicalOp = OpValidator.isKnownCanonical.bind(OpValidator);
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';

// ---------------------------------------------------------------------------
// ADR 2 Tripwire — Op Set Membership Tests
//
// These tests verify that the raw/canonical op set split is correct and
// that the wire gate functions properly classify op types.
// ---------------------------------------------------------------------------

describe('JoinReducer op sets (ADR 2 tripwire)', () => {
  // -----------------------------------------------------------------------
  // RAW_KNOWN_OPS
  // -----------------------------------------------------------------------

  describe('RAW_KNOWN_OPS', () => {
    it('contains exactly 6 raw wire-format types', () => {
      expect(RAW_KNOWN_OPS.size).toBe(6);
      expect([...RAW_KNOWN_OPS].sort()).toEqual([
        'BlobValue', 'EdgeAdd', 'EdgeRemove', 'NodeAdd', 'NodeRemove', 'PropSet',
      ]);
    });

    it('does NOT contain canonical-only types', () => {
      expect(RAW_KNOWN_OPS.has('NodePropSet')).toBe(false);
      expect(RAW_KNOWN_OPS.has('EdgePropSet')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // CANONICAL_KNOWN_OPS
  // -----------------------------------------------------------------------

  describe('CANONICAL_KNOWN_OPS', () => {
    it('contains all 8 types (raw + canonical)', () => {
      expect(CANONICAL_KNOWN_OPS.size).toBe(8);
      expect([...CANONICAL_KNOWN_OPS].sort()).toEqual([
        'BlobValue', 'EdgeAdd', 'EdgePropSet', 'EdgeRemove',
        'NodeAdd', 'NodePropSet', 'NodeRemove', 'PropSet',
      ]);
    });

    it('is a superset of RAW_KNOWN_OPS', () => {
      for (const op of RAW_KNOWN_OPS) {
        expect(CANONICAL_KNOWN_OPS.has(op)).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // isKnownRawOp
  // -----------------------------------------------------------------------

  describe('isKnownRawOp', () => {
    it('accepts all 6 raw types', () => {
      for (const type of RAW_KNOWN_OPS) {
        expect(isKnownRawOp({ type })).toBe(true);
      }
    });

    it('rejects canonical-only NodePropSet', () => {
      expect(isKnownRawOp({ type: 'NodePropSet' })).toBe(false);
    });

    it('rejects canonical-only EdgePropSet', () => {
      expect(isKnownRawOp({ type: 'EdgePropSet' })).toBe(false);
    });

    it('rejects unknown types', () => {
      expect(isKnownRawOp({ type: 'HyperEdgeAdd' })).toBe(false);
    });

    it('rejects null/undefined/missing type', () => {
      expect(isKnownRawOp((null))).toBe(false);
      expect(isKnownRawOp((undefined))).toBe(false);
      expect(isKnownRawOp(({} as any))).toBe(false);
      expect(isKnownRawOp(({ type: 42 } as any))).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // isKnownCanonicalOp
  // -----------------------------------------------------------------------

  describe('isKnownCanonicalOp', () => {
    it('accepts all 8 types', () => {
      for (const type of CANONICAL_KNOWN_OPS) {
        expect(isKnownCanonicalOp({ type })).toBe(true);
      }
    });

    it('accepts NodePropSet', () => {
      expect(isKnownCanonicalOp({ type: 'NodePropSet' })).toBe(true);
    });

    it('accepts EdgePropSet', () => {
      expect(isKnownCanonicalOp({ type: 'EdgePropSet' })).toBe(true);
    });

    it('rejects unknown types', () => {
      expect(isKnownCanonicalOp({ type: 'HyperEdgeAdd' })).toBe(false);
    });
  });

  // isKnownOp (deprecated) was removed in the OpValidator extraction —
  // callers now use OpValidator.isKnownRaw directly.

  // -----------------------------------------------------------------------
  // applyOpV2 accepts canonical ops internally
  // -----------------------------------------------------------------------

  describe('applyOpV2 accepts canonical ops internally', () => {
    it('applies NodePropSet', () => {
      const state = createEmptyState();
      const dot = Dot.create('w1', 1);
      const addEid = new EventId(1, 'w1', 'a'.repeat(40), 0);
      const propEid = new EventId(2, 'w1', 'b'.repeat(40), 0);
      applyOpV2(state, { type: 'NodeAdd', node: 'x', dot }, addEid);
      applyOpV2(state, { type: 'NodePropSet', node: 'x', key: 'color', value: 'blue' }, propEid);

      // Property was set — check the prop map
      expect(state.prop.has(encodePropKey('x', 'color'))).toBe(true);
    });

    it('applies EdgePropSet', () => {
      const state = createEmptyState();
      const dot = Dot.create('w1', 1);
      const addEid = new EventId(1, 'w1', 'a'.repeat(40), 0);
      const propEid = new EventId(2, 'w1', 'b'.repeat(40), 0);
      applyOpV2(state, { type: 'NodeAdd', node: 'a', dot }, addEid);
      applyOpV2(state, { type: 'NodeAdd', node: 'b', dot }, addEid);
      applyOpV2(state, { type: 'EdgeAdd', from: 'a', to: 'b', label: 'rel', dot }, addEid);
      applyOpV2(state, { type: 'EdgePropSet', from: 'a', to: 'b', label: 'rel', key: 'weight', value: 0.5 }, propEid);

      // Edge property was set — check the prop map
      expect(state.prop.has(encodeEdgePropKey('a', 'b', 'rel', 'weight'))).toBe(true);
    });
  });
});
