import { describe, expect, it, vi } from 'vitest';
import { CasError } from '@git-stunts/git-cas';
import { GitPlumbingError, GitProtocolError, GitRepositoryLockedError } from '@git-stunts/plumbing/errors';
import AdapterValidationError from '../../../../src/domain/errors/AdapterValidationError.ts';
import OperationPolicyExhaustedError from '../../../../src/domain/errors/OperationPolicyExhaustedError.ts';
import OperationPolicyTimeoutError from '../../../../src/domain/errors/OperationPolicyTimeoutError.ts';
import PersistenceError from '../../../../src/domain/errors/PersistenceError.ts';
import WriteAttemptJournalUnavailableError from '../../../../src/domain/errors/WriteAttemptJournalUnavailableError.ts';
import ObservationAttemptId from '../../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationBindings from '../../../../src/domain/services/custody/ObservationBindings.ts';
import ObservationBudget from '../../../../src/domain/services/custody/ObservationBudget.ts';
import ObservationDependencyClaim from '../../../../src/domain/services/custody/ObservationDependencyClaim.ts';
import ObservationDigest from '../../../../src/domain/services/custody/ObservationDigest.ts';
import ObservationPreparation from '../../../../src/domain/services/custody/ObservationPreparation.ts';
import ObservationQuestion from '../../../../src/domain/services/custody/ObservationQuestion.ts';
import ObservationWritePremise from '../../../../src/domain/services/custody/ObservationWritePremise.ts';
import WriteAttemptListing from '../../../../src/domain/services/write/WriteAttemptListing.ts';
import WriteAttemptRecord from '../../../../src/domain/services/write/WriteAttemptRecord.ts';
import GitWriteAttemptJournalAdapter from '../../../../src/infrastructure/adapters/GitWriteAttemptJournalAdapter.ts';
import ObservationCustodyCborCodec from '../../../../src/infrastructure/adapters/ObservationCustodyCborCodec.ts';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

const ATTEMPT = new ObservationAttemptId('a'.repeat(32));
const DIGEST = new ObservationDigest('b'.repeat(64));
const custodyCodec = new ObservationCustodyCborCodec(codec);
const REF = `refs/warp-local/g/write-attempts/${ATTEMPT.value}`;

const PREPARATION = new ObservationPreparation(ATTEMPT, new ObservationBindings({
  basis: 'c'.repeat(40), observer: 'writer:alice', question: new ObservationQuestion('q', 1), purpose: 'p',
  budget: new ObservationBudget({ records: 1, bytes: 1, work: 1 }), evidence: [],
  dependencies: ObservationDependencyClaim.NONE,
  writePremise: new ObservationWritePremise({ intents: DIGEST, writerId: 'alice', predecessor: null }),
}));

function stored(): Uint8Array {
  const preparation = PREPARATION;
  return codec.encode({
    version: 2, preparation: custodyCodec.encodePreparation(preparation), admission: 'plural',
    races: [['register', 'doc', 'title', [''], 0, 'observed']], occurrences: [], savedAt: 1, reported: false, commit: null,
  });
}

describe('GitWriteAttemptJournalAdapter', () => {
  it('refuses an actual invalid race through a typed decode error and skips it in a listing', async () => {
    const history = new InMemoryGraphAdapter({ clock: { now: () => 1 } });
    const oid = await history.writeBlob(stored());
    await history.updateRef(REF, oid);
    const journal = new GitWriteAttemptJournalAdapter({ graph: 'g', history, codec, custodyCodec });

    await expect(journal.read(ATTEMPT)).rejects.toThrow(AdapterValidationError);
    expect(await journal.list(4)).toEqual(new WriteAttemptListing({ records: [], unsupportedRefs: [] }));
    expect(await history.readRef(REF)).toBe(oid);
  });

  it('lets a missing blob fail a direct read, skips it in a listing, and keeps its ref', async () => {
    const history = new InMemoryGraphAdapter({ clock: { now: () => 1 } });
    const missing = 'f'.repeat(40);
    await history.updateRef(REF, missing);
    const journal = new GitWriteAttemptJournalAdapter({ graph: 'g', history, codec, custodyCodec });

    await expect(journal.read(ATTEMPT)).rejects.toThrow(PersistenceError);
    expect(await journal.list(4)).toEqual(new WriteAttemptListing({ records: [], unsupportedRefs: [] }));
    expect(await history.readRef(REF)).toBe(missing);
  });
});

const RECORD = new WriteAttemptRecord({ preparation: PREPARATION, admission: 'derived', races: [], occurrences: [], savedAt: 1 });
const STDERR = "fatal: cannot lock ref 'refs/warp-local/g/write-attempts/a': Unable to create 'refs/warp-local/g/write-attempts/a.lock': File exists.";

const LOCKED = new GitRepositoryLockedError('Git command failed: repository is locked', 'ExecutionOrchestrator.orchestrate', { code: 128, stderr: STDERR });
const REF_IO = new PersistenceError(`Ref I/O error: ${REF}`, PersistenceError.E_REF_IO);
/** The attempts the history adapter's retry policy makes before it gives up on a ref update. */
const RETRIED = 4;

/**
 * Real producer envelopes that a retry can clear: the shared list (#1079), and the history
 * adapter's retry wrapper around one of them (#1109 decision D1), which a held record ref lock gives.
 */
const UNAVAILABLE: ReadonlyArray<readonly [string, Error]> = [
  ['a held lock file (plumbing)', LOCKED],
  ['a ref I/O failure (history adapter)', REF_IO],
  ['a retried held lock (operation policy)', new OperationPolicyExhaustedError(RETRIED, LOCKED)],
  ['a retried ref I/O failure (operation policy)', new OperationPolicyExhaustedError(RETRIED, REF_IO)],
];

/** Real producer envelopes that no retry clears, or that the journal cannot identify as transient. */
const REJECTED: ReadonlyArray<readonly [string, Error]> = [
  ['GIT_ERROR', new CasError('Git command failed', 'GIT_ERROR')],
  ['a truncated object (GitProtocolError)', new GitProtocolError('Git process closed before completing its response', 'ByteReader._readChunk')],
  ['a failed Git command', new GitPlumbingError('Git command failed with code 128', 'ExecutionOrchestrator.orchestrate', { code: 128, stderr: 'fatal: bad object' })],
  ['a missing object (history adapter)', new PersistenceError('Missing Git object', PersistenceError.E_MISSING_OBJECT)],
  ['a bare error', new Error('ENOSPC: no space left on device, write')],
  ['a defect', new TypeError("Cannot read properties of undefined (reading 'oid')")],
  ['a retry wrapper around a defect', new OperationPolicyExhaustedError(RETRIED, new TypeError("Cannot read properties of undefined (reading 'oid')"))],
  ['a retry wrapper around corruption', new OperationPolicyExhaustedError(RETRIED, new PersistenceError('Missing Git object', PersistenceError.E_MISSING_OBJECT))],
  ['a retry wrapper around a failed Git command', new OperationPolicyExhaustedError(RETRIED, new GitPlumbingError('Git command failed with code 128', 'ExecutionOrchestrator.orchestrate', { code: 128, stderr: 'fatal: bad object' }))],
  // Safety Review F6: D1 reads only the last attempt's cause, so an exhausted retry of a spawn failure rejects.
  ['a retry wrapper around a spawn failure (resource temporarily unavailable)', new OperationPolicyExhaustedError(RETRIED, new GitPlumbingError('spawn git EAGAIN', 'ExecutionOrchestrator.orchestrate', { originalError: Object.assign(new Error('spawn git EAGAIN'), { code: 'EAGAIN' }) }))],
  ['the retry policy timing out', new OperationPolicyTimeoutError(30_000, 30_001)],
];

describe('GitWriteAttemptJournalAdapter save classifies host failures by type (#1109)', () => {
  function journalOver(history: InMemoryGraphAdapter): GitWriteAttemptJournalAdapter {
    return new GitWriteAttemptJournalAdapter({ graph: 'g', history, codec, custodyCodec });
  }

  it.each(UNAVAILABLE)('reports %s while writing the record ref as an unavailable journal, keeping its cause', async (_name, failure) => {
    const history = new InMemoryGraphAdapter({ clock: { now: () => 1 } });
    vi.spyOn(history, 'updateRef').mockRejectedValueOnce(failure);

    const saved = journalOver(history).save(RECORD);

    await expect(saved).rejects.toBeInstanceOf(WriteAttemptJournalUnavailableError);
    await expect(saved).rejects.toMatchObject({ code: 'E_WRITE_ATTEMPT_JOURNAL_UNAVAILABLE', cause: failure });
    expect(await history.readRef(REF)).toBeNull();
  });

  it.each(UNAVAILABLE)('reports %s while writing the record blob as an unavailable journal, keeping its cause', async (_name, failure) => {
    const history = new InMemoryGraphAdapter({ clock: { now: () => 1 } });
    vi.spyOn(history, 'writeBlob').mockRejectedValueOnce(failure);

    await expect(journalOver(history).save(RECORD)).rejects.toMatchObject({ code: 'E_WRITE_ATTEMPT_JOURNAL_UNAVAILABLE', cause: failure });
  });

  it.each(REJECTED)('passes %s from a save through unchanged, so the write rejects', async (_name, failure) => {
    const history = new InMemoryGraphAdapter({ clock: { now: () => 1 } });
    vi.spyOn(history, 'updateRef').mockRejectedValueOnce(failure);

    await expect(journalOver(history).save(RECORD)).rejects.toBe(failure);
  });

  it('refuses a thrown non-error from the record ref update as a defect', async () => {
    const history = new InMemoryGraphAdapter({ clock: { now: () => 1 } });
    vi.spyOn(history, 'updateRef').mockRejectedValueOnce('not an error');

    await expect(journalOver(history).save(RECORD)).rejects.toMatchObject({ code: 'E_WRITE_ATTEMPT_JOURNAL_HOST_DEFECT' });
  });

  it('refuses a thrown non-error from the history as a defect', async () => {
    const history = new InMemoryGraphAdapter({ clock: { now: () => 1 } });
    vi.spyOn(history, 'writeBlob').mockRejectedValueOnce('not an error');

    await expect(journalOver(history).save(RECORD)).rejects.toMatchObject({ code: 'E_WRITE_ATTEMPT_JOURNAL_HOST_DEFECT' });
  });

  it('saves a record the history accepts, readable again', async () => {
    const history = new InMemoryGraphAdapter({ clock: { now: () => 1 } });
    const journal = journalOver(history);

    await journal.save(RECORD);

    expect((await journal.read(ATTEMPT))?.attemptId.value).toBe(ATTEMPT.value);
  });
});
