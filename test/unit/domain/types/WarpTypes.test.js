import { describe, it, expect } from 'vitest';
import {
  createNodeAdd,
  createNodeTombstone,
  createEdgeAdd,
  createEdgeTombstone,
  createPropSet,
  createInlineValue,
  createBlobValue,
  createEventId,
} from '../../../../src/domain/types/WarpTypes.js';

describe('WarpTypes', () => {
  describe('Value Reference Factory Functions', () => {
    describe('createInlineValue', () => {
      it('creates inline value with string', () => {
        const result = createInlineValue('hello');

        expect(result).toEqual({ type: 'inline', value: 'hello' });
      });

      it('creates inline value with number', () => {
        const result = createInlineValue(42);

        expect(result).toEqual({ type: 'inline', value: 42 });
      });

      it('creates inline value with object', () => {
        const obj = { name: 'Alice', age: 30 };
        const result = createInlineValue(obj);

        expect(result).toEqual({ type: 'inline', value: obj });
      });

      it('creates inline value with array', () => {
        const arr = [1, 2, 3];
        const result = createInlineValue(arr);

        expect(result).toEqual({ type: 'inline', value: arr });
      });

      it('creates inline value with null', () => {
        const result = createInlineValue(null);

        expect(result).toEqual({ type: 'inline', value: null });
      });

      it('creates inline value with boolean', () => {
        const result = createInlineValue(true);

        expect(result).toEqual({ type: 'inline', value: true });
      });
    });

    describe('createBlobValue', () => {
      it('creates blob value with OID', () => {
        const oid = 'abc123def456';
        const result = createBlobValue(oid);

        expect(result).toEqual({ type: 'blob', oid: 'abc123def456' });
      });

      it('creates blob value with full SHA', () => {
        const oid = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
        const result = createBlobValue(oid);

        expect(result).toEqual({ type: 'blob', oid });
      });
    });
  });

  describe('Operation Factory Functions', () => {
    describe('createNodeAdd', () => {
      it('creates NodeAdd operation', () => {
        const result = createNodeAdd('user:alice');

        expect(result).toEqual({
          type: 'NodeAdd',
          node: 'user:alice',
        });
      });

      it('creates NodeAdd with UUID-style node ID', () => {
        const nodeId = '550e8400-e29b-41d4-a716-446655440000';
        const result = createNodeAdd(nodeId);

        expect(result).toEqual({
          type: 'NodeAdd',
          node: nodeId,
        });
      });
    });

    describe('createNodeTombstone', () => {
      it('creates NodeTombstone operation', () => {
        const result = createNodeTombstone('user:bob');

        expect(result).toEqual({
          type: 'NodeTombstone',
          node: 'user:bob',
        });
      });
    });

    describe('createEdgeAdd', () => {
      it('creates EdgeAdd operation', () => {
        const result = createEdgeAdd('user:alice', 'user:bob', 'follows');

        expect(result).toEqual({
          type: 'EdgeAdd',
          from: 'user:alice',
          to: 'user:bob',
          label: 'follows',
        });
      });

      it('creates EdgeAdd with different label', () => {
        const result = createEdgeAdd('post:123', 'user:alice', 'authored_by');

        expect(result).toEqual({
          type: 'EdgeAdd',
          from: 'post:123',
          to: 'user:alice',
          label: 'authored_by',
        });
      });
    });

    describe('createEdgeTombstone', () => {
      it('creates EdgeTombstone operation', () => {
        const result = createEdgeTombstone('user:alice', 'user:bob', 'follows');

        expect(result).toEqual({
          type: 'EdgeTombstone',
          from: 'user:alice',
          to: 'user:bob',
          label: 'follows',
        });
      });
    });

    describe('createPropSet', () => {
      it('creates PropSet operation with inline value', () => {
        const value = createInlineValue('Alice');
        const result = createPropSet('user:alice', 'name', value);

        expect(result).toEqual({
          type: 'PropSet',
          node: 'user:alice',
          key: 'name',
          value: { type: 'inline', value: 'Alice' },
        });
      });

      it('creates PropSet operation with blob value', () => {
        const value = createBlobValue('abc123');
        const result = createPropSet('user:alice', 'avatar', value);

        expect(result).toEqual({
          type: 'PropSet',
          node: 'user:alice',
          key: 'avatar',
          value: { type: 'blob', oid: 'abc123' },
        });
      });

      it('creates PropSet with complex inline value', () => {
        const value = createInlineValue({ nested: { data: [1, 2, 3] } });
        const result = createPropSet('config:main', 'settings', value);

        expect(result).toEqual({
          type: 'PropSet',
          node: 'config:main',
          key: 'settings',
          value: { type: 'inline', value: { nested: { data: [1, 2, 3] } } },
        });
      });
    });
  });

  // Note: createPatch (schema:1 factory) tests removed - schema:1 is no longer supported as runtime option.
  // Use createPatchV2 from WarpTypesV2 for schema:2 patches.

  describe('EventId Factory Function', () => {
    describe('createEventId', () => {
      it('creates EventId with all fields', () => {
        const result = createEventId({
          lamport: 5,
          writerId: 'writer-1',
          patchSha: 'abc123def456',
          opIndex: 0,
        });

        expect(result).toEqual({
          lamport: 5,
          writerId: 'writer-1',
          patchSha: 'abc123def456',
          opIndex: 0,
        });
      });

      it('creates EventId with different opIndex', () => {
        const result = createEventId({
          lamport: 10,
          writerId: 'writer-2',
          patchSha: 'sha256hash',
          opIndex: 3,
        });

        expect(result.opIndex).toBe(3);
      });

      it('creates EventId with zero lamport', () => {
        const result = createEventId({
          lamport: 0,
          writerId: 'initial-writer',
          patchSha: 'genesis',
          opIndex: 0,
        });

        expect(result.lamport).toBe(0);
      });
    });
  });

  describe('Type Discriminators', () => {
    it('all operation types have distinct type field', () => {
      const nodeAdd = createNodeAdd('n1');
      const nodeTombstone = createNodeTombstone('n1');
      const edgeAdd = createEdgeAdd('n1', 'n2', 'rel');
      const edgeTombstone = createEdgeTombstone('n1', 'n2', 'rel');
      const propSet = createPropSet('n1', 'key', createInlineValue('val'));

      const types = [
        nodeAdd.type,
        nodeTombstone.type,
        edgeAdd.type,
        edgeTombstone.type,
        propSet.type,
      ];

      // All types should be unique
      const uniqueTypes = new Set(types);
      expect(uniqueTypes.size).toBe(5);
    });

    it('value refs have distinct type field', () => {
      const inline = createInlineValue('test');
      const blob = createBlobValue('oid');

      expect(inline.type).toBe('inline');
      expect(blob.type).toBe('blob');
      expect(inline.type).not.toBe(blob.type);
    });
  });

  // Note: Integration tests using createPatch (schema:1) removed.
  // See WarpTypesV2.test.js for schema:2 patch building integration tests.
});
