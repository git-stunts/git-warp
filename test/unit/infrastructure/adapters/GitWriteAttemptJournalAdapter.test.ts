import { describe, expect, it } from 'vitest';
import AdapterValidationError from '../../../../src/domain/errors/AdapterValidationError.ts';
import PersistenceError from '../../../../src/domain/errors/PersistenceError.ts';
import ObservationAttemptId from '../../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationBindings from '../../../../src/domain/services/custody/ObservationBindings.ts';
import ObservationBudget from '../../../../src/domain/services/custody/ObservationBudget.ts';
import ObservationDependencyClaim from '../../../../src/domain/services/custody/ObservationDependencyClaim.ts';
import ObservationDigest from '../../../../src/domain/services/custody/ObservationDigest.ts';
import ObservationPreparation from '../../../../src/domain/services/custody/ObservationPreparation.ts';
import ObservationQuestion from '../../../../src/domain/services/custody/ObservationQuestion.ts';
import ObservationWritePremise from '../../../../src/domain/services/custody/ObservationWritePremise.ts';
import WriteAttemptListing from '../../../../src/domain/services/write/WriteAttemptListing.ts';
import GitWriteAttemptJournalAdapter from '../../../../src/infrastructure/adapters/GitWriteAttemptJournalAdapter.ts';
import ObservationCustodyCborCodec from '../../../../src/infrastructure/adapters/ObservationCustodyCborCodec.ts';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

const ATTEMPT = new ObservationAttemptId('a'.repeat(32));
const DIGEST = new ObservationDigest('b'.repeat(64));
const custodyCodec = new ObservationCustodyCborCodec(codec);
const REF = `refs/warp/g/write-attempts/${ATTEMPT.value}`;

function stored(): Uint8Array {
  const preparation = new ObservationPreparation(ATTEMPT, new ObservationBindings({
    basis: 'c'.repeat(40), observer: 'writer:alice', question: new ObservationQuestion('q', 1), purpose: 'p',
    budget: new ObservationBudget({ records: 1, bytes: 1, work: 1 }), evidence: [],
    dependencies: ObservationDependencyClaim.NONE,
    writePremise: new ObservationWritePremise({ intents: DIGEST, writerId: 'alice', predecessor: null }),
  }));
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
