import { describe, expect, it } from 'vitest';
import { CasError } from '@git-stunts/git-cas';
import { GitPlumbingError, GitProtocolError, GitRepositoryLockedError } from '@git-stunts/plumbing/errors';
import ObservationSupportUnavailableError from '../../../../src/domain/errors/ObservationSupportUnavailableError.ts';
import PersistenceError from '../../../../src/domain/errors/PersistenceError.ts';
import GitObservationSupportHost, { type ObservationSupportCapabilities } from '../../../../src/infrastructure/adapters/GitObservationSupportHost.ts';

/** Capabilities whose every call fails with `failure`, thrown as the real producer throws it. */
function failing(failure: unknown): ObservationSupportCapabilities {
  const fail = async (): Promise<never> => await Promise.reject(failure);
  return {
    history: { plumbing: { execute: fail }, readBlob: fail, readTreeObjectEntries: fail, readRef: fail, deleteRef: fail },
    publications: { commit: fail },
    assets: { put: fail },
  };
}

const OID = 'a'.repeat(40);

/** Every call the host makes on behalf of the support adapter, by name. */
const CALLS = Object.freeze([
  ['plumbing.execute', async (host: GitObservationSupportHost) => await host.plumbing.execute({ args: ['cat-file', '--batch-check'] })],
  ['readBlob', async (host: GitObservationSupportHost) => await host.readBlob(OID)],
  ['readTreeObjectEntries', async (host: GitObservationSupportHost) => await host.readTreeObjectEntries(OID)],
  ['readRef', async (host: GitObservationSupportHost) => await host.readRef('refs/warp-local/g/observations/construction/a')],
  ['deleteRef', async (host: GitObservationSupportHost) => { await host.deleteRef('refs/warp-local/g/observations/construction/a'); }],
  ['publications.commit', async (host: GitObservationSupportHost) => await host.publications.commit({
    root: 'handle', commit: { message: 'carrier' }, ref: { name: 'refs/warp-local/g/observations/construction/a', expected: null },
  })],
  ['assets.put', async (host: GitObservationSupportHost) => await host.assets.put({ source: (async function* none() { /* empty */ })(), slug: 's', filename: 'f' })],
] as const);

async function outcomeOf(failure: unknown, call: (host: GitObservationSupportHost) => Promise<unknown>): Promise<unknown> {
  return await call(new GitObservationSupportHost(failing(failure))).then(() => 'resolved', (error: unknown) => error);
}

const STDERR = "fatal: cannot lock ref 'refs/warp-local/g/observations/construction/a': File exists.";
const LOCKED = new GitRepositoryLockedError('Git command failed: repository is locked', 'ExecutionOrchestrator.orchestrate', { code: 128, stderr: STDERR });
const REF_IO = new PersistenceError('Ref I/O error: refs/warp-local/g/observations/construction/a', PersistenceError.E_REF_IO);

/** Real producer envelopes that no retry clears, or that the host cannot identify as transient (#1079). */
const REJECTED = Object.freeze([
  ['PUBLICATION_CONFLICT', new CasError('Application publication conflict', 'PUBLICATION_CONFLICT')],
  ['PUBLICATION_REF_UPDATE_FAILED', new CasError('Application publication ref update failed', 'PUBLICATION_REF_UPDATE_FAILED')],
  ['GIT_OBJECT_NOT_FOUND', new CasError('Git object not found', 'GIT_OBJECT_NOT_FOUND')],
  ['a truncated object (GitProtocolError)', new GitProtocolError('Git process closed before completing its response', 'ByteReader._readChunk')],
  ['a failed Git command', new GitPlumbingError('Git command failed with code 128', 'ExecutionOrchestrator.orchestrate', { code: 128, stderr: 'fatal: bad object' })],
  ['a missing object (history adapter)', new PersistenceError('Missing Git object', PersistenceError.E_MISSING_OBJECT)],
  ['a bare error', new Error('EIO: i/o error, read')],
  ['a defect', new RangeError('Invalid array length')],
] as const);

describe('GitObservationSupportHost classifies only known transient failures as unavailable support (#1109)', () => {
  it.each(CALLS)('reports a held lock from %s as unavailable, keeping its cause', async (_name, call) => {
    const outcome = await outcomeOf(LOCKED, call);
    expect(outcome).toBeInstanceOf(ObservationSupportUnavailableError);
    expect(outcome).toMatchObject({ code: 'E_OBSERVATION_SUPPORT_UNAVAILABLE', cause: LOCKED });
  });

  it.each(CALLS)('reports a ref I/O failure from %s as unavailable, keeping its cause', async (_name, call) => {
    expect(await outcomeOf(REF_IO, call)).toMatchObject({ code: 'E_OBSERVATION_SUPPORT_UNAVAILABLE', cause: REF_IO });
  });

  it.each(CALLS)('refuses a thrown non-error from %s as a defect', async (_name, call) => {
    expect(await outcomeOf('not an error', call)).toMatchObject({ code: 'E_OBSERVATION_SUPPORT_HOST_DEFECT' });
  });

  it.each(REJECTED)('passes %s through unchanged, so preparation rejects', async (_name, failure) => {
    expect(await outcomeOf(failure, async (host) => await host.publications.commit({
      root: 'handle', commit: { message: 'carrier' }, ref: { name: 'refs/warp-local/g/observations/construction/a', expected: null },
    }))).toBe(failure);
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
