import { describe, it, expect } from 'vitest';
import { Dot } from '../../../../src/domain/crdt/Dot.js';
import Op from '../../../../src/domain/types/ops/Op.js';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.js';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.js';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.js';
import EdgeRemove from '../../../../src/domain/types/ops/EdgeRemove.js';
import PropSetClass from '../../../../src/domain/types/ops/PropSet.js';
import {
  createNodeAddV2,
  createNodeRemoveV2,
  createEdgeAddV2,
  createEdgeRemoveV2,
  createPropSetV2,
  createPatchV2,
} from '../../../../src/domain/types/WarpTypesV2.js';

describe('WarpTypesV2', () => {
  describe('Operation Factory Functions', () => {
    describe('createNodeAddV2', () => {
      it('creates NodeAdd operation with dot', () => {
        const dot = new Dot('writer-1', 1);
        const result = createNodeAddV2('user:alice', dot);

        expect(result).toBeInstanceOf(NodeAdd);
        expect(result.type).toBe('NodeAdd');
        expect(result.node).toBe('user:alice');
        expect(result.dot).toBe(dot);
      });

      it('creates NodeAdd with UUID-style node ID', () => {
        const nodeId = '550e8400-e29b-41d4-a716-446655440000';
        const dot = new Dot('writer-2', 5);
        const result = createNodeAddV2(nodeId, dot);

        expect(result).toBeInstanceOf(NodeAdd);
        expect(result.node).toBe(nodeId);
        expect(result.dot.counter).toBe(5);
      });

      it('creates NodeAdd with high counter', () => {
        const dot = new Dot('prolific-writer', 999999);
        const result = createNodeAddV2('node:high-seq', dot);

        expect(result.dot.counter).toBe(999999);
      });
    });

    describe('createNodeRemoveV2', () => {
      it('creates NodeRemove operation with single observed dot', () => {
        const result = createNodeRemoveV2('user:bob', ['writer-1:1']);

        expect(result).toBeInstanceOf(NodeRemove);
        expect(result.type).toBe('NodeRemove');
        expect(result.node).toBe('user:bob');
        expect(result.observedDots).toEqual(['writer-1:1']);
      });

      it('creates NodeRemove with multiple observed dots', () => {
        const observedDots = ['writer-1:1', 'writer-2:3', 'writer-1:5'];
        const result = createNodeRemoveV2('user:charlie', observedDots);

        expect(result.observedDots).toHaveLength(3);
        expect(result.observedDots).toContain('writer-1:1');
        expect(result.observedDots).toContain('writer-2:3');
        expect(result.observedDots).toContain('writer-1:5');
      });

      it('creates NodeRemove with empty observed dots', () => {
        const result = createNodeRemoveV2('user:unknown', []);

        expect(result).toBeInstanceOf(NodeRemove);
        expect(result.observedDots).toEqual([]);
      });
    });

    describe('createEdgeAddV2', () => {
      it('creates EdgeAdd operation with dot', () => {
        const dot = new Dot('writer-1', 2);
        const result = createEdgeAddV2('user:alice', 'user:bob', 'follows', dot);

        expect(result).toBeInstanceOf(EdgeAdd);
        expect(result.type).toBe('EdgeAdd');
        expect(result.from).toBe('user:alice');
        expect(result.to).toBe('user:bob');
        expect(result.label).toBe('follows');
        expect(result.dot).toBe(dot);
      });

      it('creates EdgeAdd with different label', () => {
        const dot = new Dot('writer-2', 10);
        const result = createEdgeAddV2('post:123', 'user:alice', 'authored_by', dot);

        expect(result).toBeInstanceOf(EdgeAdd);
        expect(result.from).toBe('post:123');
        expect(result.to).toBe('user:alice');
        expect(result.label).toBe('authored_by');
      });
    });

    describe('createEdgeRemoveV2', () => {
      it('creates EdgeRemove operation with single observed dot', () => {
        const result = createEdgeRemoveV2('user:alice', 'user:bob', 'follows', ['writer-1:2']);

        expect(result).toBeInstanceOf(EdgeRemove);
        expect(result.type).toBe('EdgeRemove');
        expect(result.from).toBe('user:alice');
        expect(result.to).toBe('user:bob');
        expect(result.label).toBe('follows');
        expect(result.observedDots).toEqual(['writer-1:2']);
      });

      it('creates EdgeRemove with multiple observed dots from concurrent adds', () => {
        const result = createEdgeRemoveV2('user:alice', 'user:bob', 'follows', ['writer-1:2', 'writer-2:1']);

        expect(result.observedDots).toHaveLength(2);
      });
    });

    describe('createPropSetV2', () => {
      it('creates PropSet operation with string value (no dot)', () => {
        const result = createPropSetV2('user:alice', 'name', 'Alice');

        expect(result).toBeInstanceOf(PropSetClass);
        expect(result.type).toBe('PropSet');
        expect(result.node).toBe('user:alice');
        expect(result.key).toBe('name');
        expect(result.value).toBe('Alice');
      });

      it('creates PropSet with number value', () => {
        const result = createPropSetV2('user:alice', 'age', 30);

        expect(result.value).toBe(30);
      });

      it('creates PropSet with object value', () => {
        const settings = { theme: 'dark', notifications: true };
        const result = createPropSetV2('user:alice', 'settings', settings);

        expect(result.value).toEqual({ theme: 'dark', notifications: true });
      });

      it('creates PropSet with array value', () => {
        const tags = ['admin', 'verified', 'premium'];
        const result = createPropSetV2('user:alice', 'tags', tags);

        expect(result.value).toEqual(['admin', 'verified', 'premium']);
      });

      it('creates PropSet with null value', () => {
        const result = createPropSetV2('user:alice', 'deletedField', null);

        expect(result.value).toBeNull();
      });

      it('creates PropSet with boolean value', () => {
        const result = createPropSetV2('user:alice', 'active', true);

        expect(result.value).toBe(true);
      });

      it('does not include dot field (uses EventId)', () => {
        const result = createPropSetV2('user:alice', 'name', 'Alice');

        expect(result).not.toHaveProperty('dot');
      });
    });
  });

  describe('Patch Factory Function', () => {
    describe('createPatchV2', () => {
      it('creates PatchV2 with required fields', () => {
        const dot = new Dot('writer-1', 1);
        const ops = [createNodeAddV2('user:alice', dot)];
        const context = { 'writer-1': 0 };

        const result = createPatchV2({
          writer: 'writer-1',
          lamport: 1,
          context,
          ops,
        });

        expect(result.schema).toBe(2);
        expect(result.writer).toBe('writer-1');
        expect(result.lamport).toBe(1);
        expect(result.ops).toHaveLength(1);
        expect(result.ops[0]).toBeInstanceOf(NodeAdd);
        expect(result.ops[0]?.type).toBe('NodeAdd');
      });

      it('creates PatchV2 with explicit schema', () => {
        const result = createPatchV2({
          schema: 2,
          writer: 'writer-1',
          lamport: 1,
          context: {},
          ops: [],
        });

        expect(result.schema).toBe(2);
      });

      it('creates PatchV2 with complex context (version vector)', () => {
        const context = {
          'writer-1': 5,
          'writer-2': 3,
          'writer-3': 10,
        };
        const result = createPatchV2({
          writer: 'writer-1',
          lamport: 6,
          context,
          ops: [],
        });

        expect(result.context).toEqual({
          'writer-1': 5,
          'writer-2': 3,
          'writer-3': 10,
        });
      });

      it('creates PatchV2 with multiple operations', () => {
        const ops = [
          createNodeAddV2('user:alice', new Dot('writer-1', 1)),
          createNodeAddV2('user:bob', new Dot('writer-1', 2)),
          createEdgeAddV2('user:alice', 'user:bob', 'follows', new Dot('writer-1', 3)),
          createPropSetV2('user:alice', 'name', 'Alice'),
        ];
        const result = createPatchV2({
          writer: 'writer-1',
          lamport: 10,
          context: { 'writer-1': 0 },
          ops,
        });

        expect(result.schema).toBe(2);
        expect(result.writer).toBe('writer-1');
        expect(result.lamport).toBe(10);
        expect(result.ops).toHaveLength(4);
        expect(result.ops[0]?.type).toBe('NodeAdd');
        expect(result.ops[1]?.type).toBe('NodeAdd');
        expect(result.ops[2]?.type).toBe('EdgeAdd');
        expect(result.ops[3]?.type).toBe('PropSet');
      });

      it('creates PatchV2 with empty ops array', () => {
        const result = createPatchV2({
          writer: 'writer-1',
          lamport: 0,
          context: {},
          ops: [],
        });

        expect(result.schema).toBe(2);
        expect(result.writer).toBe('writer-1');
        expect(result.lamport).toBe(0);
        expect(result.ops).toEqual([]);
      });

      it('always sets schema to 2 by default', () => {
        const result = createPatchV2({
          writer: 'any-writer',
          lamport: 999,
          context: {},
          ops: [],
        });

        expect(result.schema).toBe(2);
      });
    });
  });

  describe('Type Discriminators', () => {
    it('all operation types have distinct type field', () => {
      const dot1 = new Dot('w', 1);
      const dot2 = new Dot('w', 2);
      const nodeAdd = createNodeAddV2('n1', dot1);
      const nodeRemove = createNodeRemoveV2('n1', ['w:1']);
      const edgeAdd = createEdgeAddV2('n1', 'n2', 'rel', dot2);
      const edgeRemove = createEdgeRemoveV2('n1', 'n2', 'rel', ['w:2']);
      const propSet = createPropSetV2('n1', 'key', 'val');

      const types = [
        nodeAdd.type,
        nodeRemove.type,
        edgeAdd.type,
        edgeRemove.type,
        propSet.type,
      ];

      const uniqueTypes = new Set(types);
      expect(uniqueTypes.size).toBe(5);
    });

    it('add operations have dot, remove operations have observedDots', () => {
      const dot1 = new Dot('w', 1);
      const dot2 = new Dot('w', 2);
      const nodeAdd = createNodeAddV2('n1', dot1);
      const nodeRemove = createNodeRemoveV2('n1', ['w:1']);
      const edgeAdd = createEdgeAddV2('n1', 'n2', 'rel', dot2);
      const edgeRemove = createEdgeRemoveV2('n1', 'n2', 'rel', ['w:2']);

      expect(nodeAdd).toHaveProperty('dot');
      expect(edgeAdd).toHaveProperty('dot');
      expect(nodeAdd).not.toHaveProperty('observedDots');
      expect(edgeAdd).not.toHaveProperty('observedDots');

      expect(nodeRemove).toHaveProperty('observedDots');
      expect(edgeRemove).toHaveProperty('observedDots');
      expect(nodeRemove).not.toHaveProperty('dot');
      expect(edgeRemove).not.toHaveProperty('dot');
    });

    it('PropSet has neither dot nor observedDots', () => {
      const propSet = createPropSetV2('n1', 'key', 'val');

      expect(propSet).not.toHaveProperty('dot');
      expect(propSet).not.toHaveProperty('observedDots');
    });
  });

  describe('Integration - Building Complete Patches', () => {
    it('creates a realistic patch with mixed operations', () => {
      const patch = createPatchV2({
        writer: 'app-server-1',
        lamport: 42,
        context: { 'app-server-1': 0 },
        ops: [
          createNodeAddV2('user:123', new Dot('app-server-1', 1)),
          createPropSetV2('user:123', 'email', 'alice@example.com'),
          createPropSetV2('user:123', 'name', 'Alice'),
          createPropSetV2('user:123', 'verified', true),
        ],
      });

      expect(patch.schema).toBe(2);
      expect(patch.ops).toHaveLength(4);
      expect(patch.ops[0]).toBeInstanceOf(NodeAdd);
      expect(patch.ops[0]?.type).toBe('NodeAdd');
      expect(patch.ops[1]?.type).toBe('PropSet');
      expect(/** @type {any} */ (patch.ops[1])?.value).toBe('alice@example.com');
    });

    it('creates a social graph patch', () => {
      const patch = createPatchV2({
        writer: 'social-service',
        lamport: 100,
        context: { 'social-service': 0, 'user-service': 5 },
        ops: [
          createNodeAddV2('user:alice', new Dot('social-service', 1)),
          createNodeAddV2('user:bob', new Dot('social-service', 2)),
          createEdgeAddV2('user:alice', 'user:bob', 'follows', new Dot('social-service', 3)),
          createEdgeAddV2('user:bob', 'user:alice', 'follows', new Dot('social-service', 4)),
          createPropSetV2('user:alice', 'followingCount', 1),
          createPropSetV2('user:bob', 'followingCount', 1),
        ],
      });

      expect(patch.ops).toHaveLength(6);

      const edges = patch.ops.filter((op) => op.type === 'EdgeAdd');
      expect(edges).toHaveLength(2);
      expect(edges[0]?.label).toBe('follows');
      expect(/** @type {any} */ (edges[0])?.dot.counter).toBe(3);
      expect(/** @type {any} */ (edges[1])?.dot.counter).toBe(4);
    });

    it('creates a deletion patch with observed dots', () => {
      const patch = createPatchV2({
        writer: 'cleanup-job',
        lamport: 200,
        context: {
          'cleanup-job': 0,
          'social-service': 4,
          'user-service': 10,
        },
        ops: [
          createEdgeRemoveV2('user:alice', 'user:bob', 'follows', ['social-service:3']),
          createNodeRemoveV2('user:bob', ['social-service:2', 'user-service:7']),
        ],
      });

      expect(patch.ops).toHaveLength(2);
      expect(patch.ops[0]?.type).toBe('EdgeRemove');
      expect(/** @type {any} */ (patch.ops[0])?.observedDots).toHaveLength(1);
      expect(patch.ops[1]?.type).toBe('NodeRemove');
      expect(/** @type {any} */ (patch.ops[1])?.observedDots).toHaveLength(2);
    });

    it('creates a merge-scenario patch observing multiple writers', () => {
      const patch = createPatchV2({
        writer: 'writer-3',
        lamport: 50,
        context: {
          'writer-1': 10,
          'writer-2': 8,
          'writer-3': 0,
        },
        ops: [
          createNodeAddV2('merged:node', new Dot('writer-3', 1)),
          createEdgeAddV2('node:from-w1', 'node:from-w2', 'links', new Dot('writer-3', 2)),
        ],
      });

      const ctx = /** @type {Record<string, number>} */ (patch.context);
      expect(ctx['writer-1']).toBe(10);
      expect(ctx['writer-2']).toBe(8);
      expect(ctx['writer-3']).toBe(0);
    });
  });

  describe('Schema Version', () => {
    it('V2 patches have schema 2', () => {
      const patch = createPatchV2({
        writer: 'w',
        lamport: 1,
        context: {},
        ops: [],
      });

      expect(patch.schema).toBe(2);
    });

    it('allows explicit schema parameter', () => {
      const patch = createPatchV2({
        schema: 2,
        writer: 'w',
        lamport: 1,
        context: {},
        ops: [],
      });

      expect(patch.schema).toBe(2);
    });
  });

  describe('Op class instanceof', () => {
    it('all factory-created ops are instanceof Op', () => {
      const dot = new Dot('w', 1);
      const ops = [
        createNodeAddV2('n1', dot),
        createNodeRemoveV2('n1', []),
        createEdgeAddV2('n1', 'n2', 'r', dot),
        createEdgeRemoveV2('n1', 'n2', 'r', []),
        createPropSetV2('n1', 'k', 'v'),
      ];

      for (const op of ops) {
        expect(op).toBeInstanceOf(Op);
      }
    });
  });
});
