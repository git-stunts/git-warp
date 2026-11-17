import { describe, it, expect } from 'vitest';
import NoOpLogger from '../../../../src/infrastructure/adapters/NoOpLogger.ts';
import LoggerPort from '../../../../src/ports/LoggerPort.ts';

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
    // Oracle: a no-op logger does no work per call, so it never reads the
    // context. A wall-clock budget cannot show that and flakes under load;
    // a count of context reads shows it exactly.
    it('never reads the context it is given', () => {
      const logger = new NoOpLogger();
      let reads = 0;
      const context = new Proxy<Record<string, string>>({ key: 'value' }, {
        get(target, property, receiver) {
          reads += 1;
          return Reflect.get(target, property, receiver);
        },
        has(target, property) {
          reads += 1;
          return Reflect.has(target, property);
        },
        ownKeys(target) {
          reads += 1;
          return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(target, property) {
          reads += 1;
          return Reflect.getOwnPropertyDescriptor(target, property);
        },
      });

      for (let i = 0; i < 10_000; i++) {
        logger.debug('test message', context);
        logger.info('test message', context);
        logger.warn('test message', context);
        logger.error('test message', context);
      }
      logger.child(context).info('test message', context);

      expect(reads).toBe(0);
    });
  });
});
