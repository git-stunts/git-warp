import { describe, it, expect } from 'vitest';
import {
  IndexShard,
  MetaShard,
  EdgeShard,
  LabelShard,
  PropertyShard,
  ReceiptShard,
} from '../../../../src/domain/artifacts/IndexShard.js';

describe('IndexShard family', () => {
  describe('MetaShard', () => {
    it('constructs with valid fields', () => {
      const s = new MetaShard({
        shardKey: 'ab',
        nodeToGlobal: [['user:alice', 0]],
        nextLocalId: 1,
        alive: new Uint8Array([1, 2, 3]),
      });
      expect(s).toBeInstanceOf(MetaShard);
      expect(s).toBeInstanceOf(IndexShard);
      expect(s.shardKey).toBe('ab');
      expect(s.nodeToGlobal).toHaveLength(1);
      expect(s.nextLocalId).toBe(1);
    });

    it('is frozen', () => {
      const s = new MetaShard({
        shardKey: 'ab', nodeToGlobal: [], nextLocalId: 0, alive: new Uint8Array(0),
      });
      expect(Object.isFrozen(s)).toBe(true);
    });

    it('defaults schemaVersion to 1', () => {
      const s = new MetaShard({
        shardKey: 'ab', nodeToGlobal: [], nextLocalId: 0, alive: new Uint8Array(0),
      });
      expect(s.schemaVersion).toBe(1);
    });
  });

  describe('EdgeShard', () => {
    it('constructs with fwd direction', () => {
      const s = new EdgeShard({
        shardKey: 'ab', direction: 'fwd', buckets: { all: { '0': new Uint8Array(0) } },
      });
      expect(s).toBeInstanceOf(EdgeShard);
      expect(s.direction).toBe('fwd');
    });

    it('constructs with rev direction', () => {
      const s = new EdgeShard({
        shardKey: 'ab', direction: 'rev', buckets: {},
      });
      expect(s.direction).toBe('rev');
    });

    it('rejects invalid direction', () => {
      expect(() => new EdgeShard({
        shardKey: 'ab', direction: /** @type {any} */ ('up'), buckets: {},
      })).toThrow("must be 'fwd' or 'rev'");
    });
  });

  describe('LabelShard', () => {
    it('constructs with labels', () => {
      const s = new LabelShard({ labels: [['knows', 0], ['likes', 1]] });
      expect(s).toBeInstanceOf(LabelShard);
      expect(s.labels).toHaveLength(2);
      expect(s.shardKey).toBe('global');
    });
  });

  describe('PropertyShard', () => {
    it('constructs with entries', () => {
      const s = new PropertyShard({
        shardKey: 'ab', entries: [['user:alice', { name: 'Alice' }]],
      });
      expect(s).toBeInstanceOf(PropertyShard);
      expect(s.entries).toHaveLength(1);
    });
  });

  describe('ReceiptShard', () => {
    it('constructs with build metadata', () => {
      const s = new ReceiptShard({
        version: 1, nodeCount: 100, labelCount: 5, shardCount: 16,
      });
      expect(s).toBeInstanceOf(ReceiptShard);
      expect(s).toBeInstanceOf(IndexShard);
      expect(s.nodeCount).toBe(100);
      expect(s.shardKey).toBe('receipt');
    });
  });

  describe('instanceof dispatch', () => {
    it('dispatches correctly across all subtypes', () => {
      const meta = new MetaShard({ shardKey: 'ab', nodeToGlobal: [], nextLocalId: 0, alive: new Uint8Array(0) });
      const edge = new EdgeShard({ shardKey: 'ab', direction: 'fwd', buckets: {} });
      const label = new LabelShard({ labels: [] });
      const prop = new PropertyShard({ shardKey: 'ab', entries: [] });
      const receipt = new ReceiptShard({ version: 1, nodeCount: 0, labelCount: 0, shardCount: 0 });

      expect(meta instanceof MetaShard).toBe(true);
      expect(meta instanceof EdgeShard).toBe(false);
      expect(edge instanceof EdgeShard).toBe(true);
      expect(label instanceof LabelShard).toBe(true);
      expect(prop instanceof PropertyShard).toBe(true);
      expect(receipt instanceof ReceiptShard).toBe(true);

      // All are IndexShard
      for (const s of [meta, edge, label, prop, receipt]) {
        expect(s instanceof IndexShard).toBe(true);
      }
    });
  });

  describe('constructor validation', () => {
    it('rejects non-string shardKey', () => {
      expect(() => new MetaShard({
        shardKey: /** @type {any} */ (42), nodeToGlobal: [], nextLocalId: 0, alive: new Uint8Array(0),
      })).toThrow('shardKey must be a non-empty string');
    });

    it('rejects invalid schemaVersion', () => {
      expect(() => new MetaShard({
        shardKey: 'ab', schemaVersion: 0, nodeToGlobal: [], nextLocalId: 0, alive: new Uint8Array(0),
      })).toThrow('positive integer');
    });
  });
});
