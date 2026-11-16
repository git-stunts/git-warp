import { describe, expect, it } from 'vitest';
import { CasError } from '@git-stunts/git-cas';
import { GitPlumbingError, GitProtocolError, GitRepositoryLockedError } from '@git-stunts/plumbing/errors';
import ConeStoreUnavailableError from '../../../../src/domain/errors/ConeStoreUnavailableError.ts';
import PersistenceError from '../../../../src/domain/errors/PersistenceError.ts';
import type { ConeTrieHistory } from '../../../../src/infrastructure/adapters/GitConeRecordStoreAdapter.ts';
import GitConeStoreHost from '../../../../src/infrastructure/adapters/GitConeStoreHost.ts';

/** A history whose every call fails with `failure`, thrown as the real producer throws it. */
function failingHistory(failure: Error): ConeTrieHistory {
  const fail = async (): Promise<never> => await Promise.reject(failure);
  return { plumbing: { execute: fail }, readBlob: fail, readTreeObjectEntries: fail, readRef: fail, compareAndSwapRef: fail, deleteRef: fail };
}

async function outcomeOf(failure: Error): Promise<Error> {
  return await new GitConeStoreHost(failingHistory(failure)).readTreeObjectEntries('a'.repeat(40)).then(
    () => new Error('the call resolved'),
    (error: Error) => error,
  );
}

const STDERR = "fatal: cannot lock ref 'refs/warp/todos/cone/head': Unable to create 'refs/warp/todos/cone/head.lock': File exists.";

/** Real producer envelopes that a retry can clear. */
const UNAVAILABLE = Object.freeze([
  ['a held lock file (plumbing)', new GitRepositoryLockedError('Git command failed: repository is locked', 'ExecutionOrchestrator.orchestrate', { code: 128, stderr: STDERR })],
  ['a ref I/O failure (history adapter)', new PersistenceError('Ref I/O error: refs/warp/todos/cone/head', PersistenceError.E_REF_IO)],
] as const);

/** Real producer envelopes that no retry clears, or that the host cannot identify as transient. */
const REJECTED = Object.freeze([
  ['TREE_PARSE_ERROR', new CasError('Git object is not a tree', 'TREE_PARSE_ERROR')],
  ['GIT_ERROR', new CasError('Git command failed', 'GIT_ERROR')],
  ['INTEGRITY_ERROR', new CasError('Object integrity check failed', 'INTEGRITY_ERROR')],
  ['RESTORE_TOO_LARGE', new CasError('Object exceeds the restore limit', 'RESTORE_TOO_LARGE')],
  ['INVALID_OPTIONS', new CasError('Invalid options', 'INVALID_OPTIONS')],
  ['RESOURCE_CLOSED', new CasError('Persistence adapter is closed', 'RESOURCE_CLOSED')],
  ['GIT_OBJECT_NOT_FOUND', new CasError('Git object not found', 'GIT_OBJECT_NOT_FOUND')],
  ['a truncated object (GitProtocolError)', new GitProtocolError('Git process closed before completing its response', 'ByteReader._readChunk')],
  ['a failed Git command', new GitPlumbingError('Git command failed with code 128', 'ExecutionOrchestrator.orchestrate', { code: 128, stderr: 'fatal: bad object' })],
  ['a spawn failure', new GitPlumbingError('spawn git EAGAIN', 'ExecutionOrchestrator.orchestrate', { originalError: Object.assign(new Error('spawn git EAGAIN'), { code: 'EAGAIN' }) })],
  ['a missing object (history adapter)', new PersistenceError('Missing Git object', PersistenceError.E_MISSING_OBJECT)],
  ['a bare error', new Error('EIO: i/o error, read')],
  ['a defect', new TypeError("Cannot read properties of undefined (reading 'oid')")],
] as const);

describe('GitConeStoreHost classifies only known transient failures as an unavailable store (#1079)', () => {
  for (const [name, failure] of UNAVAILABLE) {
    it(`reports ${name} as unavailable, keeping its cause`, async () => {
      const outcome = await outcomeOf(failure);
      expect(outcome).toBeInstanceOf(ConeStoreUnavailableError);
      expect(outcome).toMatchObject({ code: 'E_CONE_STORE_UNAVAILABLE', cause: failure });
    });
  }

  for (const [name, failure] of REJECTED) {
    it(`passes ${name} through unchanged, so the operation rejects`, async () => {
      expect(await outcomeOf(failure)).toBe(failure);
    });
  }

  it('refuses a thrown non-error as a defect', async () => {
    const history = failingHistory(new Error('unused'));
    const host = new GitConeStoreHost({ ...history, readRef: async () => { throw 'not an error'; } });
    await expect(host.readRef('refs/warp/todos/cone/head')).rejects.toMatchObject({ code: 'E_CONE_STORE_HOST_DEFECT' });
  });
});
