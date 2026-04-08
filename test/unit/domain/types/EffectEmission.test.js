import { describe, it, expect } from 'vitest';
import {
  createEffectEmission,
  canonicalEmissionJson,
  DELIVERY_MODES,
  DELIVERY_OUTCOMES,
} from '../../../../src/domain/types/EffectEmission.ts';

/** @type {any} */
const create = createEffectEmission;

describe('EffectEmission', () => {
  // -----------------------------------------------------------------------
  // Constants
  // -----------------------------------------------------------------------
  describe('constants', () => {
    it('exports DELIVERY_MODES', () => {
      expect(DELIVERY_MODES).toEqual(['live', 'replay', 'inspect']);
      expect(Object.isFrozen(DELIVERY_MODES)).toBe(true);
    });

    it('exports DELIVERY_OUTCOMES', () => {
      expect(DELIVERY_OUTCOMES).toEqual([
        'delivered',
        'suppressed',
        'failed',
        'skipped',
      ]);
      expect(Object.isFrozen(DELIVERY_OUTCOMES)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Valid construction
  // -----------------------------------------------------------------------
  describe('createEffectEmission', () => {
    it('creates an emission with all fields', () => {
      const emission = create({
        id: 'em-001',
        kind: 'notification',
        payload: { text: 'hello' },
        timestamp: 1000,
        writer: 'alice',
        coordinate: { frontier: { alice: 'abc123' }, ceiling: 5 },
      });

      expect(emission.id).toBe('em-001');
      expect(emission.kind).toBe('notification');
      expect(emission.payload).toEqual({ text: 'hello' });
      expect(emission.timestamp).toBe(1000);
      expect(emission.writer).toBe('alice');
      expect(emission.coordinate.frontier).toEqual({ alice: 'abc123' });
      expect(emission.coordinate.ceiling).toBe(5);
    });

    it('creates an emission with null writer', () => {
      const emission = create({
        id: 'em-002',
        kind: 'diagnostic',
        payload: 'debug info',
        timestamp: 2000,
        writer: null,
        coordinate: { frontier: null, ceiling: null },
      });

      expect(emission.writer).toBeNull();
      expect(emission.coordinate.frontier).toBeNull();
      expect(emission.coordinate.ceiling).toBeNull();
    });

    it('returns a frozen object', () => {
      const emission = create({
        id: 'em-003',
        kind: 'export',
        payload: {},
        timestamp: 3000,
        writer: 'bob',
        coordinate: { frontier: null, ceiling: null },
      });

      expect(Object.isFrozen(emission)).toBe(true);
      expect(Object.isFrozen(emission.coordinate)).toBe(true);
    });

    it('defensively copies the coordinate frontier', () => {
      const frontier = { alice: 'abc' };
      const emission = create({
        id: 'em-004',
        kind: 'test',
        payload: null,
        timestamp: 0,
        writer: null,
        coordinate: { frontier, ceiling: null },
      });

      frontier.alice = 'MUTATED';
      expect(emission.coordinate.frontier).toEqual({ alice: 'abc' });
    });
  });

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------
  describe('validation', () => {
    const valid = {
      id: 'em-v',
      kind: 'test',
      payload: null,
      timestamp: 0,
      writer: null,
      coordinate: { frontier: null, ceiling: null },
    };

    it('rejects empty id', () => {
      expect(() => create({ ...valid, id: '' })).toThrow('id');
    });

    it('rejects non-string id', () => {
      expect(() => create({ ...valid, id: 123 })).toThrow('id');
    });

    it('rejects empty kind', () => {
      expect(() => create({ ...valid, kind: '' })).toThrow('kind');
    });

    it('rejects non-string kind', () => {
      expect(() => create({ ...valid, kind: 42 })).toThrow('kind');
    });

    it('rejects non-number timestamp', () => {
      expect(() => create({ ...valid, timestamp: 'now' })).toThrow('timestamp');
    });

    it('rejects negative timestamp', () => {
      expect(() => create({ ...valid, timestamp: -1 })).toThrow('timestamp');
    });

    it('rejects missing coordinate', () => {
      expect(() => create({ ...valid, coordinate: null })).toThrow('coordinate');
    });
  });

  // -----------------------------------------------------------------------
  // Canonical JSON
  // -----------------------------------------------------------------------
  describe('canonicalEmissionJson', () => {
    it('produces deterministic JSON with sorted keys', () => {
      const emission = create({
        id: 'em-json',
        kind: 'test',
        payload: { z: 1, a: 2 },
        timestamp: 100,
        writer: null,
        coordinate: { frontier: null, ceiling: null },
      });

      const json = canonicalEmissionJson(emission);
      const parsed = JSON.parse(json);

      // Keys should be sorted at every level
      const topKeys = Object.keys(parsed);
      expect(topKeys).toEqual([...topKeys].sort());
    });

    it('produces identical output for identical emissions', () => {
      const args = {
        id: 'em-det',
        kind: 'test',
        payload: { b: 2, a: 1 },
        timestamp: 50,
        writer: 'w',
        coordinate: { frontier: { w: 'sha' }, ceiling: 3 },
      };

      const json1 = canonicalEmissionJson(create(args));
      const json2 = canonicalEmissionJson(create(args));
      expect(json1).toBe(json2);
    });
  });
});
