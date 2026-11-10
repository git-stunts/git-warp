import { afterEach, describe, expect, it } from 'vitest';
import IndeterminateWriteReceipt from '../../../../../src/domain/api/IndeterminateWriteReceipt.ts';
import RetainedWriteReceipt from '../../../../../src/domain/api/RetainedWriteReceipt.ts';
import UnretainedWriteReceipt from '../../../../../src/domain/api/UnretainedWriteReceipt.ts';
import UnpublishedWriteReceipt from '../../../../../src/domain/api/UnpublishedWriteReceipt.ts';
import WriteRace from '../../../../../src/domain/api/WriteRace.ts';
import DotMint from '../../../../../src/domain/crdt/DotMint.ts';
import VersionVector from '../../../../../src/domain/crdt/VersionVector.ts';
import AdapterValidationError from '../../../../../src/domain/errors/AdapterValidationError.ts';
import RetainedWriteCoreMismatchError from '../../../../../src/domain/errors/RetainedWriteCoreMismatchError.ts';
import WarpError from '../../../../../src/domain/errors/WarpError.ts';
import ConeLaneBasis from '../../../../../src/domain/services/cone/ConeLaneBasis.ts';
import LaneConeScope from '../../../../../src/domain/services/cone/LaneConeScope.ts';
import CustodyEvidence from '../../../../../src/domain/services/custody/CustodyEvidence.ts';
import CustodyRefused from '../../../../../src/domain/services/custody/CustodyRefused.ts';
import ObservationCustodyPage from '../../../../../src/domain/services/custody/ObservationCustodyPage.ts';
import ObservationPrepared from '../../../../../src/domain/services/custody/ObservationPrepared.ts';
import ObservationAdmitted from '../../../../../src/domain/services/custody/ObservationAdmitted.ts';
import ObservationAttemptId from '../../../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationBindings from '../../../../../src/domain/services/custody/ObservationBindings.ts';
import ObservationBudget from '../../../../../src/domain/services/custody/ObservationBudget.ts';
import ObservationCustodyService from '../../../../../src/domain/services/custody/ObservationCustodyService.ts';
import ObservationDependencyClaim from '../../../../../src/domain/services/custody/ObservationDependencyClaim.ts';
import ObservationDigest from '../../../../../src/domain/services/custody/ObservationDigest.ts';
import ObservationPreparation from '../../../../../src/domain/services/custody/ObservationPreparation.ts';
import ObservationPublicationEvidence from '../../../../../src/domain/services/custody/ObservationPublicationEvidence.ts';
import ObservationPublicationPermission from '../../../../../src/domain/services/custody/ObservationPublicationPermission.ts';
import ObservationQuestion from '../../../../../src/domain/services/custody/ObservationQuestion.ts';
import ObservationReceiptCore from '../../../../../src/domain/services/custody/ObservationReceiptCore.ts';
import ObservationSettlementPage from '../../../../../src/domain/services/custody/ObservationSettlementPage.ts';
import ObservationWritePremise from '../../../../../src/domain/services/custody/ObservationWritePremise.ts';
import RetainedObservation from '../../../../../src/domain/services/custody/RetainedObservation.ts';
import ConeWritePublisher from '../../../../../src/domain/services/write/ConeWritePublisher.ts';
import LoweredConeWrite from '../../../../../src/domain/services/write/LoweredConeWrite.ts';
import PatchEntryFold from '../../../../../src/domain/services/write/PatchEntryFold.ts';
import WriteAttemptListing from '../../../../../src/domain/services/write/WriteAttemptListing.ts';
import WriteAttemptRecord from '../../../../../src/domain/services/write/WriteAttemptRecord.ts';
import { failedWriteCore, publishedWriteCore } from '../../../../../src/domain/services/write/writeReceiptCore.ts';
import { textDecode } from '../../../../../src/domain/utils/bytes.ts';
import { canonicalStringify } from '../../../../../src/domain/utils/canonicalStringify.ts';
import type CodecValue from '../../../../../src/domain/types/codec/CodecValue.ts';
import { boundRaces } from '../../../../helpers/WarpWriteFixture.ts';
import GitWriteAttemptJournalAdapter, { type WriteAttemptHistory } from '../../../../../src/infrastructure/adapters/GitWriteAttemptJournalAdapter.ts';
import ObservationCustodyCborCodec from '../../../../../src/infrastructure/adapters/ObservationCustodyCborCodec.ts';
import NodeCryptoAdapter from '../../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import codec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import { PatchBuilder } from '../../../../../src/domain/services/PatchBuilder.ts';
import type WriteAttemptJournalPort from '../../../../../src/ports/WriteAttemptJournalPort.ts';
import type ObservationCustodyPort from '../../../../../src/ports/ObservationCustodyPort.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';
import MemoryConeFeed from '../../../../helpers/MemoryConeFeed.ts';
import MeteredObservationCustody from '../../../../helpers/MeteredObservationCustody.ts';
import ObservationCustodyFixture, { basisTree, narrowed, sources, writerCommits } from '../../../../helpers/ObservationCustodyFixture.ts';
import { ScriptedCustody, ScriptedSupport, inspectionAt } from '../../../../helpers/ScriptedObservationPorts.ts';
import InterruptedSettlementRead from '../../../../helpers/InterruptedSettlementRead.ts';
import WriteRecoveryFixture from '../../../../helpers/WriteRecoveryFixture.ts';

const ATTEMPT = new ObservationAttemptId('a'.repeat(32));
const DIGEST = new ObservationDigest('b'.repeat(64));
const COMMIT = 'c'.repeat(40);
const PARENT = 'd'.repeat(40);
const custodyCodec = new ObservationCustodyCborCodec(codec);
const NOTHING_LISTED = new WriteAttemptListing({ records: [], unsupportedRefs: [] });

/** Writers deliberately unsorted; causalities mixed only to exercise ordering. */
const TITLE_RACE = new WriteRace({ kind: 'register', subject: 'doc', key: 'title', writers: ['carol', 'bob'], overflow: 0, causality: 'observed' });
const DAVE_BODY = new WriteRace({ kind: 'register', subject: 'doc', key: 'body', writers: ['dave'], overflow: 2, causality: 'underdetermined' });
const BOB_REMOVED = new WriteRace({ kind: 'lifecycle', subject: 'doc', key: null, writers: ['bob'], overflow: 0, causality: 'observed' });

function preparation(basis = COMMIT, predecessor: string | null = PARENT): ObservationPreparation {
  return new ObservationPreparation(ATTEMPT, new ObservationBindings({
    basis, observer: 'writer:alice', question: new ObservationQuestion('q', 1), purpose: 'p',
    budget: new ObservationBudget({ records: 1, bytes: 1, work: 1 }), evidence: [],
    dependencies: ObservationDependencyClaim.NONE,
    writePremise: new ObservationWritePremise({ intents: DIGEST, writerId: 'alice', predecessor }),
  }));
}

function record(races: readonly WriteRace[] = [TITLE_RACE, BOB_REMOVED, DAVE_BODY], prepared = preparation()): WriteAttemptRecord {
  return new WriteAttemptRecord({
    preparation: prepared, admission: races.length === 0 ? 'derived' : 'plural', races, occurrences: [], savedAt: 1,
  });
}

/** The canonical form a receipt core binds for one race. */
function wire(race: WriteRace) {
  const { kind, subject, key, writers, overflow, causality } = race;
  return { kind, subject, key, writers: [...writers], overflow, causality };
}

function scriptedService(custody: ObservationCustodyPort): ObservationCustodyService {
  return new ObservationCustodyService({
    custody, support: new ScriptedSupport(), codec: custodyCodec, crypto: new NodeCryptoAdapter(), attempts: { next: () => ATTEMPT },
  });
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
    const fields = { preparation: preparation(), occurrences: [], savedAt: 1 };
    for (const twin of [TITLE_RACE, new WriteRace({ ...TITLE_RACE, writers: ['erin'] }), new WriteRace({ ...TITLE_RACE, overflow: 3 })]) {
      expect(() => new WriteAttemptRecord({ ...fields, admission: 'plural', races: [TITLE_RACE, DAVE_BODY, twin] })).toThrow('at most one race per subject and key');
    }
    expect(() => new WriteAttemptRecord({ ...fields, admission: 'plural', races: [BOB_REMOVED, new WriteRace({ ...BOB_REMOVED, causality: 'underdetermined' })] })).toThrow(WarpError);
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
    const port = new ScriptedCustody();
    port.armed = new CustodyRefused('capacity-full');
    const custody = scriptedService(new MeteredObservationCustody(port, (operation, side) => {
      if (side === 'before' && (operation === 'reserve' || operation === 'arm')) {
        steps.push(operation);
      }
    }));
    const fixture = new WriteRecoveryFixture(custody);
    const journal: WriteAttemptJournalPort = {
      save: async (saving) => { await fixture.journal.save(saving); steps.push('save'); saved.push(saving); },
      read: (id) => fixture.journal.read(id),
      remove: (id) => fixture.journal.remove(id),
      list: (limit) => fixture.journal.list(limit),
    };
    const publisher = new ConeWritePublisher({
      graph: 'g', clock: () => 1, custody, journal, attempts: { next: () => ATTEMPT },
      probe: fixture.probe, settlement: fixture.settlement,
    });
    const builder = new PatchBuilder({
      persistence: fixture.history, graphName: 'g', writerId: 'alice', lamport: 1,
      versionVector: VersionVector.empty(), dotMint: DotMint.after('alice', 0), getCurrentState: () => null,
    });
    const cone = new ConeLaneBasis({ store: new InMemoryConeRecordStore(), feed: new MemoryConeFeed('g'), scope: new LaneConeScope('g') });
    const lowered = new LoweredConeWrite({
      writer: 'alice', bindings: preparation().bindings, admission: 'plural', races: [DAVE_BODY, TITLE_RACE, BOB_REMOVED], occurrences: [],
      builder, fold: new PatchEntryFold(cone, PARENT),
    });

    const receipt = await publisher.publish(lowered, () => Promise.resolve(null));

    expect(steps).toEqual(['save', 'reserve', 'arm']);
    expect(receipt).toBeInstanceOf(UnpublishedWriteReceipt);
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
    expect(boundRaces(publishedWriteCore('g', record([]), COMMIT))).toBe('[]');
    expect(boundRaces(failedWriteCore('g', record(), 'stale-predecessor'))).toBe('no races bound');
  });

  it('round-trips through the custody codec byte for byte', () => {
    const core = publishedWriteCore('g', record(), COMMIT);
    const decoded = custodyCodec.decodeCore(custodyCodec.encodeCore(core));

    expect(decoded).toBeInstanceOf(ObservationReceiptCore);
    expect(decoded instanceof ObservationReceiptCore ? textDecode(decoded.outcome()) : null).toBe(PLURAL_CORE);
  });
});

describe('a settled write reports the races its core binds', () => {
  const repositories = new ObservationCustodyFixture();
  afterEach(async () => await repositories.dispose());

  it('passes custody the core with the races and reports the same ones', async () => {
    const port = new ScriptedCustody();
    const custody = scriptedService(port);
    const fixture = new WriteRecoveryFixture(custody);
    const saved = record();
    const attempt = narrowed(await custody.resume(ATTEMPT, saved.bindings), ObservationAdmitted).attempt;
    narrowed(await custody.prepare(attempt, sources()), ObservationPrepared);
    expect(port.pages).toHaveLength(1);
    port.evidence.preparation = new CustodyEvidence('prepared', narrowed(port.pages[0] ?? null, ObservationCustodyPage));
    port.inspected = inspectionAt('armed');
    port.settled = new CustodyRefused('contention');

    const receipt = await fixture.settlement.settle({ attempt, record: saved, commit: COMMIT });
    expect(port.pages).toHaveLength(2);
    const page = narrowed(port.pages[1] ?? null, ObservationCustodyPage);
    const settled = narrowed(custodyCodec.decodeSettlementPage(page.record()), ObservationSettlementPage);
    const core = narrowed(custodyCodec.decodeCore(settled.core()), ObservationReceiptCore);

    expect(receipt).toBeInstanceOf(UnretainedWriteReceipt);
    expect(receipt.outcome.kind).toBe('plural');
    expect(boundRaces(core)).toBe(canonicalStringify(receipt.outcome.races.map(wire)));
  });

  /** A real retained publication; only the journal's race set may differ from what custody kept. */
  async function rebuilding(savedRaces: readonly WriteRace[], heldRaces = savedRaces) {
    const path = await repositories.repository('sha1');
    const basis = basisTree(path, 'race-recovery');
    const [commit] = writerCommits(path, 1);
    if (commit === undefined) {
      throw new Error('The fixture did not create its publication');
    }
    let boundary: InterruptedSettlementRead | null = null;
    const opened = await repositories.open(path, {
      limit: 8,
      wrap: (inner) => { boundary = new InterruptedSettlementRead(inner); return boundary; },
    });
    const interruption = narrowed(boundary, InterruptedSettlementRead);
    const saved = record(savedRaces, preparation(basis, null));
    const held = record(heldRaces, saved.preparation);
    const core = publishedWriteCore('g', held, commit);
    const attempt = narrowed(await opened.service.resume(ATTEMPT, held.bindings), ObservationAdmitted).attempt;
    const prepared = narrowed(await opened.service.prepare(attempt, sources()), ObservationPrepared);
    narrowed(await opened.service.authorizePublication(prepared), ObservationPublicationPermission);
    narrowed(await opened.service.settle(attempt, {
      core, publication: new ObservationPublicationEvidence('alice', commit),
    }), RetainedObservation);
    const fixture = new WriteRecoveryFixture(opened.service);
    await fixture.journal.save(saved);
    return { fixture, core, interruption, saved };
  }

  it('rebuilds a settled receipt from its record with the exact race set its retained core binds', async () => {
    const { fixture, core } = await rebuilding(record().races);

    const rebuilt = await fixture.recovery.reconcile('alice', ATTEMPT.value);

    expect(rebuilt).toBeInstanceOf(RetainedWriteReceipt);
    expect(canonicalStringify(rebuilt instanceof RetainedWriteReceipt ? rebuilt.outcome.races.map(wire) : null)).toBe(boundRaces(core));
    expect(await fixture.journal.read(ATTEMPT)).toBeNull();
  });

  it('stays indeterminate and keeps the record when evidence becomes unreadable after recovering its coordinate', async () => {
    const { fixture, core, interruption, saved } = await rebuilding(record().races);
    // Coordinate recovery reads settlement once, then its resolver reads it once.
    // The next read belongs to receipt reconstruction and is the injected failure.
    interruption.availableThrough = interruption.settlementReads + 2;

    expect(await fixture.recovery.reconcile('alice', ATTEMPT.value)).toBeInstanceOf(IndeterminateWriteReceipt);
    expect(interruption.settlementReads).toBe(interruption.availableThrough + 1);
    expect(await fixture.journal.read(ATTEMPT)).toEqual(saved);

    interruption.availableThrough = Number.POSITIVE_INFINITY;
    const recovered = narrowed(await fixture.recovery.reconcile('alice', ATTEMPT.value), RetainedWriteReceipt);
    expect(canonicalStringify(recovered.outcome.races.map(wire))).toBe(boundRaces(core));
    expect(await fixture.journal.read(ATTEMPT)).toBeNull();
  });

  it('refuses to rebuild a receipt whose record names other races than its retained core, keeping the record', async () => {
    const { fixture, saved } = await rebuilding([DAVE_BODY], record().races);

    const refused = await fixture.recovery.reconcile('alice', ATTEMPT.value).then(() => null, (error: Error) => error);

    expect(refused).toBeInstanceOf(RetainedWriteCoreMismatchError);
    expect(refused instanceof RetainedWriteCoreMismatchError ? refused.code : null).toBe('E_WRITE_CORE_MISMATCH');
    expect(await fixture.journal.read(ATTEMPT)).toEqual(saved);
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
    expect(codec.decode(blob ?? new Uint8Array())).toMatchObject({ version: 2 });
    expect(read?.races.map(wire)).toEqual(saved.races.map(wire));
    expect(read === null ? null : publishedWriteCore('g', read, COMMIT).outcome()).toEqual(publishedWriteCore('g', saved, COMMIT).outcome());
  });

  const malformed: ReadonlyArray<readonly [string, CodecValue]> = [
    ['an unknown kind', [['merge', 'doc', 'title', ['bob'], 0, 'observed']]],
    ['a register race with no key', [['register', 'doc', null, ['bob'], 0, 'observed']]],
    ['a register race with an empty key', [['register', 'doc', '', ['bob'], 0, 'observed']]],
    ['a lifecycle race with a key', [['lifecycle', 'doc', 'title', ['bob'], 0, 'observed']]],
    ['a negative overflow', [['register', 'doc', 'title', ['bob'], -1, 'observed']]],
    ['a fractional overflow', [['register', 'doc', 'title', ['bob'], 0.5, 'observed']]],
    ['an unknown causality', [['register', 'doc', 'title', ['bob'], 0, 'guessed']]],
    ['a non-text writer', [['register', 'doc', 'title', [7], 0, 'observed']]],
    ['an empty writer id', [['register', 'doc', 'title', [''], 0, 'observed']]],
    ['a writer id that is not ref-safe', [['register', 'doc', 'title', ['a/b'], 0, 'observed']]],
    ['a short entry', [['register', 'doc', 'title']]],
    ['a non-list', 'races'],
    ['a plural write with no races', []],
    ['two races on one subject and key', [['register', 'doc', 'title', ['bob'], 0, 'observed'], ['register', 'doc', 'title', ['carol'], 0, 'observed']]],
  ];

  it.each(malformed)('fails closed on %s, with a typed error on read and a skip in a listing', async (_name, races) => {
    const store = history();
    await journal(store).save(record());
    expect(await journal(store).read(ATTEMPT)).toEqual(record());
    const [oid] = [...store.blobs.keys()];
    const stored = codec.decode(store.blobs.get(oid ?? '') ?? new Uint8Array());
    if (stored === null || typeof stored !== 'object') {
      throw new Error('The journal did not encode a record');
    }
    store.blobs.set(oid ?? '', codec.encode({ ...stored, races }));

    await expect(journal(store).read(ATTEMPT)).rejects.toThrow(AdapterValidationError);
    expect(await journal(store).list(4)).toEqual(NOTHING_LISTED);
  });

  it('fails closed on a derived write that names a race', async () => {
    const store = history();
    await journal(store).save(record());
    expect(await journal(store).read(ATTEMPT)).toEqual(record());
    const [oid] = [...store.blobs.keys()];
    const stored = codec.decode(store.blobs.get(oid ?? '') ?? new Uint8Array());
    if (stored === null || typeof stored !== 'object') {
      throw new Error('The journal did not encode a record');
    }
    store.blobs.set(oid ?? '', codec.encode({ ...stored, admission: 'derived' }));

    await expect(journal(store).read(ATTEMPT)).rejects.toThrow(AdapterValidationError);
    expect(await journal(store).list(4)).toEqual(NOTHING_LISTED);
  });
});
