import { describe, it, expect } from 'vitest';
import {
  assertOpsCompatible,
  detectSchemaVersion,
  SCHEMA_V2,
  SCHEMA_V3,
} from '../../../../src/domain/services/WarpMessageCodec.js';
import SchemaUnsupportedError from '../../../../src/domain/errors/SchemaUnsupportedError.js';
import { EDGE_PROP_PREFIX } from '../../../../src/domain/services/JoinReducer.js';

// ---------------------------------------------------------------------------
// Helpers — minimal op factories
// ---------------------------------------------------------------------------

/** @param {string} nodeId */
function nodeAddOp(nodeId) {
  return { type: 'NodeAdd', node: nodeId, dot: { writer: 'w1', counter: 1 } };
}

/** @param {string} from @param {string} to @param {string} label */
function edgeAddOp(from, to, label) {
  return { type: 'EdgeAdd', from, to, label, dot: { writer: 'w1', counter: 1 } };
}

/** @param {string} nodeId @param {string} key @param {any} value */
function nodePropSetOp(nodeId, key, value) {
  return { type: 'PropSet', node: nodeId, key, value };
}

/** @param {string} from @param {string} to @param {string} label @param {string} key @param {any} value */
function edgePropSetOp(from, to, label, key, value) {
  // Edge prop ops use the \x01 prefix namespace in the node field
  return { type: 'PropSet', node: `${EDGE_PROP_PREFIX}${from}\0${to}\0${label}`, key, value };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Schema Compatibility (WT/SCHEMA/2)', () => {
  // -------------------------------------------------------------------------
  // assertOpsCompatible
  // -------------------------------------------------------------------------

  describe('assertOpsCompatible', () => {
    describe('v2 reader (maxSchema = SCHEMA_V2)', () => {
      it('accepts v2 patches with only node ops', () => {
        const ops = [
          nodeAddOp('user:alice'),
          nodePropSetOp('user:alice', 'name', 'Alice'),
        ];

        expect(() => assertOpsCompatible(ops, SCHEMA_V2)).not.toThrow();
      });

      it('accepts v2 patches with node + edge ops (no edge props)', () => {
        const ops = [
          nodeAddOp('user:alice'),
          nodeAddOp('user:bob'),
          edgeAddOp('user:alice', 'user:bob', 'follows'),
          nodePropSetOp('user:alice', 'name', 'Alice'),
        ];

        expect(() => assertOpsCompatible(ops, SCHEMA_V2)).not.toThrow();
      });

      it('accepts empty ops array', () => {
        expect(() => assertOpsCompatible([], SCHEMA_V2)).not.toThrow();
      });

      it('accepts non-array ops (defensive)', () => {
        expect(() => assertOpsCompatible(/** @type {any} */ (null), SCHEMA_V2)).not.toThrow();
        expect(() => assertOpsCompatible(/** @type {any} */ (undefined), SCHEMA_V2)).not.toThrow();
      });

      it('throws E_SCHEMA_UNSUPPORTED for edge property ops', () => {
        const ops = [
          nodeAddOp('user:alice'),
          edgePropSetOp('user:alice', 'user:bob', 'follows', 'weight', 0.8),
        ];

        expect(() => assertOpsCompatible(ops, SCHEMA_V2)).toThrow(SchemaUnsupportedError);
      });

      it('error has correct code', () => {
        const ops = [edgePropSetOp('a', 'b', 'rel', 'w', 1)];

        try {
          assertOpsCompatible(ops, SCHEMA_V2);
          expect.unreachable('should have thrown');
        } catch (/** @type {any} */ err) {
          expect(err.code).toBe('E_SCHEMA_UNSUPPORTED');
        }
      });

      it('error message includes upgrade guidance', () => {
        const ops = [edgePropSetOp('a', 'b', 'rel', 'w', 1)];

        try {
          assertOpsCompatible(ops, SCHEMA_V2);
          expect.unreachable('should have thrown');
        } catch (/** @type {any} */ err) {
          expect(err.message).toContain('>=7.3.0');
          expect(err.message).toContain('WEIGHTED');
          expect(err.message).toContain('edge properties');
        }
      });

      it('error context includes schema versions', () => {
        const ops = [edgePropSetOp('a', 'b', 'rel', 'w', 1)];

        try {
          assertOpsCompatible(ops, SCHEMA_V2);
          expect.unreachable('should have thrown');
        } catch (/** @type {any} */ err) {
          expect(err.context.requiredSchema).toBe(SCHEMA_V3);
          expect(err.context.maxSupportedSchema).toBe(SCHEMA_V2);
        }
      });

      it('throws on first edge prop op (fail fast)', () => {
        const ops = [
          nodeAddOp('user:alice'),
          edgePropSetOp('a', 'b', 'rel', 'w1', 1),
          edgePropSetOp('c', 'd', 'rel', 'w2', 2),
        ];

        expect(() => assertOpsCompatible(ops, SCHEMA_V2)).toThrow(SchemaUnsupportedError);
      });

      it('accepts v3 patch with ONLY node/edge ops (no edge props)', () => {
        // Schema v3 patch that happens to have no edge prop ops should
        // be accepted — the schema number alone is NOT a rejection criterion.
        const ops = [
          nodeAddOp('user:carol'),
          edgeAddOp('user:carol', 'user:dave', 'knows'),
          nodePropSetOp('user:carol', 'role', 'admin'),
        ];

        // Even though detectSchemaVersion would say v2, the point is:
        // assertOpsCompatible only looks at ops, not the schema header.
        expect(() => assertOpsCompatible(ops, SCHEMA_V2)).not.toThrow();
      });

      it('handles unknown op types gracefully (no crash)', () => {
        const ops = [
          { type: 'FutureOp', data: 'unknown' },
          nodeAddOp('user:x'),
        ];

        // Unknown op types that don't look like edge prop PropSets pass through
        expect(() => assertOpsCompatible(ops, SCHEMA_V2)).not.toThrow();
      });
    });

    describe('v3 reader (maxSchema = SCHEMA_V3)', () => {
      it('accepts v2 patches (backward compatible)', () => {
        const ops = [
          nodeAddOp('user:alice'),
          nodePropSetOp('user:alice', 'name', 'Alice'),
        ];

        expect(() => assertOpsCompatible(ops, SCHEMA_V3)).not.toThrow();
      });

      it('accepts v3 patches with edge prop ops', () => {
        const ops = [
          nodeAddOp('user:alice'),
          edgePropSetOp('user:alice', 'user:bob', 'follows', 'weight', 0.8),
        ];

        expect(() => assertOpsCompatible(ops, SCHEMA_V3)).not.toThrow();
      });

      it('accepts mixed node + edge prop ops', () => {
        const ops = [
          nodeAddOp('user:alice'),
          nodeAddOp('user:bob'),
          edgeAddOp('user:alice', 'user:bob', 'follows'),
          nodePropSetOp('user:alice', 'name', 'Alice'),
          edgePropSetOp('user:alice', 'user:bob', 'follows', 'weight', 0.8),
          edgePropSetOp('user:alice', 'user:bob', 'follows', 'since', '2025-01-01'),
        ];

        expect(() => assertOpsCompatible(ops, SCHEMA_V3)).not.toThrow();
      });

      it('accepts empty ops array', () => {
        expect(() => assertOpsCompatible([], SCHEMA_V3)).not.toThrow();
      });
    });

    describe('v2 to v2 (same version)', () => {
      it('v2 ops accepted by v2 reader', () => {
        const ops = [
          nodeAddOp('n1'),
          edgeAddOp('n1', 'n2', 'e'),
          nodePropSetOp('n1', 'k', 'v'),
        ];

        expect(() => assertOpsCompatible(ops, SCHEMA_V2)).not.toThrow();
      });
    });

    describe('v3 to v3 (same version)', () => {
      it('v3 ops accepted by v3 reader', () => {
        const ops = [
          nodeAddOp('n1'),
          edgePropSetOp('n1', 'n2', 'e', 'weight', 42),
        ];

        expect(() => assertOpsCompatible(ops, SCHEMA_V3)).not.toThrow();
      });
    });
  });

  // -------------------------------------------------------------------------
  // detectSchemaVersion consistency
  // -------------------------------------------------------------------------

  describe('detectSchemaVersion alignment', () => {
    it('node-only ops detected as v2', () => {
      const ops = [
        nodeAddOp('user:alice'),
        nodePropSetOp('user:alice', 'name', 'Alice'),
      ];

      expect(detectSchemaVersion(ops)).toBe(SCHEMA_V2);
    });

    it('edge prop ops detected as v3', () => {
      const ops = [
        nodeAddOp('user:alice'),
        edgePropSetOp('user:alice', 'user:bob', 'follows', 'weight', 0.8),
      ];

      expect(detectSchemaVersion(ops)).toBe(SCHEMA_V3);
    });

    it('detectSchemaVersion v2 ops pass assertOpsCompatible(v2)', () => {
      const ops = [nodeAddOp('n'), nodePropSetOp('n', 'k', 'v')];
      expect(detectSchemaVersion(ops)).toBe(SCHEMA_V2);
      expect(() => assertOpsCompatible(ops, SCHEMA_V2)).not.toThrow();
    });

    it('detectSchemaVersion v3 ops rejected by assertOpsCompatible(v2)', () => {
      const ops = [edgePropSetOp('a', 'b', 'r', 'w', 1)];
      expect(detectSchemaVersion(ops)).toBe(SCHEMA_V3);
      expect(() => assertOpsCompatible(ops, SCHEMA_V2)).toThrow(SchemaUnsupportedError);
    });

    it('detectSchemaVersion v3 ops accepted by assertOpsCompatible(v3)', () => {
      const ops = [edgePropSetOp('a', 'b', 'r', 'w', 1)];
      expect(detectSchemaVersion(ops)).toBe(SCHEMA_V3);
      expect(() => assertOpsCompatible(ops, SCHEMA_V3)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // SchemaUnsupportedError class
  // -------------------------------------------------------------------------

  describe('SchemaUnsupportedError', () => {
    it('is an instance of Error', () => {
      const err = new SchemaUnsupportedError('test');
      expect(err).toBeInstanceOf(Error);
    });

    it('has name SchemaUnsupportedError', () => {
      const err = new SchemaUnsupportedError('test');
      expect(err.name).toBe('SchemaUnsupportedError');
    });

    it('has code E_SCHEMA_UNSUPPORTED', () => {
      const err = new SchemaUnsupportedError('test');
      expect(err.code).toBe('E_SCHEMA_UNSUPPORTED');
    });

    it('preserves message', () => {
      const err = new SchemaUnsupportedError('upgrade required');
      expect(err.message).toBe('upgrade required');
    });

    it('preserves context', () => {
      const ctx = { requiredSchema: 3, maxSupportedSchema: 2 };
      const err = new SchemaUnsupportedError('msg', { context: ctx });
      expect(err.context).toEqual(ctx);
    });

    it('defaults context to empty object', () => {
      const err = new SchemaUnsupportedError('msg');
      expect(err.context).toEqual({});
    });

    it('has a stack trace', () => {
      const err = new SchemaUnsupportedError('msg');
      expect(err.stack).toBeDefined();
      expect(err.stack).toContain('SchemaUnsupportedError');
    });
  });

  // -------------------------------------------------------------------------
  // Sync scenario narratives
  // -------------------------------------------------------------------------

  describe('sync scenario narratives', () => {
    it('v2 writer -> v3 reader: succeeds (v2 patches are always valid v3 input)', () => {
      // v2 writer produces only node/edge ops, never edge prop ops
      const v2Patch = [
        nodeAddOp('user:alice'),
        nodeAddOp('user:bob'),
        edgeAddOp('user:alice', 'user:bob', 'follows'),
        nodePropSetOp('user:alice', 'name', 'Alice'),
      ];

      // v3 reader accepts everything
      expect(() => assertOpsCompatible(v2Patch, SCHEMA_V3)).not.toThrow();
    });

    it('v3 writer -> v2 reader WITH edge prop ops: E_SCHEMA_UNSUPPORTED', () => {
      // v3 writer uses edge properties
      const v3PatchWithEdgeProps = [
        nodeAddOp('user:alice'),
        nodeAddOp('user:bob'),
        edgeAddOp('user:alice', 'user:bob', 'follows'),
        edgePropSetOp('user:alice', 'user:bob', 'follows', 'weight', 0.9),
      ];

      // v2 reader must reject — silent drop would lose edge properties
      expect(() => assertOpsCompatible(v3PatchWithEdgeProps, SCHEMA_V2)).toThrow(
        SchemaUnsupportedError
      );
    });

    it('v3 writer -> v2 reader with ONLY node/edge ops: succeeds', () => {
      // v3 writer that happens to not use edge properties in this patch
      const v3PatchNodeOnly = [
        nodeAddOp('user:carol'),
        edgeAddOp('user:carol', 'user:dave', 'manages'),
        nodePropSetOp('user:carol', 'department', 'engineering'),
      ];

      // v2 reader can handle this — no unknown ops
      expect(() => assertOpsCompatible(v3PatchNodeOnly, SCHEMA_V2)).not.toThrow();
    });

    it('v2 writer -> v2 reader: succeeds', () => {
      const ops = [nodeAddOp('n'), nodePropSetOp('n', 'k', 'v')];
      expect(() => assertOpsCompatible(ops, SCHEMA_V2)).not.toThrow();
    });

    it('v3 writer -> v3 reader: succeeds', () => {
      const ops = [
        nodeAddOp('n'),
        edgePropSetOp('n', 'm', 'r', 'weight', 42),
      ];
      expect(() => assertOpsCompatible(ops, SCHEMA_V3)).not.toThrow();
    });
  });
});
