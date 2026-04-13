import { describe, it, expect } from 'vitest';
import ConflictTarget from '../../../../../src/domain/types/conflict/ConflictTarget.ts';

describe('ConflictTarget', () => {
  const NODE_TARGET = /** @type {any} */ ({
    targetKind: 'node',
    targetDigest: 'abc123',
    entityId: 'node-1',
  });

  const EDGE_TARGET = /** @type {any} */ ({
    targetKind: 'edge',
    targetDigest: 'def456',
    from: 'a',
    to: 'b',
    label: 'KNOWS',
    edgeKey: 'a\0b\0KNOWS',
  });

  const NODE_PROP_TARGET = /** @type {any} */ ({
    targetKind: 'node_property',
    targetDigest: 'ghi789',
    entityId: 'node-1',
    propertyKey: 'name',
  });

  const EDGE_PROP_TARGET = /** @type {any} */ ({
    targetKind: 'edge_property',
    targetDigest: 'jkl012',
    from: 'a',
    to: 'b',
    label: 'KNOWS',
    edgeKey: 'a\0b\0KNOWS',
    propertyKey: 'weight',
  });

  describe('constructor validation', () => {
    it('creates a frozen node target', () => {
      const t = new ConflictTarget(NODE_TARGET);
      expect(t.targetKind).toBe('node');
      expect(t.targetDigest).toBe('abc123');
      expect(t.entityId).toBe('node-1');
      expect(t.propertyKey).toBeUndefined();
      expect(t.from).toBeUndefined();
      expect(t.to).toBeUndefined();
      expect(t.label).toBeUndefined();
      expect(t.edgeKey).toBeUndefined();
      expect(Object.isFrozen(t)).toBe(true);
    });

    it('creates an edge target', () => {
      const t = new ConflictTarget(EDGE_TARGET);
      expect(t.targetKind).toBe('edge');
      expect(t.from).toBe('a');
      expect(t.to).toBe('b');
      expect(t.label).toBe('KNOWS');
      expect(t.edgeKey).toBe('a\0b\0KNOWS');
    });

    it('creates a node_property target', () => {
      const t = new ConflictTarget(NODE_PROP_TARGET);
      expect(t.targetKind).toBe('node_property');
      expect(t.entityId).toBe('node-1');
      expect(t.propertyKey).toBe('name');
    });

    it('creates an edge_property target', () => {
      const t = new ConflictTarget(EDGE_PROP_TARGET);
      expect(t.targetKind).toBe('edge_property');
      expect(t.propertyKey).toBe('weight');
    });

    it('treats null optional fields as undefined', () => {
      const t = new ConflictTarget(/** @type {any} */ ({
        targetKind: 'node',
        targetDigest: 'abc',
        entityId: null,
      }));
      expect(t.entityId).toBeUndefined();
    });

    it('rejects invalid targetKind', () => {
      expect(() => new ConflictTarget(/** @type {any} */ ({ ...NODE_TARGET, targetKind: 'blob' })))
        .toThrow('targetKind must be one of');
    });

    it('rejects empty targetDigest', () => {
      expect(() => new ConflictTarget(/** @type {any} */ ({ ...NODE_TARGET, targetDigest: '' })))
        .toThrow('targetDigest must be a non-empty string');
    });

    it('rejects non-string targetDigest', () => {
      expect(() => new ConflictTarget(/** @type {any} */ ({ ...NODE_TARGET, targetDigest: 42 })))
        .toThrow('targetDigest must be a non-empty string');
    });

    it('rejects empty string for optional field', () => {
      expect(() => new ConflictTarget(/** @type {any} */ ({ ...NODE_TARGET, entityId: '' })))
        .toThrow('entityId must be a non-empty string when provided');
    });

    it('rejects non-string value for optional field', () => {
      expect(() => new ConflictTarget(/** @type {any} */ ({ ...EDGE_TARGET, from: 42 })))
        .toThrow('from must be a non-empty string when provided');
    });
  });

  describe('touchesEntity', () => {
    it('matches by entityId', () => {
      const t = new ConflictTarget(NODE_TARGET);
      expect(t.touchesEntity('node-1')).toBe(true);
      expect(t.touchesEntity('node-2')).toBe(false);
    });

    it('matches by from', () => {
      const t = new ConflictTarget(EDGE_TARGET);
      expect(t.touchesEntity('a')).toBe(true);
    });

    it('matches by to', () => {
      const t = new ConflictTarget(EDGE_TARGET);
      expect(t.touchesEntity('b')).toBe(true);
    });

    it('returns false for unrelated entity', () => {
      const t = new ConflictTarget(EDGE_TARGET);
      expect(t.touchesEntity('x')).toBe(false);
    });

    it('matches node_property by entityId', () => {
      const t = new ConflictTarget(NODE_PROP_TARGET);
      expect(t.touchesEntity('node-1')).toBe(true);
    });
  });

  describe('matchesSelector', () => {
    it('matches all when selector is null', () => {
      const t = new ConflictTarget(NODE_TARGET);
      expect(t.matchesSelector(null)).toBe(true);
    });

    it('matches all when selector is undefined', () => {
      const t = new ConflictTarget(NODE_TARGET);
      expect(t.matchesSelector(undefined)).toBe(true);
    });

    it('rejects when targetKind differs', () => {
      const t = new ConflictTarget(NODE_TARGET);
      expect(t.matchesSelector({ targetKind: 'edge' })).toBe(false);
    });

    it('matches when targetKind matches and no other fields set', () => {
      const t = new ConflictTarget(NODE_TARGET);
      expect(t.matchesSelector({ targetKind: 'node' })).toBe(true);
    });

    it('matches when all selector fields match', () => {
      const t = new ConflictTarget(NODE_PROP_TARGET);
      expect(t.matchesSelector({
        targetKind: 'node_property',
        entityId: 'node-1',
        propertyKey: 'name',
      })).toBe(true);
    });

    it('rejects when a selector field does not match', () => {
      const t = new ConflictTarget(NODE_PROP_TARGET);
      expect(t.matchesSelector({
        targetKind: 'node_property',
        entityId: 'node-1',
        propertyKey: 'age',
      })).toBe(false);
    });

    it('matches edge target with from/to/label selector', () => {
      const t = new ConflictTarget(EDGE_TARGET);
      expect(t.matchesSelector({
        targetKind: 'edge',
        from: 'a',
        to: 'b',
        label: 'KNOWS',
      })).toBe(true);
    });

    it('rejects edge target with wrong from', () => {
      const t = new ConflictTarget(EDGE_TARGET);
      expect(t.matchesSelector({
        targetKind: 'edge',
        from: 'x',
      })).toBe(false);
    });
  });

  describe('JSON serialization', () => {
    it('round-trips through JSON preserving structure', () => {
      const t = new ConflictTarget(EDGE_PROP_TARGET);
      const json = JSON.parse(JSON.stringify(t));
      expect(json.targetKind).toBe('edge_property');
      expect(json.from).toBe('a');
      expect(json.propertyKey).toBe('weight');
    });

    it('omits undefined optional fields from JSON', () => {
      const t = new ConflictTarget(NODE_TARGET);
      const json = JSON.parse(JSON.stringify(t));
      expect('from' in json).toBe(false);
      expect('to' in json).toBe(false);
      expect('label' in json).toBe(false);
      expect('edgeKey' in json).toBe(false);
      expect('propertyKey' in json).toBe(false);
    });
  });
});
