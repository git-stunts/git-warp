import { describe, it, expect } from 'vitest';
import { normalizeRawOp, lowerCanonicalOp } from '../../../../src/domain/services/OpNormalizer.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';
import NodePropSet from '../../../../src/domain/types/ops/NodePropSet.ts';
import EdgePropSet from '../../../../src/domain/types/ops/EdgePropSet.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.ts';
import EdgeRemove from '../../../../src/domain/types/ops/EdgeRemove.ts';
import BlobValue from '../../../../src/domain/types/ops/BlobValue.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { encodePropKey, encodeEdgePropKey, encodeLegacyEdgePropNode, EDGE_PROP_PREFIX } from '../../../../src/domain/services/KeyCodec.js';

// ============================================================================
// ADR 1 Test Cases
//
// Field accesses on union-typed return values use discriminated-union
// narrowing via `op.type === 'X'`. Op.type is a literal type on each
// subclass (see domain/types/ops/Op.ts), so TypeScript narrows the
// union to the single matching subclass inside the if-block.
// ============================================================================

describe('OpNormalizer', () => {
  describe('normalizeRawOp', () => {
    it('A1-T01: normalizes legacy edge-property PropSet to EdgePropSet', () => {
      const raw = new PropSet('\x01alice\0bob\0follows', 'weight', 0.9);

      const canonical = normalizeRawOp(raw);

      expect(canonical.type).toBe('EdgePropSet');
      if (canonical.type === 'EdgePropSet') {
        expect(canonical.from).toBe('alice');
        expect(canonical.to).toBe('bob');
        expect(canonical.label).toBe('follows');
        expect(canonical.key).toBe('weight');
        expect(canonical.value).toBe(0.9);
      }
    });

    it('A1-T02: normalizes plain PropSet to NodePropSet', () => {
      const raw = new PropSet('alice', 'color', 'blue');

      const canonical = normalizeRawOp(raw);

      expect(canonical.type).toBe('NodePropSet');
      if (canonical.type === 'NodePropSet') {
        expect(canonical.node).toBe('alice');
        expect(canonical.key).toBe('color');
        expect(canonical.value).toBe('blue');
      }
    });

    it('passes through NodeAdd unchanged', () => {
      const op = new NodeAdd('x', new Dot('w', 1));
      expect(normalizeRawOp(op)).toBe(op);
    });

    it('passes through EdgeAdd unchanged', () => {
      const op = new EdgeAdd({ from: 'a', to: 'b', label: 'rel', dot: new Dot('w', 1) });
      expect(normalizeRawOp(op)).toBe(op);
    });

    it('passes through NodeRemove unchanged', () => {
      const op = new NodeRemove('x', ['w:1']);
      expect(normalizeRawOp(op)).toBe(op);
    });

    it('passes through EdgeRemove unchanged', () => {
      const op = new EdgeRemove({ from: 'a', to: 'b', label: 'rel', observedDots: ['w:1'] });
      expect(normalizeRawOp(op)).toBe(op);
    });

    it('passes through BlobValue unchanged', () => {
      const op = new BlobValue('x', 'abc123');
      expect(normalizeRawOp(op)).toBe(op);
    });
  });

  describe('lowerCanonicalOp', () => {
    it('A1-T03: lowers EdgePropSet to raw PropSet with legacy node encoding', () => {
      const canonical = new EdgePropSet({ from: 'alice', to: 'bob', label: 'follows', key: 'weight', value: 0.9 });

      const raw = lowerCanonicalOp(canonical);

      expect(raw.type).toBe('PropSet');
      if (raw.type === 'PropSet') {
        expect(raw.node).toBe('\x01alice\0bob\0follows');
        expect(raw.key).toBe('weight');
        expect(raw.value).toBe(0.9);
      }
    });

    it('lowers NodePropSet to raw PropSet', () => {
      const canonical = new NodePropSet('alice', 'color', 'blue');

      const raw = lowerCanonicalOp(canonical);

      expect(raw.type).toBe('PropSet');
      if (raw.type === 'PropSet') {
        expect(raw.node).toBe('alice');
        expect(raw.key).toBe('color');
        expect(raw.value).toBe('blue');
      }
    });

    it('passes through NodeAdd unchanged', () => {
      const op = new NodeAdd('x', new Dot('w', 1));
      expect(lowerCanonicalOp(op)).toBe(op);
    });

    it('passes through EdgeAdd unchanged', () => {
      const op = new EdgeAdd({ from: 'a', to: 'b', label: 'rel', dot: new Dot('w', 1) });
      expect(lowerCanonicalOp(op)).toBe(op);
    });

    it('passes through BlobValue unchanged', () => {
      const op = new BlobValue('x', 'abc123');
      expect(lowerCanonicalOp(op)).toBe(op);
    });
  });

  describe('round-trip stability', () => {
    it('A1-T04: normalize then lower returns original raw edge-property op', () => {
      const raw = new PropSet(
        `${EDGE_PROP_PREFIX}alice\0bob\0follows`,
        'weight',
        0.9,
      );

      const canonical = normalizeRawOp(raw);
      const roundTripped = lowerCanonicalOp(canonical);

      expect(roundTripped).toEqual(raw);
    });

    it('A1-T04: normalize then lower returns original raw node property op', () => {
      const raw = new PropSet('alice', 'color', 'blue');

      const canonical = normalizeRawOp(raw);
      const roundTripped = lowerCanonicalOp(canonical);

      expect(roundTripped).toEqual(raw);
    });

    it('round-trips edge prop with complex value', () => {
      const raw = new PropSet(
        encodeLegacyEdgePropNode('user:alice', 'user:bob', 'follows'),
        'meta',
        { nested: true, arr: [1, 2, 3] },
      );

      const canonical = normalizeRawOp(raw);
      expect(canonical.type).toBe('EdgePropSet');

      const roundTripped = lowerCanonicalOp(canonical);
      expect(roundTripped).toEqual(raw);
    });

    it('round-trip with many different identifier patterns', () => {
      const cases: ReadonlyArray<readonly [string, string, string, string, string, unknown]> = [
        ['simple', 'x', 'y', 'rel', 'key', 'val'],
        ['namespaced', 'user:alice', 'doc:123', 'authored', 'date', '2025-01-01'],
        ['UUIDs', 'abc-def', '123-456', 'edge-label', 'prop-key', 42],
        ['unicode', 'café', 'naïve', 'résumé', 'über', true],
      ];

      for (const [, from, to, label, key, value] of cases) {
        const raw = new PropSet(encodeLegacyEdgePropNode(from, to, label), key, value);
        const roundTripped = lowerCanonicalOp(normalizeRawOp(raw));
        expect(roundTripped).toEqual(raw);
      }
    });
  });

  describe('encoded key identity', () => {
    it('A1-T05: encodePropKey(legacyEdgePropNode, key) === encodeEdgePropKey(from, to, label, key)', () => {
      const from = 'alice';
      const to = 'bob';
      const label = 'follows';
      const key = 'weight';

      const viaLegacy = encodePropKey(encodeLegacyEdgePropNode(from, to, label), key);
      const viaDirect = encodeEdgePropKey(from, to, label, key);

      expect(viaLegacy).toBe(viaDirect);
    });
  });
});
