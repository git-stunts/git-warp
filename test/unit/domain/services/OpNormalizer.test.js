import { describe, it, expect } from 'vitest';
import { normalizeRawOp, lowerCanonicalOp } from '../../../../src/domain/services/OpNormalizer.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';
import NodePropSet from '../../../../src/domain/types/ops/NodePropSet.ts';
import EdgePropSet from '../../../../src/domain/types/ops/EdgePropSet.ts';

/** @param {string} node @param {string} key @param {unknown} value */
function createPropSetV2(node, key, value) { return new PropSet(node, key, value); }
/** @param {string} node @param {string} key @param {unknown} value */
function createNodePropSetV2(node, key, value) { return new NodePropSet(node, key, value); }
/** @param {string} from @param {string} to @param {string} label @param {string} key @param {unknown} value */
function createEdgePropSetV2(from, to, label, key, value) { return new EdgePropSet({ from, to, label, key, value }); }
import { encodePropKey, encodeEdgePropKey, encodeLegacyEdgePropNode, EDGE_PROP_PREFIX } from '../../../../src/domain/services/KeyCodec.js';

// ============================================================================
// ADR 1 Test Cases
// ============================================================================

describe('OpNormalizer', () => {
  // -----------------------------------------------------------------------
  // A1-T01: Normalize legacy raw edge-property op
  // -----------------------------------------------------------------------
  describe('normalizeRawOp', () => {
    it('A1-T01: normalizes legacy edge-property PropSet to EdgePropSet', () => {
      const raw = {
        type: 'PropSet',
        node: '\x01alice\0bob\0follows',
        key: 'weight',
        value: 0.9,
      };

      const canonical = normalizeRawOp(raw);

      expect(canonical).toMatchObject({
        type: 'EdgePropSet',
        from: 'alice',
        to: 'bob',
        label: 'follows',
        key: 'weight',
        value: 0.9,
      });
    });

    // A1-T02: Normalize plain node property op
    it('A1-T02: normalizes plain PropSet to NodePropSet', () => {
      const raw = {
        type: 'PropSet',
        node: 'alice',
        key: 'color',
        value: 'blue',
      };

      const canonical = normalizeRawOp(raw);

      expect(canonical.type).toBe('NodePropSet');
      expect(canonical).toMatchObject({
        type: 'NodePropSet',
        node: 'alice',
        key: 'color',
        value: 'blue',
      });
    });

    it('passes through NodeAdd unchanged', () => {
      const op = { type: 'NodeAdd', node: 'x', dot: { writerId: 'w', counter: 1 } };
      expect(normalizeRawOp(op)).toBe(op);
    });

    it('passes through EdgeAdd unchanged', () => {
      const op = { type: 'EdgeAdd', from: 'a', to: 'b', label: 'rel', dot: { writerId: 'w', counter: 1 } };
      expect(normalizeRawOp(op)).toBe(op);
    });

    it('passes through NodeRemove unchanged', () => {
      const op = { type: 'NodeRemove', node: 'x', observedDots: ['w:1'] };
      expect(normalizeRawOp(op)).toBe(op);
    });

    it('passes through EdgeRemove unchanged', () => {
      const op = { type: 'EdgeRemove', from: 'a', to: 'b', label: 'rel', observedDots: ['w:1'] };
      expect(normalizeRawOp(op)).toBe(op);
    });

    it('passes through BlobValue unchanged', () => {
      const op = { type: 'BlobValue', node: 'x', oid: 'abc123' };
      expect(normalizeRawOp(op)).toBe(op);
    });

    // Idempotent: re-normalizing already-canonical ops returns them unchanged.
    // This is a defensive check — in practice, canonical ops only reach
    // normalizeRawOp if a caller passes them through a generic path.
    it('passes through canonical NodePropSet unchanged', () => {
      const op = createNodePropSetV2('x', 'k', 'v');
      expect(normalizeRawOp(op)).toBe(op);
    });

    it('passes through canonical EdgePropSet unchanged', () => {
      const op = createEdgePropSetV2('a', 'b', 'rel', 'k', 'v');
      expect(normalizeRawOp(op)).toBe(op);
    });
  });

  // -----------------------------------------------------------------------
  // A1-T03: Lower canonical edge-property op to legacy raw form
  // -----------------------------------------------------------------------
  describe('lowerCanonicalOp', () => {
    it('A1-T03: lowers EdgePropSet to raw PropSet with legacy node encoding', () => {
      const canonical = createEdgePropSetV2('alice', 'bob', 'follows', 'weight', 0.9);

      const raw = /** @type {import('../../../../src/domain/types/ops/PropSet.ts').default} */ (lowerCanonicalOp(canonical));

      expect(raw.type).toBe('PropSet');
      expect(raw.node).toBe('\x01alice\0bob\0follows');
      expect(raw.key).toBe('weight');
      expect(raw.value).toBe(0.9);
    });

    it('lowers NodePropSet to raw PropSet', () => {
      const canonical = createNodePropSetV2('alice', 'color', 'blue');

      const raw = lowerCanonicalOp(canonical);

      expect(raw).toMatchObject({
        type: 'PropSet',
        node: 'alice',
        key: 'color',
        value: 'blue',
      });
    });

    it('passes through NodeAdd unchanged', () => {
      const op = { type: 'NodeAdd', node: 'x', dot: { writerId: 'w', counter: 1 } };
      expect(lowerCanonicalOp(op)).toBe(op);
    });

    it('passes through EdgeAdd unchanged', () => {
      const op = { type: 'EdgeAdd', from: 'a', to: 'b', label: 'rel', dot: { writerId: 'w', counter: 1 } };
      expect(lowerCanonicalOp(op)).toBe(op);
    });

    it('passes through BlobValue unchanged', () => {
      const op = { type: 'BlobValue', node: 'x', oid: 'abc123' };
      expect(lowerCanonicalOp(op)).toBe(op);
    });
  });

  // -----------------------------------------------------------------------
  // A1-T04: Normalize/lower round-trip is stable
  // -----------------------------------------------------------------------
  describe('round-trip stability', () => {
    it('A1-T04: normalize then lower returns original raw edge-property op', () => {
      const raw = createPropSetV2(
        `${EDGE_PROP_PREFIX}alice\0bob\0follows`,
        'weight',
        0.9,
      );

      const canonical = normalizeRawOp(raw);
      const roundTripped = lowerCanonicalOp(canonical);

      expect(roundTripped).toEqual(raw);
    });

    it('A1-T04: normalize then lower returns original raw node property op', () => {
      const raw = createPropSetV2('alice', 'color', 'blue');

      const canonical = normalizeRawOp(raw);
      const roundTripped = lowerCanonicalOp(canonical);

      expect(roundTripped).toEqual(raw);
    });

    it('round-trips edge prop with complex value', () => {
      const raw = createPropSetV2(
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
      const cases = [
        ['simple', 'x', 'y', 'rel', 'key', 'val'],
        ['namespaced', 'user:alice', 'doc:123', 'authored', 'date', '2025-01-01'],
        ['UUIDs', 'abc-def', '123-456', 'edge-label', 'prop-key', 42],
        ['unicode', 'café', 'naïve', 'résumé', 'über', true],
      ];

      for (const [, from, to, label, key, value] of cases) {
        const raw = createPropSetV2(encodeLegacyEdgePropNode(/** @type {string} */ (from), /** @type {string} */ (to), /** @type {string} */ (label)), /** @type {string} */ (key), value);
        const roundTripped = lowerCanonicalOp(normalizeRawOp(raw));
        expect(roundTripped).toEqual(raw);
      }
    });
  });

  // -----------------------------------------------------------------------
  // A1-T05: Encoded key identity still holds
  // -----------------------------------------------------------------------
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
