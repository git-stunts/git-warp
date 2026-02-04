import { describe, it, expect } from 'vitest';
import { PatchBuilderV2 } from '../../../../src/domain/services/PatchBuilderV2.js';
import { createVersionVector } from '../../../../src/domain/crdt/VersionVector.js';
import {
  encodePropKey,
  encodeEdgePropKey,
  EDGE_PROP_PREFIX,
} from '../../../../src/domain/services/JoinReducer.js';

/**
 * Helper — creates a minimal PatchBuilderV2 for unit tests (no persistence needed).
 */
function makeBuilder(opts = {}) {
  return new PatchBuilderV2({
    writerId: opts.writerId ?? 'w1',
    lamport: opts.lamport ?? 1,
    versionVector: opts.versionVector ?? createVersionVector(),
    getCurrentState: opts.getCurrentState ?? (() => null),
  });
}

describe('PatchBuilderV2.setEdgeProperty', () => {
  // ---------------------------------------------------------------
  // Golden path
  // ---------------------------------------------------------------
  describe('golden path: addEdge then setEdgeProperty', () => {
    it('creates a PropSet op whose node field encodes the edge identity', () => {
      const builder = makeBuilder();

      builder
        .addEdge('user:alice', 'user:bob', 'follows')
        .setEdgeProperty('user:alice', 'user:bob', 'follows', 'since', '2025-01-01');

      const patch = builder.build();
      expect(patch.ops).toHaveLength(2);

      const propOp = patch.ops[1];
      expect(propOp.type).toBe('PropSet');
      expect(propOp.key).toBe('since');
      expect(propOp.value).toBe('2025-01-01');

      // The node field must start with EDGE_PROP_PREFIX
      expect(propOp.node.startsWith(EDGE_PROP_PREFIX)).toBe(true);
    });

    it('produces the canonical encodeEdgePropKey when run through encodePropKey', () => {
      const builder = makeBuilder();
      builder.addEdge('a', 'b', 'rel').setEdgeProperty('a', 'b', 'rel', 'weight', 42);

      const op = builder.ops[1];
      const mapKey = encodePropKey(op.node, op.key);
      const expected = encodeEdgePropKey('a', 'b', 'rel', 'weight');
      expect(mapKey).toBe(expected);
    });
  });

  // ---------------------------------------------------------------
  // Property stored under edge prop key namespace
  // ---------------------------------------------------------------
  describe('namespace isolation', () => {
    it('edge property key differs from node property key with same prop name', () => {
      const builder = makeBuilder();

      builder
        .addEdge('a', 'b', 'rel')
        .setProperty('a', 'weight', 10)
        .setEdgeProperty('a', 'b', 'rel', 'weight', 99);

      const [, nodeOp, edgeOp] = builder.ops;

      // Both are PropSet but with different node fields
      expect(nodeOp.type).toBe('PropSet');
      expect(edgeOp.type).toBe('PropSet');
      expect(nodeOp.node).not.toBe(edgeOp.node);

      // Encoded map keys must differ
      const nodeMapKey = encodePropKey(nodeOp.node, nodeOp.key);
      const edgeMapKey = encodePropKey(edgeOp.node, edgeOp.key);
      expect(nodeMapKey).not.toBe(edgeMapKey);
    });
  });

  // ---------------------------------------------------------------
  // Set property on edge added in same patch
  // ---------------------------------------------------------------
  describe('edge added in same patch', () => {
    it('commit succeeds with addEdge + setEdgeProperty in one patch', () => {
      const builder = makeBuilder();

      builder
        .addNode('x')
        .addNode('y')
        .addEdge('x', 'y', 'link')
        .setEdgeProperty('x', 'y', 'link', 'color', 'red');

      const patch = builder.build();
      expect(patch.ops).toHaveLength(4);
      expect(patch.ops[3].type).toBe('PropSet');
      expect(patch.ops[3].value).toBe('red');
    });
  });

  // ---------------------------------------------------------------
  // Multiple edge properties on same edge
  // ---------------------------------------------------------------
  describe('multiple properties on same edge', () => {
    it('stores distinct PropSet ops for each property', () => {
      const builder = makeBuilder();

      builder
        .addEdge('a', 'b', 'rel')
        .setEdgeProperty('a', 'b', 'rel', 'weight', 5)
        .setEdgeProperty('a', 'b', 'rel', 'color', 'blue')
        .setEdgeProperty('a', 'b', 'rel', 'active', true);

      const patch = builder.build();
      // 1 EdgeAdd + 3 PropSet
      expect(patch.ops).toHaveLength(4);

      const propOps = patch.ops.filter((o) => o.type === 'PropSet');
      expect(propOps).toHaveLength(3);

      // All share the same node field (edge identity)
      const nodeFields = new Set(propOps.map((o) => o.node));
      expect(nodeFields.size).toBe(1);

      // Keys are distinct
      const keys = propOps.map((o) => o.key);
      expect(keys).toEqual(['weight', 'color', 'active']);

      // Map keys are distinct
      const mapKeys = propOps.map((o) => encodePropKey(o.node, o.key));
      expect(new Set(mapKeys).size).toBe(3);
    });
  });

  // ---------------------------------------------------------------
  // Edge cases: value types
  // ---------------------------------------------------------------
  describe('edge-case values', () => {
    it('handles empty string value', () => {
      const builder = makeBuilder();
      builder.addEdge('a', 'b', 'rel').setEdgeProperty('a', 'b', 'rel', 'note', '');

      const op = builder.ops[1];
      expect(op.value).toBe('');
    });

    it('handles numeric value', () => {
      const builder = makeBuilder();
      builder.addEdge('a', 'b', 'rel').setEdgeProperty('a', 'b', 'rel', 'weight', 3.14);

      const op = builder.ops[1];
      expect(op.value).toBe(3.14);
    });

    it('handles object value', () => {
      const builder = makeBuilder();
      const obj = { nested: true, count: 7 };
      builder.addEdge('a', 'b', 'rel').setEdgeProperty('a', 'b', 'rel', 'meta', obj);

      const op = builder.ops[1];
      expect(op.value).toEqual({ nested: true, count: 7 });
    });

    it('handles null value', () => {
      const builder = makeBuilder();
      builder.addEdge('a', 'b', 'rel').setEdgeProperty('a', 'b', 'rel', 'deleted', null);

      const op = builder.ops[1];
      expect(op.value).toBeNull();
    });

    it('handles boolean value', () => {
      const builder = makeBuilder();
      builder.addEdge('a', 'b', 'rel').setEdgeProperty('a', 'b', 'rel', 'active', false);

      const op = builder.ops[1];
      expect(op.value).toBe(false);
    });

    it('handles array value', () => {
      const builder = makeBuilder();
      builder.addEdge('a', 'b', 'rel').setEdgeProperty('a', 'b', 'rel', 'tags', ['x', 'y']);

      const op = builder.ops[1];
      expect(op.value).toEqual(['x', 'y']);
    });
  });

  // ---------------------------------------------------------------
  // Chaining
  // ---------------------------------------------------------------
  describe('chaining', () => {
    it('returns this for method chaining', () => {
      const builder = makeBuilder();
      builder.addEdge('a', 'b', 'rel');
      const result = builder.setEdgeProperty('a', 'b', 'rel', 'k', 'v');
      expect(result).toBe(builder);
    });
  });

  // ---------------------------------------------------------------
  // Does not increment version vector (same as setProperty)
  // ---------------------------------------------------------------
  describe('version vector', () => {
    it('does not increment version vector', () => {
      const vv = createVersionVector();
      const builder = makeBuilder({ versionVector: vv });

      builder.addEdge('a', 'b', 'rel');
      // addEdge increments VV (creates a dot), capture the value after
      const vvAfterEdge = builder.versionVector.get('w1');

      builder.setEdgeProperty('a', 'b', 'rel', 'k1', 'v1');
      builder.setEdgeProperty('a', 'b', 'rel', 'k2', 'v2');

      // setEdgeProperty should NOT further increment VV
      expect(builder.versionVector.get('w1')).toBe(vvAfterEdge);
    });
  });

  // ---------------------------------------------------------------
  // Operation ordering
  // ---------------------------------------------------------------
  describe('operation ordering', () => {
    it('preserves order among mixed node/edge property ops', () => {
      const builder = makeBuilder();

      builder
        .addNode('n1')
        .addEdge('n1', 'n2', 'link')
        .setProperty('n1', 'name', 'N1')
        .setEdgeProperty('n1', 'n2', 'link', 'weight', 10)
        .setProperty('n1', 'age', 5);

      const types = builder.ops.map((o) => o.type);
      expect(types).toEqual(['NodeAdd', 'EdgeAdd', 'PropSet', 'PropSet', 'PropSet']);

      // Verify which PropSet is which by checking the key
      expect(builder.ops[2].key).toBe('name');
      expect(builder.ops[3].key).toBe('weight');
      expect(builder.ops[4].key).toBe('age');

      // Only the middle PropSet should have edge-prop-prefix node
      expect(builder.ops[2].node).toBe('n1');
      expect(builder.ops[3].node.startsWith(EDGE_PROP_PREFIX)).toBe(true);
      expect(builder.ops[4].node).toBe('n1');
    });
  });
});
