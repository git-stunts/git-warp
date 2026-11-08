import { describe, expect, it, vi } from 'vitest';
import { GitStorage } from '../../../../../index.ts';
import { bindWarpStorage, resolveConeWrites } from '../../../../../src/application/WarpStorageRegistry.ts';
import MessageCodecError from '../../../../../src/domain/errors/MessageCodecError.ts';
import WarpError from '../../../../../src/domain/errors/WarpError.ts';
import type ObservationAttempt from '../../../../../src/domain/services/custody/ObservationAttempt.ts';
import ObservationAttemptId from '../../../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationBindings from '../../../../../src/domain/services/custody/ObservationBindings.ts';
import ObservationBudget from '../../../../../src/domain/services/custody/ObservationBudget.ts';
import type ObservationCoordinate from '../../../../../src/domain/services/custody/ObservationCoordinate.ts';
import type ObservationCustodyService from '../../../../../src/domain/services/custody/ObservationCustodyService.ts';
import ObservationDependencyClaim from '../../../../../src/domain/services/custody/ObservationDependencyClaim.ts';
import ObservationDigest from '../../../../../src/domain/services/custody/ObservationDigest.ts';
import ObservationPreparation from '../../../../../src/domain/services/custody/ObservationPreparation.ts';
import ObservationQuestion from '../../../../../src/domain/services/custody/ObservationQuestion.ts';
import ObservationRefused from '../../../../../src/domain/services/custody/ObservationRefused.ts';
import ObservationUnretained from '../../../../../src/domain/services/custody/ObservationUnretained.ts';
import ObservationWritePremise from '../../../../../src/domain/services/custody/ObservationWritePremise.ts';
import ObservationDecodeFailure from '../../../../../src/domain/services/custody/ObservationDecodeFailure.ts';
import ObservationAdmitted from '../../../../../src/domain/services/custody/ObservationAdmitted.ts';
import RetainedObservation from '../../../../../src/domain/services/custody/RetainedObservation.ts';
import IndeterminateWriteReceipt from '../../../../../src/domain/api/IndeterminateWriteReceipt.ts';
import ConeWriteRecovery from '../../../../../src/domain/services/write/ConeWriteRecovery.ts';
import ConeWriteSettlement from '../../../../../src/domain/services/write/ConeWriteSettlement.ts';
import WriteAttemptRecord from '../../../../../src/domain/services/write/WriteAttemptRecord.ts';
import WritePublicationProbe from '../../../../../src/domain/services/write/WritePublicationProbe.ts';
import ConcurrentValue from '../../../../../src/domain/api/ConcurrentValue.ts';
import LifecyclePlurality from '../../../../../src/domain/api/LifecyclePlurality.ts';
import RegisterPlurality from '../../../../../src/domain/api/RegisterPlurality.ts';
import UnretainedWriteReceipt from '../../../../../src/domain/api/UnretainedWriteReceipt.ts';
import type WriteRace from '../../../../../src/domain/api/WriteRace.ts';
import { writeRaceOf } from '../../../../../src/domain/services/write/writeRaceOf.ts';
import { buildWriteAttemptRef } from '../../../../../src/domain/utils/WriteAttemptRefLayout.ts';
import type WriteAttemptJournalPort from '../../../../../src/ports/WriteAttemptJournalPort.ts';
import type CommitMessageCodecPort from '../../../../../src/ports/CommitMessageCodecPort.ts';
import type CodecPort from '../../../../../src/ports/CodecPort.ts';
import type ObservationCustodyCodecPort from '../../../../../src/ports/ObservationCustodyCodecPort.ts';
import GitWriteAttemptJournalAdapter, { type WriteAttemptHistory } from '../../../../../src/infrastructure/adapters/GitWriteAttemptJournalAdapter.ts';

const ATTEMPT = new ObservationAttemptId('a'.repeat(32));
const DIGEST = new ObservationDigest('b'.repeat(64));
const OID = 'c'.repeat(40);
const PARENT = 'd'.repeat(40);

function bindings(writePremise: ObservationWritePremise | null): ObservationBindings {
  return new ObservationBindings({
    basis: OID, observer: 'writer:alice', question: new ObservationQuestion('q', 1), purpose: 'p',
    budget: new ObservationBudget({ records: 1, bytes: 1, work: 1 }), evidence: [],
    dependencies: ObservationDependencyClaim.NONE, writePremise,
  });
}

function recordOf(predecessor: string | null = PARENT): WriteAttemptRecord {
  return new WriteAttemptRecord({
    preparation: new ObservationPreparation(ATTEMPT, bindings(new ObservationWritePremise({ intents: DIGEST, writerId: 'alice', predecessor }))),
    admission: 'derived', occurrences: [], savedAt: 1,
  });
}

function probe(fields: {
  readonly tip?: string | null;
  readonly parents?: readonly string[];
  readonly decode?: () => object;
}): WritePublicationProbe {
  const decodePatch = fields.decode ?? (() => ({ graph: 'g', writer: 'alice', publicationAttempt: ATTEMPT.value }));
  return new WritePublicationProbe({
    graph: 'g',
    messages: { decodePatch } as unknown as CommitMessageCodecPort,
    history: {
      readRef: () => Promise.resolve(fields.tip === undefined ? OID : fields.tip),
      getNodeInfo: (sha) => Promise.resolve({ sha, message: 'm', author: 'a', date: 'd', parents: [...(fields.parents ?? [PARENT])] }),
      firstParentsSince: () => Promise.resolve([OID]),
    },
  });
}

describe('writeRaceOf', () => {
  it('names who raced on a register, without what they wrote', () => {
    const race = writeRaceOf(new RegisterPlurality({
      subject: 'doc', key: 'title', overflow: 1, causality: 'observed',
      winner: new ConcurrentValue({ writer: 'alice', value: 'mine' }),
      siblings: [new ConcurrentValue({ writer: 'bob', value: 'a' }), new ConcurrentValue({ writer: 'bob', value: 'b' })],
    }));

    expect(race).toMatchObject({ kind: 'register', subject: 'doc', key: 'title', writers: ['bob'], overflow: 1 });
    expect(JSON.stringify(race)).not.toContain('mine');
  });

  it('names who removed a raced node or edge', () => {
    const lifecycle = (element: ConstructorParameters<typeof LifecyclePlurality>[0]['element']): WriteRace => writeRaceOf(new LifecyclePlurality({
      element, removedBy: ['bob'], editedBy: ['alice'], overflow: 0, causality: 'observed',
    }));

    expect(lifecycle({ kind: 'node', subject: 'doc' })).toMatchObject({ kind: 'lifecycle', subject: 'doc', key: null, writers: ['bob'] });
    expect(lifecycle({ kind: 'edge', from: 'a', to: 'b', label: 'l' }).subject).toBe('a>b:l');
  });
});

describe('WriteAttemptRecord', () => {
  it('refuses a preparation that is not a write', () => {
    expect(() => new WriteAttemptRecord({
      preparation: new ObservationPreparation(ATTEMPT, bindings(null)), admission: 'derived', occurrences: [], savedAt: 1,
    })).toThrow('write premise');
  });
});

describe('WritePublicationProbe', () => {
  it('proves only the attempt that names itself on its predecessor', async () => {
    await expect(probe({}).proves(OID, recordOf())).resolves.toBe(true);
    await expect(probe({ parents: [] }).proves(OID, recordOf())).resolves.toBe(false);
    await expect(probe({ parents: [PARENT, OID] }).proves(OID, recordOf())).resolves.toBe(false);
    await expect(probe({ decode: () => ({ graph: 'g', writer: 'bob', publicationAttempt: ATTEMPT.value }) }).proves(OID, recordOf())).resolves.toBe(false);
    await expect(probe({ decode: () => ({ graph: 'other', writer: 'alice', publicationAttempt: ATTEMPT.value }) }).proves(OID, recordOf())).resolves.toBe(false);
    await expect(probe({ decode: () => ({ graph: 'g', writer: 'alice' }) }).proves(OID, recordOf())).resolves.toBe(false);
  });

  it('calls an undecodable commit not its own, and does not hide any other failure', async () => {
    const undecodable = probe({ decode: () => { throw new MessageCodecError('bad'); } });
    await expect(undecodable.proves(OID, recordOf())).resolves.toBe(false);
    const broken = probe({ decode: () => { throw new Error('boom'); } });
    await expect(broken.proves(OID, recordOf())).rejects.toThrow('boom');
  });

  it('finds nothing without a tip, at its predecessor, or past a chain that never reaches it', async () => {
    await expect(probe({ tip: null }).locate(recordOf())).resolves.toEqual({ kind: 'none' });
    await expect(probe({ tip: PARENT }).locate(recordOf())).resolves.toEqual({ kind: 'none' });
    await expect(probe({ parents: [] }).locate(recordOf())).resolves.toEqual({ kind: 'none' });
    const endless = probe({ parents: [OID] });
    await expect(endless.locate(recordOf())).resolves.toEqual({ kind: 'none' });
  });

  it('tells its own commit from another that took its place', async () => {
    await expect(probe({}).locate(recordOf())).resolves.toEqual({ kind: 'own', commit: OID });
    await expect(probe({ decode: () => ({ graph: 'g', writer: 'alice', publicationAttempt: 'f'.repeat(32) }) }).locate(recordOf())).resolves.toEqual({ kind: 'other' });
  });
});

describe('ConeWriteSettlement', () => {
  const attempt = {} as ObservationAttempt;

  function settlement(settled: () => Promise<object>): { readonly settling: ConeWriteSettlement; readonly remove: ReturnType<typeof vi.fn> } {
    const remove = vi.fn(() => Promise.reject(new Error('journal went away')));
    return {
      remove,
      settling: new ConeWriteSettlement({
        graph: 'g',
        custody: { settle: settled } as unknown as ObservationCustodyService,
        journal: { remove } as unknown as WriteAttemptJournalPort,
      }),
    };
  }

  it('reports an unretained write however custody fails, keeping a record worth repeating', async () => {
    const { settling, remove } = settlement(() => Promise.reject(new Error('boom')));
    const receipt = await settling.settle({ attempt, record: recordOf(), commit: OID, races: [] });

    expect(receipt).toBeInstanceOf(UnretainedWriteReceipt);
    expect(receipt instanceof UnretainedWriteReceipt ? receipt.retention : '').toBe('settlement-unacknowledged');
    expect(remove).not.toHaveBeenCalled();
  });

  it('drops the record when custody can never hold this core, even if removing it fails', async () => {
    const { settling, remove } = settlement(() => Promise.resolve(new ObservationUnretained(attempt, 'settlement-conflict')));
    const receipt = await settling.settle({ attempt, record: recordOf(), commit: OID, races: [] });

    expect(receipt instanceof UnretainedWriteReceipt ? receipt.retention : '').toBe('settlement-conflict');
    expect(remove).toHaveBeenCalledOnce();
  });

  it('calls any other settlement answer unacknowledged', async () => {
    const { settling } = settlement(() => Promise.resolve(new ObservationRefused('contention')));
    const receipt = await settling.settle({ attempt, record: recordOf(), commit: OID, races: [] });

    expect(receipt instanceof UnretainedWriteReceipt ? receipt.retention : '').toBe('settlement-unacknowledged');
  });

  it('refuses a Coordinate whose text custody cannot have issued', () => {
    const { settling } = settlement(() => Promise.resolve({}));
    const coordinate = { toString: () => 'nope' } as ObservationCoordinate;
    expect(() => settling.retained({ attempt, record: recordOf(), commit: OID, races: [] }, coordinate)).toThrow(WarpError);
  });
});

describe('write attempt storage', () => {
  it('reserves its ref segment so no graph can collide with it', () => {
    expect(buildWriteAttemptRef('g', ATTEMPT.value)).toBe(`refs/warp/g/write-attempts/${ATTEMPT.value}`);
    expect(() => buildWriteAttemptRef('write-attempts', ATTEMPT.value)).toThrow('reserved');
  });

  it('refuses a storage bound without cone write capabilities', () => {
    const storage = GitStorage.at('.');
    bindWarpStorage(storage, { history: {} as never, runtimeStorage: {} as never });
    expect(() => resolveConeWrites(storage)).toThrow('cone write capabilities');
  });
});

describe('GitWriteAttemptJournalAdapter', () => {
  it('refuses to read a blob that does not decode as though nothing were saved', async () => {
    const journal = new GitWriteAttemptJournalAdapter({
      graph: 'g',
      codec: { decode: () => { throw new Error('not cbor'); } } as unknown as CodecPort,
      custodyCodec: {} as ObservationCustodyCodecPort,
      history: { readRef: () => Promise.resolve(OID), readBlob: () => Promise.resolve(new Uint8Array()) } as unknown as WriteAttemptHistory,
    });

    await expect(journal.read(ATTEMPT)).rejects.toThrow('could not be decoded');
  });
});

describe('ConeWriteRecovery', () => {
  function recovery(fields: { readonly custody?: object; readonly journal: object }): ConeWriteRecovery {
    return new ConeWriteRecovery({
      graph: 'g', clock: () => 1,
      custody: fields.custody as ObservationCustodyService,
      journal: fields.journal as WriteAttemptJournalPort,
      probe: probe({}),
      settlement: {} as ConeWriteSettlement,
    });
  }

  it('survives a listing that fails, and one record that throws', async () => {
    await expect(recovery({ journal: { list: () => Promise.reject(new Error('no refs')) } }).sweep()).resolves.toBeUndefined();
    const resume = vi.fn(() => Promise.reject(new Error('bad')));
    await expect(recovery({ custody: { resume }, journal: { list: () => Promise.resolve([recordOf(), recordOf()]) } }).sweep()).resolves.toBeUndefined();
    expect(resume).toHaveBeenCalledTimes(2);
  });

  it('finishes an attempt that never held a slot, or was cancelled', async () => {
    for (const [reason, cause] of [['capacity-full', 'retention-capacity-exhausted'], ['cancelled', 'attempt-cancelled']] as const) {
      const answer = await recovery({
        custody: { resume: () => Promise.resolve(new ObservationRefused(reason)) },
        journal: { read: () => Promise.resolve(recordOf()), remove: () => Promise.resolve() },
      }).reconcile('alice', ATTEMPT.value);
      expect(answer).toMatchObject({ cause });
    }
  });

  it('never calls an unarmed attempt unpublished when a record or the chain names its commit', async () => {
    const attempt = { identity: {} } as ObservationAttempt;
    const remove = vi.fn();
    const abandon = vi.fn();
    const run = async (record: WriteAttemptRecord, kind: 'own' | 'none'): Promise<object | null> => await new ConeWriteRecovery({
      graph: 'g', clock: () => 1e12,
      custody: { resume: () => Promise.resolve(new ObservationAdmitted(attempt, 'reserved')), abandon } as unknown as ObservationCustodyService,
      journal: { read: () => Promise.resolve(record), remove } as unknown as WriteAttemptJournalPort,
      probe: { locate: () => Promise.resolve({ kind, commit: OID }) } as unknown as WritePublicationProbe,
      settlement: {} as ConeWriteSettlement,
    }).reconcile('alice', ATTEMPT.value);

    expect(await run(recordOf().asReported(OID), 'none')).toBeInstanceOf(IndeterminateWriteReceipt);
    expect(await run(recordOf(), 'own')).toBeInstanceOf(IndeterminateWriteReceipt);
    expect(abandon).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('keeps a record when custody refuses for a reason that may clear', async () => {
    const remove = vi.fn();
    const answer = await recovery({
      custody: { resume: () => Promise.resolve(new ObservationRefused('contention')) },
      journal: { read: () => Promise.resolve(recordOf()), remove },
    }).reconcile('alice', ATTEMPT.value);

    expect(answer).toBeInstanceOf(IndeterminateWriteReceipt);
    expect(remove).not.toHaveBeenCalled();
  });

  it('settles from the commit a receipt reported, whatever the chain says now', async () => {
    const attempt = { identity: {} } as ObservationAttempt;
    const settle = vi.fn(() => Promise.resolve({}));
    const service = new ConeWriteRecovery({
      graph: 'g', clock: () => 1,
      custody: {
        resume: () => Promise.resolve(new ObservationAdmitted(attempt, 'armed')),
        recoverCoordinate: () => Promise.resolve(new ObservationRefused('not-settled')),
      } as unknown as ObservationCustodyService,
      journal: { read: () => Promise.resolve(recordOf().asReported(OID)) } as unknown as WriteAttemptJournalPort,
      probe: { locate: () => Promise.reject(new Error('not asked')) } as unknown as WritePublicationProbe,
      settlement: { settle } as unknown as ConeWriteSettlement,
    });

    await service.reconcile('alice', ATTEMPT.value);

    expect(settle).toHaveBeenCalledWith(expect.objectContaining({ commit: OID }));
  });

  it('leaves a reported attempt for its caller', async () => {
    const resume = vi.fn();
    await recovery({ custody: { resume }, journal: { list: () => Promise.resolve([recordOf().asReported(null)]) } }).sweep();
    expect(resume).not.toHaveBeenCalled();
  });

  it('stays indeterminate when a settled publication cannot be resolved', async () => {
    const attempt = { identity: {} } as ObservationAttempt;
    const remove = vi.fn();
    const answer = await recovery({
      custody: {
        resume: () => Promise.resolve(new ObservationAdmitted(attempt, 'settled')),
        recoverCoordinate: () => Promise.resolve(new RetainedObservation({} as ObservationCoordinate, new Uint8Array())),
        resolve: () => Promise.resolve({}),
      },
      journal: { read: () => Promise.resolve(recordOf()), remove },
    }).reconcile('alice', ATTEMPT.value);

    expect(answer).toBeInstanceOf(IndeterminateWriteReceipt);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('a saved record that is not a write', () => {
  it('skips a blob it cannot open in a listing, and rejects on a direct read', async () => {
    const journal = new GitWriteAttemptJournalAdapter({
      graph: 'g',
      codec: {} as CodecPort,
      custodyCodec: {} as ObservationCustodyCodecPort,
      history: {
        readRef: () => Promise.resolve(OID),
        readRefTargets: () => Promise.resolve(new Map([['r', OID]])),
        readBlob: () => Promise.reject(new Error('missing object')),
      } as unknown as WriteAttemptHistory,
    });

    await expect(journal.list(4)).resolves.toEqual([]);
    await expect(journal.read(ATTEMPT)).rejects.toThrow('missing object');
  });

  it('refuses to read a blob of the wrong shape', async () => {
    const journal = new GitWriteAttemptJournalAdapter({
      graph: 'g',
      codec: { decode: () => ({ version: 99 }) } as unknown as CodecPort,
      custodyCodec: {} as ObservationCustodyCodecPort,
      history: { readRef: () => Promise.resolve(OID), readBlob: () => Promise.resolve(new Uint8Array()) } as unknown as WriteAttemptHistory,
    });

    await expect(journal.read(ATTEMPT)).rejects.toThrow('could not be decoded');
  });

  it('refuses to read an undecodable preparation', async () => {
    const journal = new GitWriteAttemptJournalAdapter({
      graph: 'g',
      codec: { decode: () => ({ version: 1, preparation: new Uint8Array(), admission: 'derived', occurrences: [], savedAt: 1, reported: false, commit: null }) } as unknown as CodecPort,
      custodyCodec: { decodePreparation: () => new ObservationDecodeFailure('malformed') } as unknown as ObservationCustodyCodecPort,
      history: { readRef: () => Promise.resolve(OID), readBlob: () => Promise.resolve(new Uint8Array()) } as unknown as WriteAttemptHistory,
    });

    await expect(journal.read(ATTEMPT)).rejects.toThrow('could not be decoded');
  });

  it('refuses to read it', async () => {
    const journal = new GitWriteAttemptJournalAdapter({
      graph: 'g',
      codec: { decode: () => ({ version: 1, preparation: new Uint8Array(), admission: 'derived', occurrences: [], savedAt: 1, reported: false, commit: null }) } as unknown as CodecPort,
      custodyCodec: { decodePreparation: () => new ObservationPreparation(ATTEMPT, bindings(null)) } as unknown as ObservationCustodyCodecPort,
      history: { readRef: () => Promise.resolve(OID), readBlob: () => Promise.resolve(new Uint8Array()) } as unknown as WriteAttemptHistory,
    });

    await expect(journal.read(ATTEMPT)).rejects.toThrow('could not be decoded');
  });
});
