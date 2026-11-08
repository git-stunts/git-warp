import { afterEach, describe, expect, it, vi } from 'vitest';
import AdapterValidationError from '../../../../src/domain/errors/AdapterValidationError.ts';
import UnsupportedWriteAttemptLayoutError from '../../../../src/domain/errors/UnsupportedWriteAttemptLayoutError.ts';
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
import GitWriteAttemptJournalAdapter, { type WriteAttemptHistory } from '../../../../src/infrastructure/adapters/GitWriteAttemptJournalAdapter.ts';
import ObservationCustodyCborCodec from '../../../../src/infrastructure/adapters/ObservationCustodyCborCodec.ts';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const OLD = new ObservationAttemptId('a'.repeat(32));
const CURRENT = new ObservationAttemptId('e'.repeat(32));
const refOf = (attemptId: ObservationAttemptId): string => `refs/warp/g/write-attempts/${attemptId.value}`;
const OLD_REF = refOf(OLD);
const custodyCodec = new ObservationCustodyCborCodec(codec);

type Stored = { readonly [field: string]: unknown };

const PREMISE = new ObservationWritePremise({ intents: new ObservationDigest('b'.repeat(64)), writerId: 'alice', predecessor: null });

function bindings(writePremise: ObservationWritePremise | null): ObservationBindings {
  return new ObservationBindings({
    basis: 'c'.repeat(40), observer: 'writer:alice', question: new ObservationQuestion('q', 1), purpose: 'p',
    budget: new ObservationBudget({ records: 1, bytes: 1, work: 1 }), evidence: [],
    dependencies: ObservationDependencyClaim.NONE, writePremise,
  });
}

function record(attemptId: ObservationAttemptId): WriteAttemptRecord {
  return new WriteAttemptRecord({
    preparation: new ObservationPreparation(attemptId, bindings(PREMISE)), admission: 'derived', races: [], occurrences: [], savedAt: 1,
  });
}

/** A Git surface in memory, whose saved blobs a test can rewrite into another layout. */
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

function journalOf(store: WriteAttemptHistory): GitWriteAttemptJournalAdapter {
  return new GitWriteAttemptJournalAdapter({ graph: 'g', history: store, codec, custodyCodec });
}

async function refusal(journal: GitWriteAttemptJournalAdapter, attemptId: ObservationAttemptId): Promise<Error | null> {
  return await journal.read(attemptId).then(() => null, (error: Error) => error);
}

const UNSUPPORTED: ReadonlyArray<readonly [string, number, (stored: Stored) => Stored]> = [
  ['version 1, saved before races were saved', 1, ({ races: _gone, ...before }) => ({ ...before, version: 1 })],
  ['version 1, naming races', 1, (stored) => ({ ...stored, version: 1 })],
  ['version 0', 0, (stored) => ({ ...stored, version: 0 })],
  ['version 3, from a newer build', 3, (stored) => ({ ...stored, version: 3 })],
  ['version 7, in a shape this build does not know', 7, ({ preparation }) => ({ version: 7, preparation, extra: true })],
];

describe('a well-formed write attempt record in a layout other than 2', () => {
  it.each(UNSUPPORTED)('is refused on read (%s) by one typed error that names its ref, layout and writer', async (_name, version, change) => {
    const store = history();
    const journal = journalOf(store);
    await journal.save(record(OLD));
    store.rewrite(OLD_REF, change);

    const refused = await refusal(journal, OLD);

    expect(refused).toBeInstanceOf(UnsupportedWriteAttemptLayoutError);
    expect(refused instanceof UnsupportedWriteAttemptLayoutError
      ? [refused.code, refused.ref, refused.version, refused.writer]
      : null).toEqual(['E_WRITE_ATTEMPT_LAYOUT_UNSUPPORTED', OLD_REF, version, 'alice']);
    expect(refused?.message).toContain(OLD_REF);
  });

  it('tells an older layout to delete only that ref, and a newer one to use the build that wrote it', async () => {
    const store = history();
    const journal = journalOf(store);
    await journal.save(record(OLD));

    store.rewrite(OLD_REF, (stored) => ({ ...stored, version: 1 }));
    expect((await refusal(journal, OLD))?.message).toContain(`git update-ref -d ${OLD_REF}`);
    store.rewrite(OLD_REF, (stored) => ({ ...stored, version: 3 }));
    expect((await refusal(journal, OLD))?.message).toContain('newer git-warp');
  });

  it.each(UNSUPPORTED)('is skipped by a listing (%s), which returns its ref', async (_name, _version, change) => {
    const store = history();
    const journal = journalOf(store);
    await journal.save(record(OLD));
    await journal.save(record(CURRENT));
    store.rewrite(OLD_REF, change);

    const listing = await journal.list(4);

    expect(listing.records.map(({ attemptId }) => attemptId.value)).toEqual([CURRENT.value]);
    expect(listing.unsupportedRefs).toEqual([OLD_REF]);
    expect(listing.unsupported).toBe(1);
  });
});

const MALFORMED: ReadonlyArray<readonly [string, (stored: Stored) => Stored]> = [
  ['no version', ({ version: _gone, ...rest }) => rest],
  ['a text version', (stored) => ({ ...stored, version: '1' })],
  ['a fractional version', (stored) => ({ ...stored, version: 1.5 })],
  ['a negative version', (stored) => ({ ...stored, version: -1 })],
  ['a null version', (stored) => ({ ...stored, version: null })],
  ['a list version', (stored) => ({ ...stored, version: [1] })],
  ['an other layout with no preparation', () => ({ version: 1 })],
  ['an other layout whose preparation does not decode', (stored) => ({ ...stored, version: 1, preparation: new Uint8Array([1, 2]) })],
  ['an other layout whose preparation is not a write', (stored) => ({ ...stored, version: 1, preparation: custodyCodec.encodePreparation(new ObservationPreparation(OLD, bindings(null))) })],
];

describe('a write attempt record that is not well formed', () => {
  it.each(MALFORMED)('is refused on read as undecodable (%s), and skipped unreported by a listing', async (_name, change) => {
    const store = history();
    const journal = journalOf(store);
    await journal.save(record(OLD));
    store.rewrite(OLD_REF, change);

    expect(await refusal(journal, OLD)).toBeInstanceOf(AdapterValidationError);
    expect(await journal.list(4)).toEqual(new WriteAttemptListing({ records: [], unsupportedRefs: [] }));
  });
});

describe('a listing of write attempts', () => {
  const ids = ['1', '2', '3', '4'].map((digit) => new ObservationAttemptId(digit.repeat(32)));

  it('returns at most `limit` records, from wherever it starts', async () => {
    const store = history();
    const journal = journalOf(store);
    for (const attemptId of ids) {
      await journal.save(record(attemptId));
    }
    for (const start of [0, 0.3, 0.6, 0.9]) {
      vi.spyOn(Math, 'random').mockReturnValue(start);
      const listing = await journal.list(2);
      expect(listing.records).toHaveLength(2);
      expect(listing.unsupportedRefs).toEqual([]);
    }
  });

  it('does not count an other-layout record against its limit, wherever it starts', async () => {
    const store = history();
    const journal = journalOf(store);
    for (const attemptId of ids) {
      await journal.save(record(attemptId));
    }
    for (const attemptId of ids.slice(1)) {
      store.rewrite(refOf(attemptId), (stored) => ({ ...stored, version: 1 }));
    }
    for (const start of [0, 0.3, 0.6, 0.9]) {
      vi.spyOn(Math, 'random').mockReturnValue(start);
      const listing = await journal.list(1);
      expect(listing.records.map(({ attemptId }) => attemptId.value)).toEqual([ids[0]?.value]);
    }
  });

  it('reports every other-layout record it passes before reaching its limit', async () => {
    const store = history();
    const journal = journalOf(store);
    for (const attemptId of ids) {
      await journal.save(record(attemptId));
    }
    for (const attemptId of ids.slice(0, 3)) {
      store.rewrite(refOf(attemptId), (stored) => ({ ...stored, version: 1 }));
    }
    vi.spyOn(Math, 'random').mockReturnValue(0);

    expect((await journal.list(1)).unsupportedRefs).toEqual(ids.slice(0, 3).map(refOf));
  });
});
