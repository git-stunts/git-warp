import { describe, expect, it } from 'vitest';

import WarpError from '../../../../src/domain/errors/WarpError.ts';
import {
  requireNonEmptyString,
  validateTimestamp,
} from '../../../../src/domain/utils/scalarValidation.ts';

describe('scalarValidation', () => {
  describe('requireNonEmptyString', () => {
    it('accepts non-empty strings', () => {
      expect(() => requireNonEmptyString('value', 'field')).not.toThrow();
    });

    it('rejects empty strings', () => {
      expect(() => requireNonEmptyString('', 'field')).toThrow(WarpError);
      expect(() => requireNonEmptyString('', 'field')).toThrow('field must be a non-empty string');
    });

    it('rejects non-string runtime values', () => {
      expect(() => Reflect.apply(requireNonEmptyString, undefined, [123, 'field'])).toThrow(WarpError);
      expect(() => Reflect.apply(requireNonEmptyString, undefined, [123, 'field'])).toThrow(
        'field must be a non-empty string',
      );
    });
  });

  describe('validateTimestamp', () => {
    it('accepts non-negative finite numbers', () => {
      expect(() => validateTimestamp(0)).not.toThrow();
      expect(() => validateTimestamp(1.5)).not.toThrow();
    });

    it('rejects invalid runtime timestamp values', () => {
      expect(() => Reflect.apply(validateTimestamp, undefined, ['now'])).toThrow(WarpError);
      expect(() => validateTimestamp(-1)).toThrow('timestamp must be a non-negative finite number');
      expect(() => validateTimestamp(Infinity)).toThrow('timestamp must be a non-negative finite number');
    });
  });
});
