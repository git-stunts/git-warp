import { describe, it, expect } from 'vitest';

import {
  hasErrorCode,
  hasMessage,
  isError,
} from '../../../../src/domain/types/WarpErrors.js';

describe('WarpErrors', () => {
  describe('isError', () => {
    it('returns true for Error instances', () => {
      expect(isError(new Error('boom'))).toBe(true);
    });

    it('returns false for non-errors', () => {
      expect(isError({ message: 'boom' })).toBe(false);
      expect(isError('boom')).toBe(false);
    });
  });

  describe('hasErrorCode', () => {
    it('returns true for objects with string code fields', () => {
      expect(hasErrorCode({ code: 'E_FAIL' })).toBe(true);
      expect(hasErrorCode({ code: 'E_FAIL', message: 'boom' })).toBe(true);
    });

    it('returns false for non-objects and non-string code fields', () => {
      expect(hasErrorCode(null)).toBe(false);
      expect(hasErrorCode('E_FAIL')).toBe(false);
      expect(hasErrorCode({ code: 42 })).toBe(false);
      expect(hasErrorCode({ message: 'boom' })).toBe(false);
    });
  });

  describe('hasMessage', () => {
    it('returns true for objects with string message fields', () => {
      expect(hasMessage({ message: 'boom' })).toBe(true);
    });

    it('returns false for non-objects and non-string message fields', () => {
      expect(hasMessage(null)).toBe(false);
      expect(hasMessage('boom')).toBe(false);
      expect(hasMessage({ message: 42 })).toBe(false);
      expect(hasMessage({ code: 'E_FAIL' })).toBe(false);
    });
  });
});
