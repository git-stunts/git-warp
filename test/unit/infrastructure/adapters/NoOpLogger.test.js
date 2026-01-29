import { describe, it, expect } from 'vitest';
import NoOpLogger from '../../../../src/infrastructure/adapters/NoOpLogger.js';
import LoggerPort from '../../../../src/ports/LoggerPort.js';

describe('NoOpLogger', () => {
  describe('constructor', () => {
    it('creates an instance', () => {
      const logger = new NoOpLogger();
      expect(logger).toBeInstanceOf(NoOpLogger);
    });

    it('extends LoggerPort', () => {
      const logger = new NoOpLogger();
      expect(logger).toBeInstanceOf(LoggerPort);
    });
  });

  describe('logging methods', () => {
    it('debug does not throw', () => {
      const logger = new NoOpLogger();
      expect(() => logger.debug('test message')).not.toThrow();
      expect(() => logger.debug('test message', { key: 'value' })).not.toThrow();
    });

    it('info does not throw', () => {
      const logger = new NoOpLogger();
      expect(() => logger.info('test message')).not.toThrow();
      expect(() => logger.info('test message', { key: 'value' })).not.toThrow();
    });

    it('warn does not throw', () => {
      const logger = new NoOpLogger();
      expect(() => logger.warn('test message')).not.toThrow();
      expect(() => logger.warn('test message', { key: 'value' })).not.toThrow();
    });

    it('error does not throw', () => {
      const logger = new NoOpLogger();
      expect(() => logger.error('test message')).not.toThrow();
      expect(() => logger.error('test message', { key: 'value' })).not.toThrow();
    });

    it('methods return undefined', () => {
      const logger = new NoOpLogger();
      expect(logger.debug('test')).toBeUndefined();
      expect(logger.info('test')).toBeUndefined();
      expect(logger.warn('test')).toBeUndefined();
      expect(logger.error('test')).toBeUndefined();
    });
  });

  describe('child', () => {
    it('returns a new NoOpLogger instance', () => {
      const logger = new NoOpLogger();
      const child = logger.child({ requestId: '123' });

      expect(child).toBeInstanceOf(NoOpLogger);
      expect(child).not.toBe(logger);
    });

    it('child logger methods do not throw', () => {
      const logger = new NoOpLogger();
      const child = logger.child({ requestId: '123' });

      expect(() => child.debug('test')).not.toThrow();
      expect(() => child.info('test')).not.toThrow();
      expect(() => child.warn('test')).not.toThrow();
      expect(() => child.error('test')).not.toThrow();
    });

    it('child can create nested children', () => {
      const logger = new NoOpLogger();
      const child = logger.child({ level: 1 });
      const grandchild = child.child({ level: 2 });

      expect(grandchild).toBeInstanceOf(NoOpLogger);
      expect(() => grandchild.info('test')).not.toThrow();
    });
  });

  describe('zero overhead', () => {
    it('handles large context objects without performance issues (sanity check)', () => {
      const logger = new NoOpLogger();
      const largeContext = {};
      for (let i = 0; i < 1000; i++) {
        largeContext[`key${i}`] = `value${i}`;
      }

      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        logger.info('test message', largeContext);
      }
      const duration = Date.now() - start;

      // Generous threshold for CI environments with variable performance
      expect(duration).toBeLessThan(500);
    });
  });
});
