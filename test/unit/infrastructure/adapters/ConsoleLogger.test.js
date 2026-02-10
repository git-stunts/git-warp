import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ConsoleLogger, { LogLevel } from '../../../../src/infrastructure/adapters/ConsoleLogger.js';
import LoggerPort from '../../../../src/ports/LoggerPort.js';

describe('ConsoleLogger', () => {
  /** @type {any} */
  let consoleLogSpy;
  /** @type {any} */
  let consoleWarnSpy;
  /** @type {any} */
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('LogLevel', () => {
    it('exports correct log level values', () => {
      expect(LogLevel.DEBUG).toBe(0);
      expect(LogLevel.INFO).toBe(1);
      expect(LogLevel.WARN).toBe(2);
      expect(LogLevel.ERROR).toBe(3);
      expect(LogLevel.SILENT).toBe(4);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(LogLevel)).toBe(true);
    });
  });

  describe('constructor', () => {
    it('creates an instance with defaults', () => {
      const logger = new ConsoleLogger();
      expect(logger).toBeInstanceOf(ConsoleLogger);
    });

    it('extends LoggerPort', () => {
      const logger = new ConsoleLogger();
      expect(logger).toBeInstanceOf(LoggerPort);
    });

    it('accepts numeric log level', () => {
      const logger = new ConsoleLogger({ level: LogLevel.DEBUG });
      logger.debug('test');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('accepts string log level', () => {
      const logger = new ConsoleLogger({ level: /** @type {any} */ ('debug') });
      logger.debug('test');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('defaults to INFO level', () => {
      const logger = new ConsoleLogger();
      logger.debug('debug message');
      logger.info('info message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    });

    it('accepts custom context', () => {
      const logger = new ConsoleLogger({ level: LogLevel.DEBUG, context: { service: 'test' } });
      logger.info('test');

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.service).toBe('test');
    });

    it('accepts custom timestampFn', () => {
      const customTimestamp = '2026-01-28T12:00:00.000Z';
      const logger = new ConsoleLogger({
        level: LogLevel.DEBUG,
        timestampFn: () => customTimestamp
      });
      logger.info('test');

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.timestamp).toBe(customTimestamp);
    });
  });

  describe('level filtering', () => {
    it('DEBUG level logs all messages', () => {
      const logger = new ConsoleLogger({ level: LogLevel.DEBUG });

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleLogSpy).toHaveBeenCalledTimes(2); // debug, info
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('INFO level filters debug messages', () => {
      const logger = new ConsoleLogger({ level: LogLevel.INFO });

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1); // info only
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('WARN level filters debug and info messages', () => {
      const logger = new ConsoleLogger({ level: LogLevel.WARN });

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('ERROR level filters all but error messages', () => {
      const logger = new ConsoleLogger({ level: LogLevel.ERROR });

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('SILENT level filters all messages', () => {
      const logger = new ConsoleLogger({ level: LogLevel.SILENT });

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('structured output', () => {
    it('outputs valid JSON', () => {
      const logger = new ConsoleLogger({ level: LogLevel.DEBUG });
      logger.info('test message');

      expect(() => JSON.parse(consoleLogSpy.mock.calls[0][0])).not.toThrow();
    });

    it('includes timestamp, level, and message', () => {
      const logger = new ConsoleLogger({ level: LogLevel.DEBUG });
      logger.info('test message');

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.timestamp).toBeDefined();
      expect(output.level).toBe('INFO');
      expect(output.message).toBe('test message');
    });

    it('includes context in output', () => {
      const logger = new ConsoleLogger({ level: LogLevel.DEBUG });
      logger.info('test', { operation: 'createNode', sha: 'abc123' });

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.operation).toBe('createNode');
      expect(output.sha).toBe('abc123');
    });

    it('merges base context with per-call context', () => {
      const logger = new ConsoleLogger({
        level: LogLevel.DEBUG,
        context: { service: 'test-service' }
      });
      logger.info('test', { operation: 'test' });

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.service).toBe('test-service');
      expect(output.operation).toBe('test');
    });

    it('per-call context overrides base context', () => {
      const logger = new ConsoleLogger({
        level: LogLevel.DEBUG,
        context: { key: 'base' }
      });
      logger.info('test', { key: 'override' });

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.key).toBe('override');
    });

    it('uses console.warn for WARN level', () => {
      const logger = new ConsoleLogger({ level: LogLevel.DEBUG });
      logger.warn('warning message');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
      expect(output.level).toBe('WARN');
    });

    it('uses console.error for ERROR level', () => {
      const logger = new ConsoleLogger({ level: LogLevel.DEBUG });
      logger.error('error message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(output.level).toBe('ERROR');
    });
  });

  describe('child loggers', () => {
    it('returns a new ConsoleLogger instance', () => {
      const logger = new ConsoleLogger({ level: LogLevel.DEBUG });
      const child = logger.child({ component: 'GraphService' });

      expect(child).toBeInstanceOf(ConsoleLogger);
      expect(child).not.toBe(logger);
    });

    it('child inherits parent level', () => {
      const logger = new ConsoleLogger({ level: LogLevel.WARN });
      const child = logger.child({ component: 'test' });

      child.info('should not appear');
      child.warn('should appear');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });

    it('child inherits parent context', () => {
      const logger = new ConsoleLogger({
        level: LogLevel.DEBUG,
        context: { service: 'warp' }
      });
      const child = logger.child({ component: 'GraphService' });

      child.info('test');

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.service).toBe('warp');
      expect(output.component).toBe('GraphService');
    });

    it('child context overrides parent context for same keys', () => {
      const logger = new ConsoleLogger({
        level: LogLevel.DEBUG,
        context: { version: 1 }
      });
      const child = logger.child({ version: 2 });

      child.info('test');

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.version).toBe(2);
    });

    it('child inherits custom timestampFn', () => {
      const customTimestamp = '2026-01-28T12:00:00.000Z';
      const logger = new ConsoleLogger({
        level: LogLevel.DEBUG,
        timestampFn: () => customTimestamp
      });
      const child = logger.child({ component: 'test' });

      child.info('test');

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.timestamp).toBe(customTimestamp);
    });

    it('supports nested children', () => {
      const logger = new ConsoleLogger({ level: LogLevel.DEBUG });
      const child = logger.child({ level1: true });
      const grandchild = child.child({ level2: true });

      grandchild.info('test');

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.level1).toBe(true);
      expect(output.level2).toBe(true);
    });
  });

  describe('timestamp', () => {
    it('generates ISO timestamp by default', () => {
      const logger = new ConsoleLogger({ level: LogLevel.DEBUG });
      logger.info('test');

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      const timestamp = new Date(output.timestamp);
      expect(timestamp.toISOString()).toBe(output.timestamp);
    });
  });

  describe('edge cases', () => {
    it('handles undefined context', () => {
      const logger = new ConsoleLogger({ level: LogLevel.DEBUG });
      logger.info('test', undefined);

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.message).toBe('test');
    });

    it('handles empty context', () => {
      const logger = new ConsoleLogger({ level: LogLevel.DEBUG });
      logger.info('test', {});

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.message).toBe('test');
    });

    it('handles complex nested context', () => {
      const logger = new ConsoleLogger({ level: LogLevel.DEBUG });
      logger.info('test', {
        nested: {
          deep: {
            value: 123
          }
        },
        array: [1, 2, 3]
      });

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.nested.deep.value).toBe(123);
      expect(output.array).toEqual([1, 2, 3]);
    });

    it('handles special characters in message', () => {
      const logger = new ConsoleLogger({ level: LogLevel.DEBUG });
      logger.info('test "quoted" message with\nnewline');

      expect(() => JSON.parse(consoleLogSpy.mock.calls[0][0])).not.toThrow();
    });
  });
});
