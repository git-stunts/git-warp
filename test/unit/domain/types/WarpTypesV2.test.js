import { describe, it, expect } from 'vitest';
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
        const dot = { writer: 'writer-1', seq: 1 };
        const result = createNodeAddV2('user:alice', dot);

        expect(result).toEqual({
          type: 'NodeAdd',
          node: 'user:alice',
          dot: { writer: 'writer-1', seq: 1 },
        });
      });

      it('creates NodeAdd with UUID-style node ID', () => {
        const nodeId = '550e8400-e29b-41d4-a716-446655440000';
        const dot = { writer: 'writer-2', seq: 5 };
        const result = createNodeAddV2(nodeId, dot);

        expect(result).toEqual({
          type: 'NodeAdd',
          node: nodeId,
          dot: { writer: 'writer-2', seq: 5 },
        });
      });

      it('creates NodeAdd with high sequence number', () => {
        const dot = { writer: 'prolific-writer', seq: 999999 };
        const result = createNodeAddV2('node:high-seq', dot);

        expect(result.dot.seq).toBe(999999);
      });
    });

    describe('createNodeRemoveV2', () => {
      it('creates NodeRemove operation with single observed dot', () => {
        const observedDots = [{ writer: 'writer-1', seq: 1 }];
        const result = createNodeRemoveV2('user:bob', observedDots);

        expect(result).toEqual({
          type: 'NodeRemove',
          node: 'user:bob',
          observedDots: [{ writer: 'writer-1', seq: 1 }],
        });
      });

      it('creates NodeRemove with multiple observed dots', () => {
        const observedDots = [
          { writer: 'writer-1', seq: 1 },
          { writer: 'writer-2', seq: 3 },
          { writer: 'writer-1', seq: 5 },
        ];
        const result = createNodeRemoveV2('user:charlie', observedDots);

        expect(result.observedDots).toHaveLength(3);
        expect(result.observedDots).toContainEqual({ writer: 'writer-1', seq: 1 });
        expect(result.observedDots).toContainEqual({ writer: 'writer-2', seq: 3 });
        expect(result.observedDots).toContainEqual({ writer: 'writer-1', seq: 5 });
      });

      it('creates NodeRemove with empty observed dots', () => {
        const result = createNodeRemoveV2('user:unknown', []);

        expect(result).toEqual({
          type: 'NodeRemove',
          node: 'user:unknown',
          observedDots: [],
        });
      });
    });

    describe('createEdgeAddV2', () => {
      it('creates EdgeAdd operation with dot', () => {
        const dot = { writer: 'writer-1', seq: 2 };
        const result = createEdgeAddV2('user:alice', 'user:bob', 'follows', dot);

        expect(result).toEqual({
          type: 'EdgeAdd',
          from: 'user:alice',
          to: 'user:bob',
          label: 'follows',
          dot: { writer: 'writer-1', seq: 2 },
        });
      });

      it('creates EdgeAdd with different label', () => {
        const dot = { writer: 'writer-2', seq: 10 };
        const result = createEdgeAddV2('post:123', 'user:alice', 'authored_by', dot);

        expect(result).toEqual({
          type: 'EdgeAdd',
          from: 'post:123',
          to: 'user:alice',
          label: 'authored_by',
          dot: { writer: 'writer-2', seq: 10 },
        });
      });
    });

    describe('createEdgeRemoveV2', () => {
      it('creates EdgeRemove operation with single observed dot', () => {
        const observedDots = [{ writer: 'writer-1', seq: 2 }];
        const result = createEdgeRemoveV2('user:alice', 'user:bob', 'follows', observedDots);

        expect(result).toEqual({
          type: 'EdgeRemove',
          from: 'user:alice',
          to: 'user:bob',
          label: 'follows',
          observedDots: [{ writer: 'writer-1', seq: 2 }],
        });
      });

      it('creates EdgeRemove with multiple observed dots from concurrent adds', () => {
        const observedDots = [
          { writer: 'writer-1', seq: 2 },
          { writer: 'writer-2', seq: 1 },
        ];
        const result = createEdgeRemoveV2('user:alice', 'user:bob', 'follows', observedDots);

        expect(result.observedDots).toHaveLength(2);
      });
    });

    describe('createPropSetV2', () => {
      it('creates PropSet operation with string value (no dot)', () => {
        const result = createPropSetV2('user:alice', 'name', 'Alice');

        expect(result).toEqual({
          type: 'PropSet',
          node: 'user:alice',
          key: 'name',
          value: 'Alice',
        });
      });

      it('creates PropSet with number value', () => {
        const result = createPropSetV2('user:alice', 'age', 30);

        expect(result).toEqual({
          type: 'PropSet',
          node: 'user:alice',
          key: 'age',
          value: 30,
        });
      });

      it('creates PropSet with object value', () => {
        const settings = { theme: 'dark', notifications: true };
        const result = createPropSetV2('user:alice', 'settings', settings);

        expect(result).toEqual({
          type: 'PropSet',
          node: 'user:alice',
          key: 'settings',
          value: { theme: 'dark', notifications: true },
        });
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
        const dot = { writer: 'writer-1', seq: 1 };
        const ops = [createNodeAddV2('user:alice', dot)];
        const context = { 'writer-1': 0 };

        const result = createPatchV2({
          writer: 'writer-1',
          lamport: 1,
          context,
          ops,
        });

        expect(result).toEqual({
          schema: 2,
          writer: 'writer-1',
          lamport: 1,
          context: { 'writer-1': 0 },
          ops: [{ type: 'NodeAdd', node: 'user:alice', dot: { writer: 'writer-1', seq: 1 } }],
        });
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
          createNodeAddV2('user:alice', { writer: 'writer-1', seq: 1 }),
          createNodeAddV2('user:bob', { writer: 'writer-1', seq: 2 }),
          createEdgeAddV2('user:alice', 'user:bob', 'follows', { writer: 'writer-1', seq: 3 }),
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
        expect(result.ops[0].type).toBe('NodeAdd');
        expect(result.ops[1].type).toBe('NodeAdd');
        expect(result.ops[2].type).toBe('EdgeAdd');
        expect(result.ops[3].type).toBe('PropSet');
      });

      it('creates PatchV2 with empty ops array', () => {
        const result = createPatchV2({
          writer: 'writer-1',
          lamport: 0,
          context: {},
          ops: [],
        });

        expect(result).toEqual({
          schema: 2,
          writer: 'writer-1',
          lamport: 0,
          context: {},
          ops: [],
        });
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
      const nodeAdd = createNodeAddV2('n1', { writer: 'w', seq: 1 });
      const nodeRemove = createNodeRemoveV2('n1', [{ writer: 'w', seq: 1 }]);
      const edgeAdd = createEdgeAddV2('n1', 'n2', 'rel', { writer: 'w', seq: 2 });
      const edgeRemove = createEdgeRemoveV2('n1', 'n2', 'rel', [{ writer: 'w', seq: 2 }]);
      const propSet = createPropSetV2('n1', 'key', 'val');

      const types = [
        nodeAdd.type,
        nodeRemove.type,
        edgeAdd.type,
        edgeRemove.type,
        propSet.type,
      ];

      // All types should be unique
      const uniqueTypes = new Set(types);
      expect(uniqueTypes.size).toBe(5);
    });

    it('add operations have dot, remove operations have observedDots', () => {
      const nodeAdd = createNodeAddV2('n1', { writer: 'w', seq: 1 });
      const nodeRemove = createNodeRemoveV2('n1', [{ writer: 'w', seq: 1 }]);
      const edgeAdd = createEdgeAddV2('n1', 'n2', 'rel', { writer: 'w', seq: 2 });
      const edgeRemove = createEdgeRemoveV2('n1', 'n2', 'rel', [{ writer: 'w', seq: 2 }]);

      // Add operations have dot
      expect(nodeAdd).toHaveProperty('dot');
      expect(edgeAdd).toHaveProperty('dot');
      expect(nodeAdd).not.toHaveProperty('observedDots');
      expect(edgeAdd).not.toHaveProperty('observedDots');

      // Remove operations have observedDots
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
      // Simulate creating a user and setting properties
      const patch = createPatchV2({
        writer: 'app-server-1',
        lamport: 42,
        context: { 'app-server-1': 0 },
        ops: [
          createNodeAddV2('user:123', { writer: 'app-server-1', seq: 1 }),
          createPropSetV2('user:123', 'email', 'alice@example.com'),
          createPropSetV2('user:123', 'name', 'Alice'),
          createPropSetV2('user:123', 'verified', true),
        ],
      });

      expect(patch.schema).toBe(2);
      expect(patch.ops).toHaveLength(4);
      expect(patch.ops[0]).toEqual({
        type: 'NodeAdd',
        node: 'user:123',
        dot: { writer: 'app-server-1', seq: 1 },
      });
      expect(patch.ops[1].type).toBe('PropSet');
      expect(patch.ops[1].value).toBe('alice@example.com');
    });

    it('creates a social graph patch', () => {
      const patch = createPatchV2({
        writer: 'social-service',
        lamport: 100,
        context: { 'social-service': 0, 'user-service': 5 },
        ops: [
          createNodeAddV2('user:alice', { writer: 'social-service', seq: 1 }),
          createNodeAddV2('user:bob', { writer: 'social-service', seq: 2 }),
          createEdgeAddV2('user:alice', 'user:bob', 'follows', { writer: 'social-service', seq: 3 }),
          createEdgeAddV2('user:bob', 'user:alice', 'follows', { writer: 'social-service', seq: 4 }),
          createPropSetV2('user:alice', 'followingCount', 1),
          createPropSetV2('user:bob', 'followingCount', 1),
        ],
      });

      expect(patch.ops).toHaveLength(6);

      // Verify edge operations have dots
      const edges = patch.ops.filter((op) => op.type === 'EdgeAdd');
      expect(edges).toHaveLength(2);
      expect(edges[0].label).toBe('follows');
      expect(edges[0].dot.seq).toBe(3);
      expect(edges[1].dot.seq).toBe(4);
    });

    it('creates a deletion patch with observed dots', () => {
      // Simulate removing items that were added by different writers
      const patch = createPatchV2({
        writer: 'cleanup-job',
        lamport: 200,
        context: {
          'cleanup-job': 0,
          'social-service': 4,
          'user-service': 10,
        },
        ops: [
          createEdgeRemoveV2('user:alice', 'user:bob', 'follows', [
            { writer: 'social-service', seq: 3 },
          ]),
          createNodeRemoveV2('user:bob', [
            { writer: 'social-service', seq: 2 },
            { writer: 'user-service', seq: 7 }, // concurrent add from another writer
          ]),
        ],
      });

      expect(patch.ops).toHaveLength(2);
      expect(patch.ops[0].type).toBe('EdgeRemove');
      expect(patch.ops[0].observedDots).toHaveLength(1);
      expect(patch.ops[1].type).toBe('NodeRemove');
      expect(patch.ops[1].observedDots).toHaveLength(2);
    });

    it('creates a merge-scenario patch observing multiple writers', () => {
      // Writer-3 has observed state from writer-1 and writer-2
      const patch = createPatchV2({
        writer: 'writer-3',
        lamport: 50,
        context: {
          'writer-1': 10,
          'writer-2': 8,
          'writer-3': 0,
        },
        ops: [
          createNodeAddV2('merged:node', { writer: 'writer-3', seq: 1 }),
          createEdgeAddV2('node:from-w1', 'node:from-w2', 'links', { writer: 'writer-3', seq: 2 }),
        ],
      });

      expect(patch.context['writer-1']).toBe(10);
      expect(patch.context['writer-2']).toBe(8);
      expect(patch.context['writer-3']).toBe(0);
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
});
