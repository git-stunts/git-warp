import { describe, expect, it } from 'vitest';
import { CasError } from '@git-stunts/git-cas';
import PersistenceError from '../../../../src/domain/errors/PersistenceError.ts';
import { toGitError, wrapGitError } from '../../../../src/infrastructure/adapters/gitErrorClassification.ts';

describe('git-cas missing objects are typed corruption (#1079)', () => {
  it('types a git-cas GIT_OBJECT_NOT_FOUND as a missing object, keeping the cause', () => {
    const absent = new CasError('Git object not found: abc', 'GIT_OBJECT_NOT_FOUND', { oid: 'abc' });

    const wrapped = wrapGitError(absent, { oid: 'abc' });

    expect(wrapped).toBeInstanceOf(PersistenceError);
    expect(wrapped).toMatchObject({ code: PersistenceError.E_MISSING_OBJECT, cause: absent });
  });

  it('leaves another git-cas code untyped', () => {
    const other = new CasError('vault slug is invalid', 'INVALID_SLUG');
    expect(wrapGitError(other)).toBe(other);
  });

  it('types a thrown non-error as an opaque missing object', () => {
    expect(toGitError('socket hang up')).toMatchObject({ code: PersistenceError.E_MISSING_OBJECT, message: 'socket hang up' });
  });
});
