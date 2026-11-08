import { describe, expect, it, vi } from 'vitest';
import ObservationAttemptId from '../../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationBindings from '../../../../src/domain/services/custody/ObservationBindings.ts';
import ObservationBudget from '../../../../src/domain/services/custody/ObservationBudget.ts';
import ObservationDependencyClaim from '../../../../src/domain/services/custody/ObservationDependencyClaim.ts';
import ObservationDigest from '../../../../src/domain/services/custody/ObservationDigest.ts';
import ObservationPreparation from '../../../../src/domain/services/custody/ObservationPreparation.ts';
import ObservationQuestion from '../../../../src/domain/services/custody/ObservationQuestion.ts';
import ObservationWritePremise from '../../../../src/domain/services/custody/ObservationWritePremise.ts';
import GitWriteAttemptJournalAdapter, { type WriteAttemptHistory } from '../../../../src/infrastructure/adapters/GitWriteAttemptJournalAdapter.ts';
import ObservationCustodyCborCodec from '../../../../src/infrastructure/adapters/ObservationCustodyCborCodec.ts';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';

/** A race that cannot be built for a reason that is no refusal: a broken runtime, not a bad record. */
vi.mock('../../../../src/domain/api/WriteRace.ts', () => ({
  default: class BrokenWriteRace {
    constructor() {
      throw new RangeError('runtime broke');
    }
  },
}));

const ATTEMPT = new ObservationAttemptId('a'.repeat(32));
const DIGEST = new ObservationDigest('b'.repeat(64));
const custodyCodec = new ObservationCustodyCborCodec(codec);

function stored(): Uint8Array {
  const preparation = new ObservationPreparation(ATTEMPT, new ObservationBindings({
    basis: 'c'.repeat(40), observer: 'writer:alice', question: new ObservationQuestion('q', 1), purpose: 'p',
    budget: new ObservationBudget({ records: 1, bytes: 1, work: 1 }), evidence: [],
    dependencies: ObservationDependencyClaim.NONE,
    writePremise: new ObservationWritePremise({ intents: DIGEST, writerId: 'alice', predecessor: null }),
  }));
  return codec.encode({
    version: 1, preparation: custodyCodec.encodePreparation(preparation), admission: 'plural',
    races: [['register', 'doc', 'title', ['bob'], 0, 'observed']], occurrences: [], savedAt: 1, reported: false, commit: null,
  });
}

describe('GitWriteAttemptJournalAdapter', () => {
  it('lets a failure that is not a domain refusal through a direct read, and skips it in a listing', async () => {
    const blob = stored();
    const history: WriteAttemptHistory = {
      writeBlob: () => Promise.resolve('o'),
      readBlob: () => Promise.resolve(blob),
      updateRef: () => Promise.resolve(),
      readRef: () => Promise.resolve('o'),
      deleteRef: () => Promise.resolve(),
      readRefTargets: () => Promise.resolve(new Map([['r', 'o']])),
    };
    const journal = new GitWriteAttemptJournalAdapter({ graph: 'g', history, codec, custodyCodec });

    await expect(journal.read(ATTEMPT)).rejects.toThrow(RangeError);
    await expect(journal.list(4)).resolves.toEqual([]);
  });
});
