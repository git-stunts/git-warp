import { describe, it, expect } from 'vitest';
import LoggerPort from '../../../src/ports/LoggerPort.js';

describe('LoggerPort', () => {
  describe('abstract methods', () => {
    it('debug throws Not implemented', () => {
      const port = new LoggerPort();
      expect(() => port.debug('test')).toThrow('Not implemented');
    });

    it('info throws Not implemented', () => {
      const port = new LoggerPort();
      expect(() => port.info('test')).toThrow('Not implemented');
    });

    it('warn throws Not implemented', () => {
      const port = new LoggerPort();
      expect(() => port.warn('test')).toThrow('Not implemented');
    });

    it('error throws Not implemented', () => {
      const port = new LoggerPort();
      expect(() => port.error('test')).toThrow('Not implemented');
    });

    it('child throws Not implemented', () => {
      const port = new LoggerPort();
      expect(() => port.child({})).toThrow('Not implemented');
    });
  });

  describe('contract', () => {
    it('can be instantiated', () => {
      const port = new LoggerPort();
      expect(port).toBeInstanceOf(LoggerPort);
    });
  });
});
