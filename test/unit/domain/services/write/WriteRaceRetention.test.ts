import { describe, expect, it, vi } from 'vitest';
import RetainedWriteReceipt from '../../../../../src/domain/api/RetainedWriteReceipt.ts';
import UnretainedWriteReceipt from '../../../../../src/domain/api/UnretainedWriteReceipt.ts';
import WriteRace from '../../../../../src/domain/api/WriteRace.ts';
import AdapterValidationError from '../../../../../src/domain/errors/AdapterValidationError.ts';
import WarpError from '../../../../../src/domain/errors/WarpError.ts';
import ObservationKnownUnpublished from '../../../../../src/domain/services/custody/ObservationKnownUnpublished.ts';
import ObservationPrepared from '../../../../../src/domain/services/custody/ObservationPrepared.ts';
import ObservationAdmitted from '../../../../../src/domain/services/custody/ObservationAdmitted.ts';
import type ObservationAttempt from '../../../../../src/domain/services/custody/ObservationAttempt.ts';
import ObservationAttemptId from '../../../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationBindings from '../../../../../src/domain/services/custody/ObservationBindings.ts';
import ObservationBudget from '../../../../../src/domain/services/custody/ObservationBudget.ts';
import ObservationCoordinate from '../../../../../src/domain/services/custody/ObservationCoordinate.ts';
import type ObservationCustodyService from '../../../../../src/domain/services/custody/ObservationCustodyService.ts';
import ObservationDependencyClaim from '../../../../../src/domain/services/custody/ObservationDependencyClaim.ts';
import ObservationDigest from '../../../../../src/domain/services/custody/ObservationDigest.ts';
import ObservationPreparation from '../../../../../src/domain/services/custody/ObservationPreparation.ts';
import ObservationPublicationEvidence from '../../../../../src/domain/services/custody/ObservationPublicationEvidence.ts';
import ObservationQuestion from '../../../../../src/domain/services/custody/ObservationQuestion.ts';
import ObservationReceiptCore from '../../../../../src/domain/services/custody/ObservationReceiptCore.ts';
import ObservationRecord from '../../../../../src/domain/services/custody/ObservationRecord.ts';
import ObservationRefused from '../../../../../src/domain/services/custody/ObservationRefused.ts';
import ObservationWritePremise from '../../../../../src/domain/services/custody/ObservationWritePremise.ts';
import ResolvedObservation from '../../../../../src/domain/services/custody/ResolvedObservation.ts';
import RetainedObservation from '../../../../../src/domain/services/custody/RetainedObservation.ts';
import ConeWritePublisher from '../../../../../src/domain/services/write/ConeWritePublisher.ts';
import ConeWriteRecovery from '../../../../../src/domain/services/write/ConeWriteRecovery.ts';
import ConeWriteSettlement from '../../../../../src/domain/services/write/ConeWriteSettlement.ts';
import LoweredConeWrite from '../../../../../src/domain/services/write/LoweredConeWrite.ts';
import type PatchEntryFold from '../../../../../src/domain/services/write/PatchEntryFold.ts';
import WriteAttemptRecord from '../../../../../src/domain/services/write/WriteAttemptRecord.ts';
import type WritePublicationProbe from '../../../../../src/domain/services/write/WritePublicationProbe.ts';
import { failedWriteCore, publishedWriteCore } from '../../../../../src/domain/services/write/writeReceiptCore.ts';
import { textDecode } from '../../../../../src/domain/utils/bytes.ts';
import GitWriteAttemptJournalAdapter, { type WriteAttemptHistory } from '../../../../../src/infrastructure/adapters/GitWriteAttemptJournalAdapter.ts';
import ObservationCustodyCborCodec from '../../../../../src/infrastructure/adapters/ObservationCustodyCborCodec.ts';
import codec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import type { PatchBuilder } from '../../../../../src/domain/services/PatchBuilder.ts';
import type WriteAttemptJournalPort from '../../../../../src/ports/WriteAttemptJournalPort.ts';

const ATTEMPT = new ObservationAttemptId('a'.repeat(32));
const DIGEST = new ObservationDigest('b'.repeat(64));
const COMMIT = 'c'.repeat(40);
const PARENT = 'd'.repeat(40);
const custodyCodec = new ObservationCustodyCborCodec(codec);

/** Writers deliberately unsorted; causalities mixed only to exercise ordering. */
const TITLE_RACE = new WriteRace({ kind: 'register', subject: 'doc', key: 'title', writers: ['carol', 'bob'], overflow: 0, causality: 'observed' });
const DAVE_BODY = new WriteRace({ kind: 'register', subject: 'doc', key: 'body', writers: ['dave'], overflow: 2, causality: 'underdetermined' });
const BOB_REMOVED = new WriteRace({ kind: 'lifecycle', subject: 'doc', key: null, writers: ['bob'], overflow: 0, causality: 'observed' });

function preparation(): ObservationPreparation {
  return new ObservationPreparation(ATTEMPT, new ObservationBindings({
    basis: COMMIT, observer: 'writer:alice', question: new ObservationQuestion('q', 1), purpose: 'p',
    budget: new ObservationBudget({ records: 1, bytes: 1, work: 1 }), evidence: [],
    dependencies: ObservationDependencyClaim.NONE,
    writePremise: new ObservationWritePremise({ intents: DIGEST, writerId: 'alice', predecessor: PARENT }),
  }));
}

function record(races: readonly WriteRace[] = [TITLE_RACE, BOB_REMOVED, DAVE_BODY]): WriteAttemptRecord {
  return new WriteAttemptRecord({
    preparation: preparation(), admission: races.length === 0 ? 'derived' : 'plural', races, occurrences: [], savedAt: 1,
  });
}

/** The canonical form a receipt core binds for one race. */
function wire(race: WriteRace): object {
  const { kind, subject, key, writers, overflow, causality } = race;
  return { kind, subject, key, writers: [...writers], overflow, causality };
}

/** Decoded here only to compare: nothing in core reads a core back yet (#1053). */
function coreRaces(core: ObservationReceiptCore): object {
  const outcome: { readonly races?: unknown } = JSON.parse(textDecode(core.outcome()));
  return outcome.races ?? 'no races bound';
}

const PLURAL_CORE = '{"admission":"plural","commit":"cccccccccccccccccccccccccccccccccccccccc","graph":"g","intents":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","occurrences":[],"predecessor":"dddddddddddddddddddddddddddddddddddddddd",'
  + '"races":[{"causality":"observed","key":null,"kind":"lifecycle","overflow":0,"subject":"doc","writers":["bob"]},'
  + '{"causality":"underdetermined","key":"body","kind":"register","overflow":2,"subject":"doc","writers":["dave"]},'
  + '{"causality":"observed","key":"title","kind":"register","overflow":0,"subject":"doc","writers":["bob","carol"]}],'
  + '"version":2,"writer":"alice"}';

describe('a write attempt record saves its races before arming', () => {
  it('keeps them in canonical order, each naming its writers once and in order', () => {
    const saved = record();

    expect(saved.races.map(wire)).toEqual([wire(BOB_REMOVED), wire(DAVE_BODY), { ...wire(TITLE_RACE), writers: ['bob', 'carol'] }]);
    expect(record([DAVE_BODY, BOB_REMOVED, TITLE_RACE]).races.map(wire)).toEqual(saved.races.map(wire));
    expect(Object.isFrozen(saved.races)).toBe(true);
    expect(saved.asReported(COMMIT).races).toEqual(saved.races);
  });

  it('names each writer of a race once', () => {
    expect(record([new WriteRace({ ...TITLE_RACE, writers: ['bob', 'bob'] })]).races[0]?.writers).toEqual(['bob']);
  });

  it('refuses two races on one subject and key, so its races are a set', () => {
    const fields = { preparation: preparation(), admission: 'plural' as const, occurrences: [], savedAt: 1 };
    for (const twin of [TITLE_RACE, new WriteRace({ ...TITLE_RACE, writers: ['erin'] }), new WriteRace({ ...TITLE_RACE, overflow: 3 })]) {
      expect(() => new WriteAttemptRecord({ ...fields, races: [TITLE_RACE, DAVE_BODY, twin] })).toThrow('at most one race per subject and key');
    }
    expect(() => new WriteAttemptRecord({ ...fields, races: [BOB_REMOVED, new WriteRace({ ...BOB_REMOVED, causality: 'underdetermined' })] })).toThrow(WarpError);
    expect(record([TITLE_RACE, new WriteRace({ ...TITLE_RACE, subject: 'doc2' }), BOB_REMOVED]).races).toHaveLength(3);
  });

  it('refuses a plural attempt with no race, and a derived one with any', () => {
    const fields = { preparation: preparation(), occurrences: [], savedAt: 1 };
    expect(() => new WriteAttemptRecord({ ...fields, admission: 'plural', races: [] })).toThrow(WarpError);
    expect(() => new WriteAttemptRecord({ ...fields, admission: 'derived', races: [TITLE_RACE] })).toThrow(WarpError);
  });
});

describe('a plural write saves its races before it arms', () => {
  it('journals the canonical races before custody is asked to arm', async () => {
    const steps: string[] = [];
    const saved: WriteAttemptRecord[] = [];
    const attempt = { identity: {} } as ObservationAttempt;
    const publisher = new ConeWritePublisher({
      graph: 'g', clock: () => 1,
      custody: {
        resume: () => { steps.push('reserve'); return Promise.resolve(new ObservationAdmitted(attempt, 'reserved')); },
        prepare: () => Promise.resolve(Object.create(ObservationPrepared.prototype)),
        authorizePublication: () => { steps.push('arm'); return Promise.resolve(new ObservationRefused('capacity-full')); },
        cancel: () => Promise.resolve(new ObservationKnownUnpublished(attempt)),
      } as unknown as ObservationCustodyService,
      journal: {
        save: (saving: WriteAttemptRecord) => { steps.push('save'); saved.push(saving); return Promise.resolve(); },
        remove: () => Promise.resolve(),
      } as unknown as WriteAttemptJournalPort,
      attempts: { next: () => ATTEMPT },
      probe: {} as WritePublicationProbe,
      settlement: {} as ConeWriteSettlement,
    });
    const lowered = new LoweredConeWrite({
      writer: 'alice', bindings: preparation().bindings, admission: 'plural', races: [DAVE_BODY, TITLE_RACE, BOB_REMOVED], occurrences: [],
      builder: {} as PatchBuilder, fold: {} as PatchEntryFold,
    });

    await publisher.publish(lowered, () => Promise.resolve(null));

    expect(steps).toEqual(['save', 'reserve', 'arm']);
    expect(saved[0]?.admission).toBe('plural');
    expect(saved[0]?.races.map(wire)).toEqual(record().races.map(wire));
  });
});

describe('the canonical write receipt core', () => {
  it('binds the exact race set of a plural write (golden vector)', () => {
    const core = publishedWriteCore('g', record(), COMMIT);

    expect(textDecode(core.outcome())).toBe(PLURAL_CORE);
    expect(publishedWriteCore('g', record([DAVE_BODY, TITLE_RACE, BOB_REMOVED]), COMMIT).outcome()).toEqual(core.outcome());
  });

  it('binds an empty race list for a derived write, and none for a write that never published', () => {
    expect(coreRaces(publishedWriteCore('g', record([]), COMMIT))).toEqual([]);
    expect(coreRaces(failedWriteCore('g', record(), 'stale-predecessor'))).toBe('no races bound');
  });

  it('round-trips through the custody codec byte for byte', () => {
    const core = publishedWriteCore('g', record(), COMMIT);
    const decoded = custodyCodec.decodeCore(custodyCodec.encodeCore(core));

    expect(decoded).toBeInstanceOf(ObservationReceiptCore);
    expect(decoded instanceof ObservationReceiptCore ? textDecode(decoded.outcome()) : null).toBe(PLURAL_CORE);
  });
});

describe('a settled write reports the races its core binds', () => {
  const attempt = { identity: {} } as ObservationAttempt;

  it('passes custody the core with the races and reports the same ones', async () => {
    const settle = vi.fn((_attempt: ObservationAttempt, _fields: { readonly core: ObservationReceiptCore }) => Promise.resolve(new ObservationRefused('contention')));
    const settling = new ConeWriteSettlement({
      graph: 'g', custody: { settle } as unknown as ObservationCustodyService, journal: { remove: () => Promise.resolve() } as unknown as WriteAttemptJournalPort,
    });
    const saved = record();

    const receipt = await settling.settle({ attempt, record: saved, commit: COMMIT });
    const core = settle.mock.calls[0]?.[1].core;

    expect(receipt).toBeInstanceOf(UnretainedWriteReceipt);
    expect(receipt.outcome.kind).toBe('plural');
    expect(receipt.outcome.races.map(wire)).toEqual(core === undefined ? null : coreRaces(core));
  });

  it('rebuilds a settled receipt from its record with the exact race set', async () => {
    const saved = record();
    const core = publishedWriteCore('g', saved, COMMIT);
    const resolved = new ResolvedObservation({
      preparation: saved.preparation,
      record: new ObservationRecord({ preparation: DIGEST, support: DIGEST, core: DIGEST, publication: new ObservationPublicationEvidence('alice', COMMIT) }),
      core: core.outcome(),
    });
    const settlement = new ConeWriteSettlement({ graph: 'g', custody: {} as ObservationCustodyService, journal: {} as WriteAttemptJournalPort });
    const recovery = new ConeWriteRecovery({
      graph: 'g', clock: () => 1, settlement,
      custody: {
        resume: () => Promise.resolve(new ObservationAdmitted(attempt, 'settled')),
        recoverCoordinate: () => Promise.resolve(new RetainedObservation(new ObservationCoordinate({ attemptId: ATTEMPT, binding: DIGEST, record: DIGEST }), new Uint8Array())),
        resolve: () => Promise.resolve(resolved),
      } as unknown as ObservationCustodyService,
      journal: { read: () => Promise.resolve(saved), remove: () => Promise.resolve() } as unknown as WriteAttemptJournalPort,
      probe: {} as WritePublicationProbe,
    });

    const rebuilt = await recovery.reconcile('alice', ATTEMPT.value);

    expect(rebuilt).toBeInstanceOf(RetainedWriteReceipt);
    expect(rebuilt instanceof RetainedWriteReceipt ? rebuilt.outcome.races.map(wire) : null).toEqual(coreRaces(core));
  });
});

describe('the journal keeps a record\'s races', () => {
  function history(): WriteAttemptHistory & { readonly blobs: Map<string, Uint8Array> } {
    const blobs = new Map<string, Uint8Array>();
    const refs = new Map<string, string>();
    return {
      blobs,
      writeBlob: (content) => { const oid = String(blobs.size).padStart(40, '0'); blobs.set(oid, content); return Promise.resolve(oid); },
      readBlob: (oid) => Promise.resolve(blobs.get(oid) ?? new Uint8Array()),
      updateRef: (ref, oid) => { refs.set(ref, oid); return Promise.resolve(); },
      readRef: (ref) => Promise.resolve(refs.get(ref) ?? null),
      deleteRef: (ref) => { refs.delete(ref); return Promise.resolve(); },
      readRefTargets: () => Promise.resolve(new Map(refs)),
    };
  }

  function journal(store: WriteAttemptHistory): GitWriteAttemptJournalAdapter {
    return new GitWriteAttemptJournalAdapter({ graph: 'g', history: store, codec, custodyCodec });
  }

  it('reads back the exact races it saved, so a rebuilt core is byte-identical', async () => {
    const store = history();
    const saved = record();
    await journal(store).save(saved);

    const read = await journal(store).read(ATTEMPT);

    const [blob] = [...store.blobs.values()];
    const stored: { readonly version?: unknown } = codec.decode(blob ?? new Uint8Array());

    expect(stored.version).toBe(2);
    expect(read?.races.map(wire)).toEqual(saved.races.map(wire));
    expect(read === null ? null : publishedWriteCore('g', read, COMMIT).outcome()).toEqual(publishedWriteCore('g', saved, COMMIT).outcome());
  });

  type Stored = { readonly [field: string]: unknown };
  const withRaces = (races: unknown) => (stored: Stored): Stored => ({ ...stored, races });
  const malformed: ReadonlyArray<readonly [string, (stored: Stored) => Stored]> = [
    ['an unknown layout version', (stored) => ({ ...stored, version: 99 })],
    ['an unknown kind', withRaces([['merge', 'doc', 'title', ['bob'], 0, 'observed']])],
    ['a register race with no key', withRaces([['register', 'doc', null, ['bob'], 0, 'observed']])],
    ['a register race with an empty key', withRaces([['register', 'doc', '', ['bob'], 0, 'observed']])],
    ['a lifecycle race with a key', withRaces([['lifecycle', 'doc', 'title', ['bob'], 0, 'observed']])],
    ['a negative overflow', withRaces([['register', 'doc', 'title', ['bob'], -1, 'observed']])],
    ['a fractional overflow', withRaces([['register', 'doc', 'title', ['bob'], 0.5, 'observed']])],
    ['an unknown causality', withRaces([['register', 'doc', 'title', ['bob'], 0, 'guessed']])],
    ['a non-text writer', withRaces([['register', 'doc', 'title', [7], 0, 'observed']])],
    ['a short entry', withRaces([['register', 'doc', 'title']])],
    ['a non-list', withRaces('races')],
    ['a plural write with no races', withRaces([])],
    ['two races on one subject and key', withRaces([['register', 'doc', 'title', ['bob'], 0, 'observed'], ['register', 'doc', 'title', ['carol'], 0, 'observed']])],
  ];

  it.each(malformed)('fails closed on %s, with a typed error on read and a skip in a listing', async (_name, corrupt) => {
    const store = history();
    await journal(store).save(record());
    const [oid] = [...store.blobs.keys()];
    const stored: Stored = codec.decode(store.blobs.get(oid ?? '') ?? new Uint8Array());
    store.blobs.set(oid ?? '', codec.encode(corrupt(stored)));

    await expect(journal(store).read(ATTEMPT)).rejects.toThrow(AdapterValidationError);
    expect((await journal(store).list(4)).records).toEqual([]);
  });

  it('fails closed on a derived write that names a race', async () => {
    const store = history();
    await journal(store).save(record());
    const [oid] = [...store.blobs.keys()];
    const stored: { readonly [key: string]: unknown } = codec.decode(store.blobs.get(oid ?? '') ?? new Uint8Array());
    store.blobs.set(oid ?? '', codec.encode({ ...stored, admission: 'derived' }));

    await expect(journal(store).read(ATTEMPT)).rejects.toThrow(AdapterValidationError);
  });
});
