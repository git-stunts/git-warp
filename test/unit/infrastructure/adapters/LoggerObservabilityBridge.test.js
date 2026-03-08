import { describe, it, expect, vi } from 'vitest';
import LoggerObservabilityBridge from '../../../../src/infrastructure/adapters/LoggerObservabilityBridge.js';

function mockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
}

describe('LoggerObservabilityBridge', () => {
  describe('metric()', () => {
    it('forwards metric as debug log with channel prefix', () => {
      const logger = mockLogger();
      const bridge = new LoggerObservabilityBridge(logger);

      bridge.metric('chunk', { oid: 'abc', size: 1024 });

      expect(logger.debug).toHaveBeenCalledWith('cas:metric:chunk', {
        oid: 'abc',
        size: 1024,
      });
    });
  });

  describe('log()', () => {
    it('forwards debug level to logger.debug', () => {
      const logger = mockLogger();
      const bridge = new LoggerObservabilityBridge(logger);

      bridge.log('debug', 'test message', { key: 'val' });

      expect(logger.debug).toHaveBeenCalledWith('test message', { key: 'val' });
    });

    it('forwards info level to logger.info', () => {
      const logger = mockLogger();
      const bridge = new LoggerObservabilityBridge(logger);

      bridge.log('info', 'info msg');

      expect(logger.info).toHaveBeenCalledWith('info msg', undefined);
    });

    it('forwards warn level to logger.warn', () => {
      const logger = mockLogger();
      const bridge = new LoggerObservabilityBridge(logger);

      bridge.log('warn', 'warning');

      expect(logger.warn).toHaveBeenCalledWith('warning', undefined);
    });

    it('forwards error level to logger.error', () => {
      const logger = mockLogger();
      const bridge = new LoggerObservabilityBridge(logger);

      bridge.log('error', 'failure', { code: 'E_TEST' });

      expect(logger.error).toHaveBeenCalledWith('failure', { code: 'E_TEST' });
    });
  });

  describe('span()', () => {
    it('returns an object with end() that logs duration', () => {
      const logger = mockLogger();
      const bridge = new LoggerObservabilityBridge(logger);

      const s = bridge.span('restore');
      s.end({ chunks: 5 });

      expect(logger.debug).toHaveBeenCalledTimes(1);
      const [msg, meta] = logger.debug.mock.calls[0];
      expect(msg).toBe('cas:span:restore');
      expect(meta.chunks).toBe(5);
      expect(typeof meta.durationMs).toBe('number');
      expect(meta.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('end() works without meta argument', () => {
      const logger = mockLogger();
      const bridge = new LoggerObservabilityBridge(logger);

      const s = bridge.span('store');
      s.end();

      const [msg, meta] = logger.debug.mock.calls[0];
      expect(msg).toBe('cas:span:store');
      expect(typeof meta.durationMs).toBe('number');
    });
  });
});
