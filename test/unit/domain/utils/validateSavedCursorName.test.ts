import { describe, expect, it } from 'vitest';
import { validateSavedCursorName } from '../../../../src/domain/utils/validateSavedCursorName.ts';

describe('validateSavedCursorName', () => {
  it.each(['cursor', 'cursor_1', 'cursor-name', 'cursor.name', '.'])(
    'accepts ref-safe cursor name %s',
    (name) => {
      expect(() => validateSavedCursorName(name)).not.toThrow();
    },
  );

  it.each([
    [42, 'expected string, got number'],
    ['', 'cannot be empty'],
    ['a'.repeat(65), 'exceeds maximum length of 64 characters: 65'],
    ['parent..child', "contains path traversal sequence '..'"],
    ['parent/child', 'contains forward slash'],
    ['cursor\0name', 'contains null byte'],
    ['cursor name', 'contains whitespace'],
    ['cursor$name', 'contains invalid characters'],
  ])('rejects %p with cursor-specific semantics', (value, detail) => {
    const validate = (): void => {
      Reflect.apply(validateSavedCursorName, undefined, [value]);
    };

    expect(validate).toThrow(`Invalid saved cursor name: ${detail}`);
    expect(validate).toThrowError(
      expect.objectContaining({
        code: 'E_INVALID_CURSOR_NAME',
      }),
    );
  });
});
