import { afterEach, describe, expect, it } from 'vitest';
import CustodyRefused from '../../../src/domain/services/custody/CustodyRefused.ts';
import ObservationCustodyIdentity from '../../../src/domain/services/custody/ObservationCustodyIdentity.ts';
import ObservationCustodyPage from '../../../src/domain/services/custody/ObservationCustodyPage.ts';
import ObservationCustodyRoots from '../../../src/domain/services/custody/ObservationCustodyRoots.ts';
import { buildWriteAttemptRef } from '../../../src/domain/utils/WriteAttemptRefLayout.ts';
import ObservationCustodyFixture, { FIXTURE_ATTEMPT, FIXTURE_DIGEST, git } from '../../helpers/ObservationCustodyFixture.ts';
import { ScriptedCustody } from '../../helpers/ScriptedObservationPorts.ts';
import WriteAttemptJournalCapture from '../../helpers/WriteAttemptJournalCapture.ts';

describe('WriteAttemptJournalCapture', () => {
  const repositories = new ObservationCustodyFixture();
  afterEach(async () => await repositories.dispose());

  it('captures the exact saved ref without hiding a refused settlement or changing its bytes', async () => {
    const path = await repositories.repository('sha1');
    const ref = buildWriteAttemptRef('g', FIXTURE_ATTEMPT.value);
    const oid = git(path, ['hash-object', '-w', '--stdin'], 'saved record');
    git(path, ['update-ref', ref, oid]);
    const inner = new ScriptedCustody();
    inner.settled = new CustodyRefused('contention');
    const capture = new WriteAttemptJournalCapture(inner, path, 'g');
    const page = new ObservationCustodyPage(Uint8Array.of(1), new ObservationCustodyRoots([], []));

    const outcome = await capture.settle(new ObservationCustodyIdentity(FIXTURE_ATTEMPT, FIXTURE_DIGEST), page);

    expect(outcome).toEqual(new CustodyRefused('contention'));
    expect(capture.records).toEqual(new Map([[ref, oid]]));
    expect(inner.pages).toEqual([page]);
    expect(git(path, ['cat-file', 'blob', oid])).toBe('saved record');
    expect(git(path, ['rev-parse', ref])).toBe(oid);
  });
});
