import { describe, it, expect } from 'vitest';
import GraphNode_ from '../../../../src/domain/entities/GraphNode.js';

/** @type {any} */
const GraphNode = GraphNode_;

describe('GraphNode', () => {
  describe('construction with valid data', () => {
    it('creates a node with sha and message', () => {
      const node = new GraphNode({
        sha: 'abc123',
        message: 'test message',
      });

      expect(node.sha).toBe('abc123');
      expect(node.message).toBe('test message');
    });

    it('creates a node with all fields', () => {
      const node = new GraphNode({
        sha: 'abc123',
        message: 'test message',
        author: 'John Doe',
        date: '2024-01-15',
        parents: ['parent1', 'parent2'],
      });

      expect(node.sha).toBe('abc123');
      expect(node.message).toBe('test message');
      expect(node.author).toBe('John Doe');
      expect(node.date).toBe('2024-01-15');
      expect(node.parents).toEqual(['parent1', 'parent2']);
    });
  });

  describe('validation errors', () => {
    describe('sha validation', () => {
      it('throws when sha is missing', () => {
        expect(() => new GraphNode({ message: 'test' })).toThrow(
          'GraphNode requires a valid sha string'
        );
      });

      it('throws when sha is null', () => {
        expect(() => new GraphNode({ sha: null, message: 'test' })).toThrow(
          'GraphNode requires a valid sha string'
        );
      });

      it('throws when sha is empty string', () => {
        expect(() => new GraphNode({ sha: '', message: 'test' })).toThrow(
          'GraphNode requires a valid sha string'
        );
      });

      it('throws when sha is not a string', () => {
        expect(() => new GraphNode({ sha: 123, message: 'test' })).toThrow(
          'GraphNode requires a valid sha string'
        );
      });
    });

    describe('message validation', () => {
      it('throws when message is missing', () => {
        expect(() => new GraphNode({ sha: 'abc123' })).toThrow(
          'GraphNode requires a valid message string'
        );
      });

      it('throws when message is null', () => {
        expect(() => new GraphNode({ sha: 'abc123', message: null })).toThrow(
          'GraphNode requires a valid message string'
        );
      });

      it('throws when message is empty string', () => {
        expect(() => new GraphNode({ sha: 'abc123', message: '' })).toThrow(
          'GraphNode requires a valid message string'
        );
      });

      it('throws when message is not a string', () => {
        expect(() => new GraphNode({ sha: 'abc123', message: 42 })).toThrow(
          'GraphNode requires a valid message string'
        );
      });
    });

    describe('parents validation', () => {
      it('throws when parents is not an array', () => {
        expect(
          () => new GraphNode({ sha: 'abc123', message: 'test', parents: 'not-array' })
        ).toThrow('GraphNode parents must be an array');
      });

      it('throws when parents is an object', () => {
        expect(
          () => new GraphNode({ sha: 'abc123', message: 'test', parents: {} })
        ).toThrow('GraphNode parents must be an array');
      });

      it('throws when parents is a number', () => {
        expect(
          () => new GraphNode({ sha: 'abc123', message: 'test', parents: 123 })
        ).toThrow('GraphNode parents must be an array');
      });
    });
  });

  describe('immutability', () => {
    it('freezes the node after construction', () => {
      const node = new GraphNode({
        sha: 'abc123',
        message: 'test message',
      });

      expect(Object.isFrozen(node)).toBe(true);
    });

    it('prevents modification of sha', () => {
      const node = new GraphNode({
        sha: 'abc123',
        message: 'test message',
      });

      expect(() => {
        node.sha = 'modified';
      }).toThrow();
    });

    it('prevents modification of message', () => {
      const node = new GraphNode({
        sha: 'abc123',
        message: 'test message',
      });

      expect(() => {
        node.message = 'modified';
      }).toThrow();
    });

    it('prevents adding new properties', () => {
      const node = new GraphNode({
        sha: 'abc123',
        message: 'test message',
      });

      expect(() => {
        node.newProperty = 'value';
      }).toThrow();
    });
  });

  describe('optional fields', () => {
    it('allows author to be undefined', () => {
      const node = new GraphNode({
        sha: 'abc123',
        message: 'test message',
      });

      expect(node.author).toBeUndefined();
    });

    it('allows date to be undefined', () => {
      const node = new GraphNode({
        sha: 'abc123',
        message: 'test message',
      });

      expect(node.date).toBeUndefined();
    });

    it('allows both author and date to be undefined', () => {
      const node = new GraphNode({
        sha: 'abc123',
        message: 'test message',
        parents: ['parent1'],
      });

      expect(node.author).toBeUndefined();
      expect(node.date).toBeUndefined();
      expect(node.parents).toEqual(['parent1']);
    });
  });

  describe('parents array', () => {
    it('defaults to empty array when parents not provided', () => {
      const node = new GraphNode({
        sha: 'abc123',
        message: 'test message',
      });

      expect(node.parents).toEqual([]);
    });

    it('accepts empty parents array', () => {
      const node = new GraphNode({
        sha: 'abc123',
        message: 'test message',
        parents: [],
      });

      expect(node.parents).toEqual([]);
    });

    it('accepts single parent', () => {
      const node = new GraphNode({
        sha: 'abc123',
        message: 'test message',
        parents: ['parent1'],
      });

      expect(node.parents).toEqual(['parent1']);
      expect(node.parents).toHaveLength(1);
    });

    it('accepts multiple parents', () => {
      const node = new GraphNode({
        sha: 'abc123',
        message: 'test message',
        parents: ['parent1', 'parent2', 'parent3'],
      });

      expect(node.parents).toEqual(['parent1', 'parent2', 'parent3']);
      expect(node.parents).toHaveLength(3);
    });
  });
});
