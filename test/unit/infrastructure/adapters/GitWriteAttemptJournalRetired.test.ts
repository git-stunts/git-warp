import { describe, expect, it } from 'vitest';
import RetiredWriteAttemptError from '../../../../src/domain/errors/RetiredWriteAttemptError.ts';
import ObservationAttemptId from '../../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationBindings from '../../../../src/domain/services/custody/ObservationBindings.ts';
import ObservationBudget from '../../../../src/domain/services/custody/ObservationBudget.ts';
import ObservationDependencyClaim from '../../../../src/domain/services/custody/ObservationDependencyClaim.ts';
import ObservationDigest from '../../../../src/domain/services/custody/ObservationDigest.ts';
import ObservationPreparation from '../../../../src/domain/services/custody/ObservationPreparation.ts';
import ObservationQuestion from '../../../../src/domain/services/custody/ObservationQuestion.ts';
import ObservationWritePremise from '../../../../src/domain/services/custody/ObservationWritePremise.ts';
import WriteAttemptRecord from '../../../../src/domain/services/write/WriteAttemptRecord.ts';
import GitWriteAttemptJournalAdapter, { type WriteAttemptHistory } from '../../../../src/infrastructure/adapters/GitWriteAttemptJournalAdapter.ts';
import ObservationCustodyCborCodec from '../../../../src/infrastructure/adapters/ObservationCustodyCborCodec.ts';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';

const OLD = new ObservationAttemptId('a'.repeat(32));
const CURRENT = new ObservationAttemptId('e'.repeat(32));
const OLD_REF = `refs/warp/g/write-attempts/${OLD.value}`;
const custodyCodec = new ObservationCustodyCborCodec(codec);

type Stored = { readonly [field: string]: unknown };

function record(attemptId: ObservationAttemptId): WriteAttemptRecord {
  return new WriteAttemptRecord({
    preparation: new ObservationPreparation(attemptId, new ObservationBindings({
      basis: 'c'.repeat(40), observer: 'writer:alice', question: new ObservationQuestion('q', 1), purpose: 'p',
      budget: new ObservationBudget({ records: 1, bytes: 1, work: 1 }), evidence: [],
      dependencies: ObservationDependencyClaim.NONE,
      writePremise: new ObservationWritePremise({ intents: new ObservationDigest('b'.repeat(64)), writerId: 'alice', predecessor: null }),
    })),
    admission: 'derived', races: [], occurrences: [], savedAt: 1,
  });
}

/** A Git surface in memory, whose saved blobs a test can rewrite into an older layout. */
function history(): WriteAttemptHistory & { readonly rewrite: (ref: string, change: (stored: Stored) => Stored) => void } {
  const blobs = new Map<string, Uint8Array>();
  const refs = new Map<string, string>();
  return {
    rewrite: (ref, change) => {
      const oid = refs.get(ref) ?? '';
      const stored: Stored = codec.decode(blobs.get(oid) ?? new Uint8Array());
      blobs.set(oid, codec.encode(change(stored)));
    },
    writeBlob: (content) => { const oid = String(blobs.size).padStart(40, '0'); blobs.set(oid, content); return Promise.resolve(oid); },
    readBlob: (oid) => Promise.resolve(blobs.get(oid) ?? new Uint8Array()),
    updateRef: (ref, oid) => { refs.set(ref, oid); return Promise.resolve(); },
    readRef: (ref) => Promise.resolve(refs.get(ref) ?? null),
    deleteRef: (ref) => { refs.delete(ref); return Promise.resolve(); },
    readRefTargets: (prefix) => Promise.resolve(new Map([...refs].filter(([ref]) => ref.startsWith(prefix)))),
  };
}

const VERSION_ONE: ReadonlyArray<readonly [string, (stored: Stored) => Stored]> = [
  ['saved before races were saved', ({ races: _gone, ...before }) => ({ ...before, version: 1 })],
  ['that names races', (stored) => ({ ...stored, version: 1 })],
];

describe('a version-1 write attempt record, from a clone of unreleased main', () => {
  it.each(VERSION_ONE)('is refused on read, %s, by an error that names the ref to delete', async (_name, retire) => {
    const store = history();
    const journal = new GitWriteAttemptJournalAdapter({ graph: 'g', history: store, codec, custodyCodec });
    await journal.save(record(OLD));
    store.rewrite(OLD_REF, retire);

    const refused = await journal.read(OLD).then(() => null, (error: Error) => error);

    expect(refused).toBeInstanceOf(RetiredWriteAttemptError);
    expect(refused instanceof RetiredWriteAttemptError ? [refused.code, refused.ref] : null).toEqual(['E_WRITE_ATTEMPT_RETIRED', OLD_REF]);
    expect(refused?.message).toContain(OLD_REF);
  });

  it.each(VERSION_ONE)('is skipped by a listing, %s, which reports the ref it skipped', async (_name, retire) => {
    const store = history();
    const journal = new GitWriteAttemptJournalAdapter({ graph: 'g', history: store, codec, custodyCodec });
    await journal.save(record(OLD));
    await journal.save(record(CURRENT));
    store.rewrite(OLD_REF, retire);

    const listing = await journal.list(4);

    expect(listing.records.map(({ attemptId }) => attemptId.value)).toEqual([CURRENT.value]);
    expect(listing.retiredRefs).toEqual([OLD_REF]);
    expect(listing.retired).toBe(1);
  });

  it('reports nothing retired when every record is current', async () => {
    const store = history();
    const journal = new GitWriteAttemptJournalAdapter({ graph: 'g', history: store, codec, custodyCodec });
    await journal.save(record(CURRENT));

    const listing = await journal.list(4);

    expect(listing.records).toHaveLength(1);
    expect(listing.retired).toBe(0);
  });
});
