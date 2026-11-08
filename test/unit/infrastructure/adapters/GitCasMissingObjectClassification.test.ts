import { describe, expect, it } from 'vitest';
import { CasError } from '@git-stunts/git-cas';
import PersistenceError from '../../../../src/domain/errors/PersistenceError.ts';
import {
  DEFAULT_RETRY_OPTIONS,
  isDanglingObjectError,
  toGitError,
  wrapGitError,
  type GitError,
  type GitErrorDetails,
} from '../../../../src/infrastructure/adapters/gitErrorClassification.ts';

/** A plumbing failure with the given message and details. */
function gitError(message: string, details: GitErrorDetails = {}): GitError {
  return Object.assign(new Error(message), { details });
}

/** A failure whose runtime shape lacks a message, as a foreign throwable can. */
function messageless(): GitError {
  const value: GitError = JSON.parse('{"name":"GitError","details":{"code":128}}');
  return value;
}

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

  it('keeps the original message when no object or ref name is known', () => {
    const missing = gitError('fatal: bad object', { code: 128, stderr: 'fatal: bad object deadbeef' });
    const absent = gitError('fatal: not found', { code: 128, stderr: "fatal: ref 'x' not found" });
    const locked = gitError('fatal: cannot lock ref', { code: 128, stderr: "fatal: cannot lock ref 'x'" });
    expect(wrapGitError(missing)).toMatchObject({ code: PersistenceError.E_MISSING_OBJECT, message: 'fatal: bad object' });
    expect(wrapGitError(absent)).toMatchObject({ code: PersistenceError.E_REF_NOT_FOUND, message: 'fatal: not found' });
    expect(wrapGitError(locked)).toMatchObject({ code: PersistenceError.E_REF_IO, message: 'fatal: cannot lock ref' });
  });

  it('reads a failure that carries no message or stderr as empty text', () => {
    expect(wrapGitError(messageless())).toMatchObject({ name: 'GitError' });
    expect(DEFAULT_RETRY_OPTIONS.shouldRetry?.(messageless())).toBe(false);
    expect(isDanglingObjectError(gitError('x', { code: 128 }))).toBe(false);
  });
});
