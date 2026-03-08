import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HOST,
  normalizeHost,
  assertNotListening,
  messageToString,
} from '../../../../src/infrastructure/adapters/wsAdapterUtils.js';

describe('wsAdapterUtils', () => {
  describe('DEFAULT_HOST', () => {
    it('is loopback', () => {
      expect(DEFAULT_HOST).toBe('127.0.0.1');
    });
  });

  describe('normalizeHost', () => {
    it('returns the provided host when truthy', () => {
      expect(normalizeHost('0.0.0.0')).toBe('0.0.0.0');
      expect(normalizeHost('::1')).toBe('::1');
    });

    it('falls back to DEFAULT_HOST for empty string', () => {
      expect(normalizeHost('')).toBe(DEFAULT_HOST);
    });

    it('falls back to DEFAULT_HOST for undefined', () => {
      expect(normalizeHost(undefined)).toBe(DEFAULT_HOST);
    });
  });

  describe('assertNotListening', () => {
    it('does nothing when server is null', () => {
      expect(() => assertNotListening(null)).not.toThrow();
    });

    it('does nothing when server is undefined', () => {
      expect(() => assertNotListening(undefined)).not.toThrow();
    });

    it('throws when server is truthy', () => {
      expect(() => assertNotListening({})).toThrow('Server already listening');
    });
  });

  describe('messageToString', () => {
    it('passes strings through unchanged', () => {
      expect(messageToString('hello')).toBe('hello');
    });

    it('decodes Uint8Array to UTF-8', () => {
      const bytes = new TextEncoder().encode('café');
      expect(messageToString(bytes)).toBe('café');
    });

    it('decodes ArrayBuffer to UTF-8', () => {
      const bytes = new TextEncoder().encode('test');
      expect(messageToString(bytes.buffer)).toBe('test');
    });

    it('decodes Buffer (Node) to UTF-8', () => {
      const buf = Buffer.from('node buffer');
      expect(messageToString(buf)).toBe('node buffer');
    });

    it('merges Buffer[] fragments', () => {
      const chunks = [Buffer.from('hello '), Buffer.from('world')];
      expect(messageToString(chunks)).toBe('hello world');
    });
  });
});
