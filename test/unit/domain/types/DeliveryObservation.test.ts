import { describe, it, expect } from 'vitest';
import {
  createDeliveryObservation,
} from '../../../../src/domain/types/DeliveryObservation.ts';
import { canonicalObservationJson } from '../../../../src/infrastructure/codecs/DeliveryObservationJsonCodec.ts';

const create = (createDeliveryObservation) as any;

describe('DeliveryObservation', () => {
  // -----------------------------------------------------------------------
  // Valid construction
  // -----------------------------------------------------------------------
  describe('createDeliveryObservation', () => {
    it('creates an observation with all fields', () => {
      const obs = create({
        emissionId: 'em-001',
        sinkId: 'console',
        outcome: 'delivered',
        timestamp: 1000,
        lens: { mode: 'live', suppressExternal: false },
      });

      expect(obs.emissionId).toBe('em-001');
      expect(obs.sinkId).toBe('console');
      expect(obs.outcome).toBe('delivered');
      expect(obs.timestamp).toBe(1000);
      expect(obs.lens.mode).toBe('live');
      expect(obs.lens.suppressExternal).toBe(false);
      expect(obs.reason).toBeUndefined();
    });

    it('creates a suppressed observation with reason', () => {
      const obs = create({
        emissionId: 'em-002',
        sinkId: 'webhook',
        outcome: 'suppressed',
        reason: 'replay mode — external delivery blocked',
        timestamp: 2000,
        lens: { mode: 'replay', suppressExternal: true },
      });

      expect(obs.outcome).toBe('suppressed');
      expect(obs.reason).toBe('replay mode — external delivery blocked');
      expect(obs.lens.mode).toBe('replay');
      expect(obs.lens.suppressExternal).toBe(true);
    });

    it('creates a failed observation', () => {
      const obs = create({
        emissionId: 'em-003',
        sinkId: 'http',
        outcome: 'failed',
        reason: 'transport unavailable',
        timestamp: 3000,
        lens: { mode: 'live', suppressExternal: false },
      });

      expect(obs.outcome).toBe('failed');
    });

    it('creates a skipped observation', () => {
      const obs = create({
        emissionId: 'em-004',
        sinkId: 'filtered',
        outcome: 'skipped',
        reason: 'kind not in sink filter',
        timestamp: 4000,
        lens: { mode: 'live', suppressExternal: false },
      });

      expect(obs.outcome).toBe('skipped');
    });

    it('returns a frozen object', () => {
      const obs = create({
        emissionId: 'em-005',
        sinkId: 's',
        outcome: 'delivered',
        timestamp: 0,
        lens: { mode: 'live', suppressExternal: false },
      });

      expect(Object.isFrozen(obs)).toBe(true);
      expect(Object.isFrozen(obs.lens)).toBe(true);
    });

    it('defensively copies the lens', () => {
      const lens = { mode: 'live', suppressExternal: false };
      const obs = create({
        emissionId: 'em-006',
        sinkId: 's',
        outcome: 'delivered',
        timestamp: 0,
        lens,
      });

      lens.mode = 'replay';
      expect(obs.lens.mode).toBe('live');
    });
  });

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------
  describe('validation', () => {
    const valid = {
      emissionId: 'em-v',
      sinkId: 'sink',
      outcome: 'delivered',
      timestamp: 0,
      lens: { mode: 'live', suppressExternal: false },
    };

    it('rejects empty emissionId', () => {
      expect(() => create({ ...valid, emissionId: '' })).toThrow('emissionId');
    });

    it('rejects empty sinkId', () => {
      expect(() => create({ ...valid, sinkId: '' })).toThrow('sinkId');
    });

    it('rejects invalid outcome', () => {
      expect(() => create({ ...valid, outcome: 'unknown' })).toThrow('outcome');
    });

    it('rejects non-number timestamp', () => {
      expect(() => create({ ...valid, timestamp: 'now' })).toThrow('timestamp');
    });

    it('rejects missing lens', () => {
      expect(() => create({ ...valid, lens: null })).toThrow('lens');
    });

    it('rejects invalid lens mode', () => {
      expect(() =>
        create({ ...valid, lens: { mode: 'turbo', suppressExternal: false } }),
      ).toThrow('mode');
    });

    it('rejects non-boolean suppressExternal', () => {
      expect(() =>
        create({ ...valid, lens: { mode: 'live', suppressExternal: 'yes' } }),
      ).toThrow('suppressExternal');
    });
  });

  // -----------------------------------------------------------------------
  // Canonical JSON
  // -----------------------------------------------------------------------
  describe('canonicalObservationJson', () => {
    it('produces deterministic JSON with sorted keys', () => {
      const obs = create({
        emissionId: 'em-json',
        sinkId: 'sink',
        outcome: 'delivered',
        timestamp: 100,
        lens: { mode: 'live', suppressExternal: false },
      });

      const json = canonicalObservationJson(obs);
      const parsed = JSON.parse(json);
      const topKeys = Object.keys(parsed);
      expect(topKeys).toEqual([...topKeys].sort());
    });
  });
});
