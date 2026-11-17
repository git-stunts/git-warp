import { describe, expect, it } from 'vitest';
import { CasError } from '@git-stunts/git-cas';
import { GitRepositoryLockedError } from '@git-stunts/plumbing/errors';
import ObservationSupportUnavailableError from '../../../../src/domain/errors/ObservationSupportUnavailableError.ts';
import PersistenceError from '../../../../src/domain/errors/PersistenceError.ts';
import ObservationAttemptId from '../../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationCustodyIdentity from '../../../../src/domain/services/custody/ObservationCustodyIdentity.ts';
import ObservationCustodyRoots from '../../../../src/domain/services/custody/ObservationCustodyRoots.ts';
import ObservationDependencyClaim from '../../../../src/domain/services/custody/ObservationDependencyClaim.ts';
import ObservationDigest from '../../../../src/domain/services/custody/ObservationDigest.ts';
import ObservationSupportLimits from '../../../../src/domain/services/custody/ObservationSupportLimits.ts';
import ObservationSupportSummary from '../../../../src/domain/services/custody/ObservationSupportSummary.ts';
import GitCasObservationSupportAdapter, { type ObservationSupportHistory } from '../../../../src/infrastructure/adapters/GitCasObservationSupportAdapter.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import SeededRandomPort from '../../../helpers/SeededRandomPort.ts';

const BASIS = 'c'.repeat(40);
const IDENTITY = new ObservationCustodyIdentity(new ObservationAttemptId('a'.repeat(32)), new ObservationDigest('b'.repeat(64)));
const LIMITS = new ObservationSupportLimits({ writers: 8, dependencies: 8, frontierBytes: 1024, work: 64 });
const LOCKED = new GitRepositoryLockedError('Git command failed: repository is locked', 'ExecutionOrchestrator.orchestrate', { code: 128, stderr: 'fatal: Unable to create index.lock' });

/** An adapter whose every Git and git-cas call fails with `failure`, thrown as the real producer throws it. */
function failingSupport(failure: unknown): GitCasObservationSupportAdapter {
  const fail = async (): Promise<never> => await Promise.reject(failure);
  const history: ObservationSupportHistory = { plumbing: { execute: fail }, readBlob: fail, readTreeObjectEntries: fail, readRef: fail, deleteRef: fail };
  return new GitCasObservationSupportAdapter({
    publications: { commit: fail }, assets: { put: fail }, history,
    crypto: new NodeCryptoAdapter(), random: new SeededRandomPort(), codec, graphName: 'g', limits: LIMITS,
  });
}

async function retained(failure: unknown): Promise<unknown> {
  return await failingSupport(failure).retain({
    identity: IDENTITY, basis: BASIS, claim: ObservationDependencyClaim.NONE, isCancelled: () => false, dependencies: (async function* none() { /* no dependencies */ })(),
  }).then(() => 'resolved', (error: unknown) => error);
}

async function verified(failure: unknown): Promise<unknown> {
  const summary = new ObservationSupportSummary({
    writers: 0, history: new ObservationDigest('e'.repeat(64)), dependencies: 0, dependency: ObservationDependencyClaim.NONE.digest, pages: [],
  });
  return await failingSupport(failure).verify(IDENTITY, { basis: BASIS, roots: new ObservationCustodyRoots([], []), summary })
    .then(() => 'resolved', (error: unknown) => error);
}

const REF_IO = new PersistenceError('Ref I/O error: refs/warp/g/observation', PersistenceError.E_REF_IO);
const UNTYPED = Object.freeze([
  ['a git-cas code', new CasError('Git command failed', 'GIT_ERROR')],
  ['a missing object', new PersistenceError('Missing Git object', PersistenceError.E_MISSING_OBJECT)],
  ['a defect', new RangeError('Invalid array length')],
] as const);

describe('GitCasObservationSupportAdapter types a failure a retry can clear as unavailable (#1109)', () => {
  it.each([['a held lock file', LOCKED], ['a ref I/O failure', REF_IO]] as const)('reports %s while building as unavailable support, keeping its cause', async (_name, failure) => {
    const outcome = await retained(failure);
    expect(outcome).toBeInstanceOf(ObservationSupportUnavailableError);
    expect(outcome).toMatchObject({ code: 'E_OBSERVATION_SUPPORT_UNAVAILABLE', cause: failure });
  });

  it('reports a held lock file while checking as unavailable support, keeping its cause', async () => {
    expect(await verified(LOCKED)).toMatchObject({ code: 'E_OBSERVATION_SUPPORT_UNAVAILABLE', cause: LOCKED });
  });

  it.each(UNTYPED)('passes %s from a build through unchanged, so preparation rejects', async (_name, failure) => {
    expect(await retained(failure)).toBe(failure);
  });

  it.each(UNTYPED)('passes %s from a check through unchanged, so preparation rejects', async (_name, failure) => {
    expect(await verified(failure)).toBe(failure);
  });

  it('refuses a thrown non-error from Git as a defect', async () => {
    expect(await retained('not an error')).toMatchObject({ code: 'E_OBSERVATION_SUPPORT_HOST_DEFECT' });
  });
});
