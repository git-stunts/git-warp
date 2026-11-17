import { describe, expect, it } from 'vitest';
import { CasError } from '@git-stunts/git-cas';
import { GitPlumbingError, GitProtocolError, GitRepositoryLockedError } from '@git-stunts/plumbing/errors';
import OperationPolicyExhaustedError from '../../../../src/domain/errors/OperationPolicyExhaustedError.ts';
import PersistenceError from '../../../../src/domain/errors/PersistenceError.ts';
import { isTransientGitFailure } from '../../../../src/infrastructure/adapters/GitTransientFailure.ts';

const LOCKED = new GitRepositoryLockedError('Git command failed: repository is locked', 'ExecutionOrchestrator.orchestrate', { code: 128, stderr: 'fatal: Unable to create index.lock' });

/** Every code PersistenceError declares, harvested so that a new code is judged without a hand-written list. */
const DECLARED_CODES: readonly string[] = Object.entries(PersistenceError)
  .flatMap(([name, value]) => (name.startsWith('E_') && typeof value === 'string' ? [value] : []));

/** Failures whose cause, but not themselves, is on the list: the list judges an error by its own type only. */
const WRAPPING: ReadonlyArray<readonly [string, Error]> = [
  ['an error whose cause is a held lock', new Error('wrapped', { cause: LOCKED })],
  ['a missing object whose cause is a held lock', new PersistenceError('Missing Git object', PersistenceError.E_MISSING_OBJECT, { cause: LOCKED })],
  ['a retry wrapper around a held lock', new OperationPolicyExhaustedError(4, LOCKED)],
  ['a git-cas error around a held lock', new CasError('Application publication ref update failed', 'PUBLICATION_REF_UPDATE_FAILED', { originalError: LOCKED })],
];

describe('isTransientGitFailure is exactly the #1079 list', () => {
  it('finds every persistence code it judges', () => {
    expect(DECLARED_CODES).toContain(PersistenceError.E_REF_IO);
    expect(DECLARED_CODES.length).toBeGreaterThanOrEqual(5);
  });

  // Oracle: #1079 (decided 2026-11-08) puts exactly one persistence code on the list, E_REF_IO.
  it.each(DECLARED_CODES)('counts PersistenceError %s as transient only when it is E_REF_IO', (code) => {
    expect(isTransientGitFailure(new PersistenceError(`a ${code} failure`, code))).toBe(code === PersistenceError.E_REF_IO);
  });

  it('counts a held lock file as transient', () => {
    expect(isTransientGitFailure(LOCKED)).toBe(true);
  });

  it.each([
    ['a failed Git command', new GitPlumbingError('Git command failed with code 128', 'ExecutionOrchestrator.orchestrate', { code: 128, stderr: 'fatal: bad object' })],
    ['a failed git process', new GitProtocolError("git update-ref exited 128: fatal: prepare: cannot lock ref 'refs/x'", 'GitUpdateRefSession')],
  ])('does not count %s as transient', (_name, failure) => {
    expect(isTransientGitFailure(failure)).toBe(false);
  });

  it.each(WRAPPING)('does not count %s as transient', (_name, failure) => {
    expect(isTransientGitFailure(failure)).toBe(false);
  });
});
