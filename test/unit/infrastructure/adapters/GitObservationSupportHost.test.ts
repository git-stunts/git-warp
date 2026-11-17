import { describe, expect, it } from 'vitest';
import { CasError } from '@git-stunts/git-cas';
import { GitPlumbingError, GitProtocolError, GitRepositoryLockedError } from '@git-stunts/plumbing/errors';
import ObservationSupportUnavailableError from '../../../../src/domain/errors/ObservationSupportUnavailableError.ts';
import PersistenceError from '../../../../src/domain/errors/PersistenceError.ts';
import GitObservationSupportHost, { type ObservationSupportCapabilities } from '../../../../src/infrastructure/adapters/GitObservationSupportHost.ts';

/** Capabilities whose every call fails with `failure`, thrown as the real producer throws it. */
function failing(failure: Error | string): ObservationSupportCapabilities {
  const fail = async (): Promise<never> => await Promise.reject(failure);
  return {
    history: { plumbing: { execute: fail }, readBlob: fail, readTreeObjectEntries: fail, readRef: fail, deleteRef: fail },
    publications: { commit: fail },
    assets: { put: fail },
  };
}

const OID = 'a'.repeat(40);

type HostCall = (host: GitObservationSupportHost) => Promise<void>;
const REF = 'refs/warp-local/g/observations/construction/a';

/** Every call the host makes on behalf of the support adapter, by name. */
const CALLS: ReadonlyArray<readonly [string, HostCall]> = [
  ['plumbing.execute', async (host) => { await host.plumbing.execute({ args: ['cat-file', '--batch-check'] }); }],
  ['readBlob', async (host) => { await host.readBlob(OID); }],
  ['readTreeObjectEntries', async (host) => { await host.readTreeObjectEntries(OID); }],
  ['readRef', async (host) => { await host.readRef(REF); }],
  ['deleteRef', async (host) => { await host.deleteRef(REF); }],
  ['publications.commit', async (host) => { await host.publications.commit({ root: 'handle', commit: { message: 'carrier' }, ref: { name: REF, expected: null } }); }],
  ['assets.put', async (host) => { await host.assets.put({ source: (async function* none() { /* empty */ })(), slug: 's', filename: 'f' }); }],
];

async function calledFailing(failure: Error | string, call: HostCall): Promise<void> {
  await call(new GitObservationSupportHost(failing(failure)));
}

const STDERR = `fatal: cannot lock ref '${REF}': File exists.`;
const LOCKED = new GitRepositoryLockedError('Git command failed: repository is locked', 'ExecutionOrchestrator.orchestrate', { code: 128, stderr: STDERR });
const REF_IO = new PersistenceError(`Ref I/O error: ${REF}`, PersistenceError.E_REF_IO);
const UPDATE_FAILED = 'PUBLICATION_REF_UPDATE_FAILED';
/** git-cas's ref update failure, with the failure its injected ref update threw kept as `meta.originalError`. */
function refUpdateFailed(originalError?: Error | string): CasError {
  const meta = originalError === undefined ? {} : { originalError };
  return new CasError('Application publication ref update failed', UPDATE_FAILED, meta);
}
/** A held lock on the construction ref, as git-cas reports it in Docker with real Git (#1109, amended D2). */
const HELD_LOCK = new GitProtocolError(`git update-ref exited 128: fatal: prepare: cannot lock ref '${REF}'`, 'GitUpdateRefSession');
const REF_UPDATE_FAILED = refUpdateFailed(HELD_LOCK);

/** Real producer envelopes that no retry clears, or that the host cannot identify as transient (#1079). */
const REJECTED: ReadonlyArray<readonly [string, Error]> = [
  ['PUBLICATION_CONFLICT', new CasError('Application publication conflict', 'PUBLICATION_CONFLICT')],
  ['GIT_OBJECT_NOT_FOUND', new CasError('Git object not found', 'GIT_OBJECT_NOT_FOUND')],
  ['INTEGRITY_ERROR', new CasError('Object integrity check failed', 'INTEGRITY_ERROR')],
  ['the update-failed code on an error that is not git-cas\'s', Object.assign(new Error('Application publication ref update failed'), { code: UPDATE_FAILED, meta: { originalError: HELD_LOCK } })],
  ['a ref update failure around a TypeError', refUpdateFailed(new TypeError("Cannot read properties of undefined (reading 'oid')"))],
  ['a ref update failure around a RangeError', refUpdateFailed(new RangeError('Invalid array length'))],
  ['a ref update failure around a thrown non-error', refUpdateFailed('not an error')],
  ['a ref update failure with no original error', refUpdateFailed()],
  ['a ref update failure whose meta is not an object', Object.assign(refUpdateFailed(), { meta: null })],
  ['a ref update failure around corruption', refUpdateFailed(new PersistenceError('Missing Git object', PersistenceError.E_MISSING_OBJECT))],
  ['a ref update failure around a bare error', refUpdateFailed(new Error('EIO: i/o error, write'))],
  ['a truncated object (GitProtocolError)', new GitProtocolError('Git process closed before completing its response', 'ByteReader._readChunk')],
  ['a failed Git command', new GitPlumbingError('Git command failed with code 128', 'ExecutionOrchestrator.orchestrate', { code: 128, stderr: 'fatal: bad object' })],
  ['a missing object (history adapter)', new PersistenceError('Missing Git object', PersistenceError.E_MISSING_OBJECT)],
  ['a bare error', new Error('EIO: i/o error, read')],
  ['a defect', new RangeError('Invalid array length')],
];

describe('GitObservationSupportHost classifies only known transient failures as unavailable support (#1109)', () => {
  it.each(CALLS)('reports a held lock from %s as unavailable, keeping its cause', async (_name, call) => {
    await expect(calledFailing(LOCKED, call)).rejects.toBeInstanceOf(ObservationSupportUnavailableError);
    await expect(calledFailing(LOCKED, call)).rejects.toMatchObject({ code: 'E_OBSERVATION_SUPPORT_UNAVAILABLE', cause: LOCKED });
  });

  it.each(CALLS)('reports a ref I/O failure from %s as unavailable, keeping its cause', async (_name, call) => {
    await expect(calledFailing(REF_IO, call)).rejects.toMatchObject({ code: 'E_OBSERVATION_SUPPORT_UNAVAILABLE', cause: REF_IO });
  });

  it.each(CALLS)('reports a git-cas ref update failure around a git process failure from %s as unavailable, keeping its cause', async (_name, call) => {
    await expect(calledFailing(REF_UPDATE_FAILED, call)).rejects.toMatchObject({ code: 'E_OBSERVATION_SUPPORT_UNAVAILABLE', cause: REF_UPDATE_FAILED });
  });

  it.each([['a held lock file', LOCKED], ['a ref I/O failure', REF_IO]])('reports a git-cas ref update failure around %s as unavailable', async (_name, original) => {
    const failure = refUpdateFailed(original);
    await expect(calledFailing(failure, async (host) => {
      await host.publications.commit({ root: 'handle', commit: { message: 'carrier' }, ref: { name: REF, expected: null } });
    })).rejects.toMatchObject({ code: 'E_OBSERVATION_SUPPORT_UNAVAILABLE', cause: failure });
  });

  it.each(CALLS)('refuses a thrown non-error from %s as a defect', async (_name, call) => {
    await expect(calledFailing('not an error', call)).rejects.toMatchObject({ code: 'E_OBSERVATION_SUPPORT_HOST_DEFECT' });
  });

  it.each(REJECTED)('passes %s through unchanged, so preparation rejects', async (_name, failure) => {
    await expect(calledFailing(failure, async (host) => {
      await host.publications.commit({ root: 'handle', commit: { message: 'carrier' }, ref: { name: REF, expected: null } });
    })).rejects.toBe(failure);
  });

  it('returns what each history call returns', async () => {
    const entries = [{ mode: '100644', type: 'blob', oid: OID, name: 'frontier' }];
    const unused = async (): Promise<never> => await Promise.reject(new Error('not called'));
    const host = new GitObservationSupportHost({
      history: {
        plumbing: { execute: async () => await Promise.resolve('tree') },
        readBlob: async () => await Promise.resolve(Uint8Array.of(1)),
        readTreeObjectEntries: async () => await Promise.resolve(entries),
        readRef: async () => await Promise.resolve(OID),
        deleteRef: async () => { await Promise.resolve(); },
      },
      publications: { commit: unused },
      assets: { put: unused },
    });

    expect(await host.plumbing.execute({ args: ['cat-file'] })).toBe('tree');
    expect(await host.readBlob(OID)).toEqual(Uint8Array.of(1));
    expect(await host.readTreeObjectEntries(OID)).toBe(entries);
    expect(await host.readRef('r')).toBe(OID);
    await expect(host.deleteRef('r')).resolves.toBeUndefined();
  });
});
