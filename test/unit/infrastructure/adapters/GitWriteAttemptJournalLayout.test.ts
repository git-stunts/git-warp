import { describe, expect, it } from 'vitest';
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
import type CodecValue from '../../../../src/domain/types/codec/CodecValue.ts';

const OLD = new ObservationAttemptId('a'.repeat(32));
const CURRENT = new ObservationAttemptId('e'.repeat(32));
const refOf = (attemptId: ObservationAttemptId): string => `refs/warp-local/g/write-attempts/${attemptId.value}`;
const OLD_REF = refOf(OLD);
const custodyCodec = new ObservationCustodyCborCodec(codec);
/** The layout this build reads; a record in it that does not decode is garbage, not another layout. */
const RECORD_LAYOUT = 2;

type Stored = { readonly [field: string]: CodecValue };

/** A codec transport record; arrays, byte strings and dates are not field dictionaries. */
function isStored(value: CodecValue): value is Stored {
  return value !== null && typeof value === 'object'
    && !Array.isArray(value) && !(value instanceof Uint8Array) && !(value instanceof Date);
}

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
function history(): WriteAttemptHistory & {
  readonly rewrite: (ref: string, change: (stored: Stored) => Stored) => void;
  readonly reads: () => number;
} {
  const blobs = new Map<string, Uint8Array>();
  const refs = new Map<string, string>();
  let reads = 0;
  return {
    reads: () => reads,
    rewrite: (ref, change) => {
      const oid = refs.get(ref) ?? '';
      const stored = codec.decode<CodecValue>(blobs.get(oid) ?? new Uint8Array());
      if (!isStored(stored)) {
        throw new Error('The journal did not encode a field dictionary');
      }
      blobs.set(oid, codec.encode(change(stored)));
    },
    writeBlob: (content) => { const oid = String(blobs.size).padStart(40, '0'); blobs.set(oid, content); return Promise.resolve(oid); },
    readBlob: (oid) => { reads += 1; return Promise.resolve(blobs.get(oid) ?? new Uint8Array()); },
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

const UNSUPPORTED: ReadonlyArray<readonly [string, number, string | null, (stored: Stored) => Stored]> = [
  ['version 1, saved before races were saved', 1, 'alice', ({ races: _gone, ...before }) => ({ ...before, version: 1 })],
  ['version 1, naming races', 1, 'alice', (stored) => ({ ...stored, version: 1 })],
  ['version 0', 0, 'alice', (stored) => ({ ...stored, version: 0 })],
  ['version 3, from a newer build', 3, 'alice', (stored) => ({ ...stored, version: 3 })],
  ['version 7, in a shape this build does not know', 7, 'alice', ({ preparation }) => ({ version: 7, preparation, extra: true })],
  ['version 1 with no preparation', 1, null, () => ({ version: 1 })],
  ['version 3 whose preparation does not decode', 3, null, (stored) => ({ ...stored, version: 3, preparation: new Uint8Array([1, 2]) })],
  ['version 3 that renames its preparation', 3, null, ({ preparation, ...rest }) => ({ ...rest, version: 3, prepared: preparation })],
  ['version 1 whose preparation is not a write', 1, null, (stored) => ({ ...stored, version: 1, preparation: custodyCodec.encodePreparation(new ObservationPreparation(OLD, bindings(null))) })],
];

describe('a well-formed write attempt record in a layout other than 2', () => {
  it.each(UNSUPPORTED)('is refused on read (%s) by one typed error that names its ref, layout and writer, if known', async (_name, version, writer, change) => {
    const store = history();
    const journal = journalOf(store);
    await journal.save(record(OLD));
    store.rewrite(OLD_REF, change);

    const refused = await refusal(journal, OLD);

    expect(refused).toBeInstanceOf(UnsupportedWriteAttemptLayoutError);
    expect(refused instanceof UnsupportedWriteAttemptLayoutError
      ? [refused.code, refused.ref, refused.version, refused.writer]
      : null).toEqual(['E_WRITE_ATTEMPT_LAYOUT_UNSUPPORTED', OLD_REF, version, writer]);
    expect(refused?.message).toContain(OLD_REF);
  });

  it('tells only layout 1 to delete its ref, calls layout 0 corrupt, and sends a newer layout to the build that wrote it', async () => {
    const store = history();
    const journal = journalOf(store);
    await journal.save(record(OLD));

    store.rewrite(OLD_REF, (stored) => ({ ...stored, version: 1 }));
    expect((await refusal(journal, OLD))?.message).toContain(`in the repository that holds the graph: git update-ref -d '${OLD_REF}'`);
    store.rewrite(OLD_REF, (stored) => ({ ...stored, version: 0 }));
    const corrupt = (await refusal(journal, OLD))?.message;
    expect(corrupt).toContain('corrupt');
    expect(corrupt).not.toContain('update-ref');
    store.rewrite(OLD_REF, (stored) => ({ ...stored, version: 3 }));
    const newer = (await refusal(journal, OLD))?.message;
    expect(newer).toContain('newer git-warp');
    expect(newer).not.toContain('update-ref');
  });

  it.each(UNSUPPORTED)('is skipped by a listing (%s), which returns its ref', async (_name, _version, _writer, change) => {
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
    const listing = await journal.list(2);
    expect(listing.records).toHaveLength(2);
    expect(new Set(listing.records.map(({ attemptId }) => attemptId.value)).size).toBe(2);
    expect(listing.records.every(({ attemptId }) => ids.some((id) => id.value === attemptId.value))).toBe(true);
    expect(listing.unsupportedRefs).toEqual([]);
  });

  it('does not count an other-layout record against its limit, wherever it starts', async () => {
    const store = history();
    const journal = journalOf(store);
    const ring = [...ids, new ObservationAttemptId('5'.repeat(32)), new ObservationAttemptId('6'.repeat(32))];
    for (const attemptId of ring) {
      await journal.save(record(attemptId));
    }
    // Unsupported entries at cyclic positions 0 and 3 intersect every four-entry window.
    // There are fewer than four unsupported entries, so every start must return all four live records.
    for (const index of [0, 3]) {
      store.rewrite(refOf(ring[index] ?? OLD), (stored) => ({ ...stored, version: 1 }));
    }
    const listing = await journal.list(4);
    expect(listing.records.map(({ attemptId }) => attemptId.value).sort())
      .toEqual(ring.filter((_id, index) => index !== 0 && index !== 3).map(({ value }) => value).sort());
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
    expect((await journal.list(3)).unsupportedRefs.slice().sort()).toEqual(ids.slice(0, 3).map(refOf).sort());
  });

  it('reads O(limit) blobs however many other-layout refs a clone holds', async () => {
    const store = history();
    const journal = journalOf(store);
    const many = Array.from({ length: 2000 }, (_, index) => new ObservationAttemptId(index.toString(16).padStart(32, '0')));
    for (const attemptId of many) {
      await journal.save(record(attemptId));
      store.rewrite(refOf(attemptId), (stored) => ({ ...stored, version: 1 }));
    }
    await journal.save(record(CURRENT));
    const before = store.reads();

    const listing = await journal.list(64);

    expect(store.reads() - before).toBeLessThanOrEqual(65);
    expect(listing.unsupported).toBe(64);
    expect(listing.records.map(({ attemptId }) => attemptId.value))
      .toEqual(listing.records.length === 0 ? [] : [CURRENT.value]);
  });

  it('finds a live record among corrupt blobs when its budget covers the entire page', async () => {
    const store = history();
    const journal = journalOf(store);
    for (const attemptId of ids) {
      await journal.save(record(attemptId));
    }
    for (const attemptId of ids.slice(0, 3)) {
      store.rewrite(refOf(attemptId), () => ({ version: RECORD_LAYOUT, garbage: true }));
    }
    expect((await journal.list(4)).records.map(({ attemptId }) => attemptId.value)).toEqual([ids[3]?.value]);
  });
});
