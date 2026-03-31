import { describe, it, expect } from 'vitest';
import {
  createDeliveryLens,
  LIVE_LENS,
  REPLAY_LENS,
  INSPECT_LENS,
} from '../../../../src/domain/types/DeliveryLens.js';

/** @type {any} */
const create = createDeliveryLens;

describe('DeliveryLens', () => {
  // -----------------------------------------------------------------------
  // Preset lenses
  // -----------------------------------------------------------------------
  describe('preset lenses', () => {
    it('LIVE_LENS is live + no suppression', () => {
      expect(LIVE_LENS.mode).toBe('live');
      expect(LIVE_LENS.suppressExternal).toBe(false);
      expect(Object.isFrozen(LIVE_LENS)).toBe(true);
    });

    it('REPLAY_LENS is replay + suppressed', () => {
      expect(REPLAY_LENS.mode).toBe('replay');
      expect(REPLAY_LENS.suppressExternal).toBe(true);
      expect(Object.isFrozen(REPLAY_LENS)).toBe(true);
    });

    it('INSPECT_LENS is inspect + suppressed', () => {
      expect(INSPECT_LENS.mode).toBe('inspect');
      expect(INSPECT_LENS.suppressExternal).toBe(true);
      expect(Object.isFrozen(INSPECT_LENS)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Factory
  // -----------------------------------------------------------------------
  describe('createDeliveryLens', () => {
    it('creates a custom lens', () => {
      const lens = create({ mode: 'live', suppressExternal: true });
      expect(lens.mode).toBe('live');
      expect(lens.suppressExternal).toBe(true);
    });

    it('returns a frozen object', () => {
      const lens = create({ mode: 'replay', suppressExternal: false });
      expect(Object.isFrozen(lens)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------
  describe('validation', () => {
    it('rejects invalid mode', () => {
      expect(() => create({ mode: 'turbo', suppressExternal: false })).toThrow(
        'mode',
      );
    });

    it('rejects non-boolean suppressExternal', () => {
      expect(() => create({ mode: 'live', suppressExternal: 1 })).toThrow(
        'suppressExternal',
      );
    });

    it('rejects null', () => {
      expect(() => create(null)).toThrow();
    });
  });
});
