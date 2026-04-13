import { describe, it, expect } from 'vitest';
import ClockAdapter from '../../../../src/infrastructure/adapters/ClockAdapter.js';
import ClockPort from '../../../../src/ports/ClockPort.ts';

describe('ClockAdapter', () => {
  describe('constructor', () => {
    it('creates an instance', () => {
      const clock = new ClockAdapter();
      expect(clock).toBeInstanceOf(ClockAdapter);
    });

    it('extends ClockPort', () => {
      const clock = new ClockAdapter();
      expect(clock).toBeInstanceOf(ClockPort);
    });

    it('defaults to globalThis.performance', () => {
      const clock = new ClockAdapter();
      const value = clock.now();
      expect(typeof value).toBe('number');
      expect(value).toBeGreaterThan(0);
    });

    it('accepts a custom performanceImpl', () => {
      let called = false;
      const fake = { now: () => { called = true; return 42; } };
      const clock = new ClockAdapter({ performanceImpl: fake });
      const value = clock.now();
      expect(called).toBe(true);
      expect(value).toBe(42);
    });
  });

  describe('static factories', () => {
    it('node() returns a ClockAdapter using perf_hooks', () => {
      const clock = ClockAdapter.node();
      expect(clock).toBeInstanceOf(ClockAdapter);
      const value = clock.now();
      expect(typeof value).toBe('number');
      expect(value).toBeGreaterThan(0);
    });

    it('global() returns a ClockAdapter using globalThis.performance', () => {
      const clock = ClockAdapter.global();
      expect(clock).toBeInstanceOf(ClockAdapter);
      const value = clock.now();
      expect(typeof value).toBe('number');
      expect(value).toBeGreaterThan(0);
    });
  });

  describe('now()', () => {
    it('returns a number', () => {
      const clock = new ClockAdapter();
      expect(typeof clock.now()).toBe('number');
    });

    it('returns increasing values on successive calls', () => {
      const clock = new ClockAdapter();
      const a = clock.now();
      const b = clock.now();
      expect(b).toBeGreaterThanOrEqual(a);
    });

    it('delegates to the injected performanceImpl', () => {
      const values = [100, 200, 300];
      let idx = 0;
      const fake = { now: () => values[idx++] ?? 0 };
      const clock = new ClockAdapter({ performanceImpl: fake });

      expect(clock.now()).toBe(100);
      expect(clock.now()).toBe(200);
      expect(clock.now()).toBe(300);
    });
  });

  describe('timestamp()', () => {
    it('returns a string', () => {
      const clock = new ClockAdapter();
      expect(typeof clock.timestamp()).toBe('string');
    });

    it('returns a valid ISO 8601 string', () => {
      const clock = new ClockAdapter();
      const ts = clock.timestamp();
      // ISO strings end with 'Z' and can be parsed back to a valid Date
      expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      const parsed = new Date(ts);
      expect(parsed.toISOString()).toBe(ts);
    });

    it('returns a timestamp close to the current time', () => {
      const clock = new ClockAdapter();
      const before = Date.now();
      const ts = clock.timestamp();
      const after = Date.now();
      const parsed = new Date(ts).getTime();
      expect(parsed).toBeGreaterThanOrEqual(before);
      expect(parsed).toBeLessThanOrEqual(after);
    });
  });
});
