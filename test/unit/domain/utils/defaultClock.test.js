import { describe, it, expect } from 'vitest';
import defaultClock from '../../../../src/domain/utils/defaultClock.ts';

describe('defaultClock', () => {
  describe('now', () => {
    it('returns a number', () => {
      expect(typeof defaultClock.now()).toBe('number');
    });

    it('returns monotonically non-decreasing values', () => {
      const a = defaultClock.now();
      const b = defaultClock.now();
      expect(b).toBeGreaterThanOrEqual(a);
    });
  });

  describe('timestamp', () => {
    it('returns an ISO 8601 string', () => {
      const ts = defaultClock.timestamp();
      // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
      expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('is parseable by new Date()', () => {
      const ts = defaultClock.timestamp();
      const parsed = new Date(ts);
      expect(parsed.getTime()).not.toBeNaN();
    });

    it('returns a recent timestamp', () => {
      const before = Date.now();
      const ts = defaultClock.timestamp();
      const after = Date.now();
      const parsed = new Date(ts).getTime();
      expect(parsed).toBeGreaterThanOrEqual(before);
      expect(parsed).toBeLessThanOrEqual(after);
    });
  });
});
