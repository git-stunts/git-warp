import { describe, it, expect } from 'vitest';

import {
  isError,
} from '../../../../src/domain/types/WarpErrors.ts';

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

});
