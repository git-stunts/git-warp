import { describe, expect, it } from 'vitest';
import { CasError } from '@git-stunts/git-cas';
import PersistenceError from '../../../../src/domain/errors/PersistenceError.ts';
import {
  DEFAULT_RETRY_OPTIONS,
  getExitCode,
  gitDiagnosticText,
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

/** A plumbing failure that reports its exit code beside the details. */
function exitedError(message: string, exitCode: number): GitError {
  return Object.assign(new Error(message), { exitCode });
}

describe('gitErrorClassification', () => {
  it('reads the exit code from details, exitCode or a numeric code, ignoring string codes', () => {
    expect(getExitCode(gitError('x', { code: 128 }))).toBe(128);
    expect(getExitCode(exitedError('x', 1))).toBe(1);
    expect(getExitCode(Object.assign(new Error('x'), { code: 2 }))).toBe(2);
    expect(getExitCode(new PersistenceError('x', 'E_MISSING_OBJECT'))).toBeUndefined();
  });

  it('builds diagnostic text from stderr and stdout only', () => {
    expect(gitDiagnosticText(gitError('Git command failed', { stderr: 'Bad Object', stdout: 'Out' }))).toBe('bad object out');
    expect(gitDiagnosticText(gitError('Git command failed'))).toBe('');
  });

  it('retries only transient failures', () => {
    const shouldRetry = DEFAULT_RETRY_OPTIONS.shouldRetry;
    expect(shouldRetry?.(gitError('fatal: cannot lock ref'))).toBe(true);
    expect(shouldRetry?.(gitError('failed', { stderr: 'Connection timed out' }))).toBe(true);
    expect(shouldRetry?.(gitError('fatal: bad object'))).toBe(false);
    // @ts-expect-error -- a foreign throwable can lack the Error message.
    expect(shouldRetry?.({ name: 'GitError' })).toBe(false);
  });

  it('recognizes dangling objects only at exit code 128', () => {
    expect(isDanglingObjectError(gitError('x', { code: 128, stderr: 'fatal: bad object abc' }))).toBe(true);
    expect(isDanglingObjectError(gitError('x', { code: 128, stderr: 'not a valid object name' }))).toBe(true);
    expect(isDanglingObjectError(gitError('x', { code: 128, stderr: 'ref does not point to a valid object' }))).toBe(true);
    expect(isDanglingObjectError(gitError('x', { code: 128 }))).toBe(false);
    expect(isDanglingObjectError(gitError('x', { code: 1, stderr: 'bad object' }))).toBe(false);
  });

  it('wraps a missing object, with or without an object hint', () => {
    const raw = gitError('fatal: missing object', { code: 128 });
    expect(wrapGitError(raw, { oid: 'abc' })).toMatchObject({ code: PersistenceError.E_MISSING_OBJECT, message: 'Missing Git object: abc' });
    expect(wrapGitError(raw, { oid: '' })).toMatchObject({ code: PersistenceError.E_MISSING_OBJECT, message: 'fatal: missing object' });
    expect(wrapGitError(gitError('x', { code: 1, stderr: 'could not read' }))).toMatchObject({ code: PersistenceError.E_MISSING_OBJECT });
  });

  it('classifies a git-cas absent object as a typed missing-object error (#815)', () => {
    const raw = new CasError('Git object not found: 0123', 'GIT_OBJECT_NOT_FOUND', { oid: '0123' });
    const wrapped = wrapGitError(raw, { oid: '0123' });
    expect(wrapped).toBeInstanceOf(PersistenceError);
    expect(wrapped).toMatchObject({ code: PersistenceError.E_MISSING_OBJECT, message: 'Missing Git object: 0123' });
    const conflict = new CasError('conflict', 'PUBLICATION_CONFLICT');
    expect(wrapGitError(conflict)).toBe(conflict);
  });

  it('wraps a missing ref and a ref I/O failure, with or without a ref hint', () => {
    const missing = gitError('fatal: ref not found', { code: 128 });
    expect(wrapGitError(missing, { ref: 'refs/x' })).toMatchObject({ code: PersistenceError.E_REF_NOT_FOUND, message: 'Ref not found: refs/x' });
    expect(wrapGitError(missing)).toMatchObject({ code: PersistenceError.E_REF_NOT_FOUND, message: 'fatal: ref not found' });
    const io = gitError('failed', { code: 128, stderr: 'permission denied' });
    expect(wrapGitError(io, { ref: 'refs/x' })).toMatchObject({ code: PersistenceError.E_REF_IO, message: 'Ref I/O error: refs/x' });
    expect(wrapGitError(io)).toMatchObject({ code: PersistenceError.E_REF_IO, message: 'failed' });
  });

  it('returns unrecognized failures unchanged', () => {
    const exited = gitError('fatal: something else', { code: 128 });
    expect(wrapGitError(exited)).toBe(exited);
    const crashed = gitError('fatal: bad object', { code: 2 });
    expect(wrapGitError(crashed)).toBe(crashed);
    const quiet = gitError('', { code: 128 });
    expect(wrapGitError(quiet)).toBe(quiet);
    const bare = { name: 'GitError', exitCode: 128 };
    // @ts-expect-error -- a foreign throwable can lack the Error message.
    expect(wrapGitError(bare)).toBe(bare);
  });

  it('narrows throwables to Git errors, wrapping non-errors', () => {
    const error = new Error('boom');
    expect(toGitError(error)).toBe(error);
    expect(toGitError('boom')).toMatchObject({ code: PersistenceError.E_MISSING_OBJECT, message: 'boom' });
  });
});
