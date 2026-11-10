import { describe, expect, it, vi } from 'vitest';
import { intent } from '../../../../../advanced.ts';
import IntentSequence from '../../../../../src/domain/api/IntentSequence.ts';
import UnpublishedWriteReceipt from '../../../../../src/domain/api/UnpublishedWriteReceipt.ts';
import WarpWriteGrant from '../../../../../src/domain/api/WarpWriteGrant.ts';
import { operationalWriteFailure } from '../../../../../src/domain/api/WriteRuntime.ts';
import DotMint from '../../../../../src/domain/crdt/DotMint.ts';
import VersionVector from '../../../../../src/domain/crdt/VersionVector.ts';
import CrdtError from '../../../../../src/domain/errors/CrdtError.ts';
import MessageCodecError from '../../../../../src/domain/errors/MessageCodecError.ts';
import SyncError from '../../../../../src/domain/errors/SyncError.ts';
import ConeRecordError from '../../../../../src/domain/errors/ConeRecordError.ts';
import ConeStoreUnavailableError from '../../../../../src/domain/errors/ConeStoreUnavailableError.ts';
import PatchError from '../../../../../src/domain/errors/PatchError.ts';
import PersistenceError from '../../../../../src/domain/errors/PersistenceError.ts';
import WarpError from '../../../../../src/domain/errors/WarpError.ts';
import ConeContendedObstruction from '../../../../../src/domain/services/cone/ConeContendedObstruction.ts';
import ConeLaneBasis from '../../../../../src/domain/services/cone/ConeLaneBasis.ts';
import type ConeObstruction from '../../../../../src/domain/services/cone/ConeObstruction.ts';
import ConeRecoveryObstruction from '../../../../../src/domain/services/cone/ConeRecoveryObstruction.ts';
import type ConeWritePremise from '../../../../../src/domain/services/cone/ConeWritePremise.ts';
import LaneConeScope from '../../../../../src/domain/services/cone/LaneConeScope.ts';
import ContentStagingAuthority from '../../../../../src/domain/services/ContentStagingAuthority.ts';
import { PatchBuilder } from '../../../../../src/domain/services/PatchBuilder.ts';
import ConeWriteLowering from '../../../../../src/domain/services/write/ConeWriteLowering.ts';
import LoweredConeWrite from '../../../../../src/domain/services/write/LoweredConeWrite.ts';
import WriterFrontierLimit from '../../../../../src/domain/services/write/WriterFrontierLimit.ts';
import { WARP_SUPPORT_LIMITS } from '../../../../../src/application/WarpWriteComposition.ts';
import ConeBasis from '../../../../../src/domain/services/cone/ConeBasis.ts';
import ConeFrontier from '../../../../../src/domain/services/cone/ConeFrontier.ts';
import ConeRoot from '../../../../../src/domain/services/cone/ConeRoot.ts';
import ConeWritePremiseRecord from '../../../../../src/domain/services/cone/ConeWritePremise.ts';
import ConeWriterPosition from '../../../../../src/domain/services/cone/ConeWriterPosition.ts';
import StoredConeBasis from '../../../../../src/domain/services/cone/StoredConeBasis.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import NodeCryptoAdapter from '../../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';
import MemoryConeFeed from '../../../../helpers/MemoryConeFeed.ts';
import { createPatchBuilderMockPersistence, RecordingPatchJournal } from '../PatchBuilderTestHarness.ts';

const GRAPH = 'g';
const GRANT = new WarpWriteGrant({ authority: 'a', budget: { records: 9, bytes: 9999, work: 9 } });
const request = { writer: 'alice', grant: GRANT, sequence: IntentSequence.from(intent.node.add({ subject: 'x' })) };
const removal = { writer: 'alice', grant: GRANT, sequence: IntentSequence.from(intent.node.remove({ subject: 'x' })) };
const unavailable = (): ConeStoreUnavailableError => new ConeStoreUnavailableError('read a blob', new Error('EIO: i/o error'));

type Premise = (published: () => Promise<ConeWritePremise | ConeObstruction>) => Promise<ConeWritePremise | ConeObstruction>;

/** A real in-memory lane cone whose write premise the test decides, given the one it would publish. */
function cone(premise: Premise): ConeLaneBasis {
  const PremiseCone = class extends ConeLaneBasis {
    override async writePremise(): Promise<ConeWritePremise | ConeObstruction> {
      return await premise(async () => await super.writePremise());
    }
  };
  return new PremiseCone({ store: new InMemoryConeRecordStore(), feed: new MemoryConeFeed(GRAPH), scope: new LaneConeScope(GRAPH) });
}

/** A real patch builder for the writer; without a journal it has no history to observe. */
function builder(options: { readonly journaled: boolean } = { journaled: true }): PatchBuilder {
  const refs = createPatchBuilderMockPersistence();
  return new PatchBuilder({
    persistence: refs, graphName: GRAPH, writerId: 'alice', lamport: 1,
    ...(options.journaled ? { patchJournal: new RecordingPatchJournal(refs) } : {}),
    versionVector: VersionVector.empty(), dotMint: DotMint.after('alice', 0), getCurrentState: () => null,
  });
}

function lowering(fields: { readonly premise?: Premise; readonly patch?: PatchBuilder; readonly openPatch?: () => Promise<PatchBuilder> }): ConeWriteLowering {
  const patch = fields.patch ?? builder();
  return new ConeWriteLowering({
    graph: GRAPH,
    cone: cone(fields.premise ?? (async (published) => await published())),
    content: new ContentStagingAuthority(),
    crypto: new NodeCryptoAdapter(),
    writers: new WriterFrontierLimit(WARP_SUPPORT_LIMITS.writers),
    openPatch: fields.openPatch ?? (async () => await Promise.resolve(patch)),
  });
}

/** A builder whose premise read fails with `failure`. */
function failingPremiseRead(failure: Error): PatchBuilder {
  const patch = builder();
  vi.spyOn(patch, 'prepareConeWriteBasis').mockRejectedValue(failure);
  return patch;
}

function causeOf(lowered: object): string {
  return lowered instanceof UnpublishedWriteReceipt ? lowered.cause : 'not an unpublished receipt';
}

describe('ConeWriteLowering', () => {
  it('reports an obstructed basis with its repair, reserving nothing', async () => {
    const lowered = await lowering({ premise: async () => await Promise.resolve(new ConeContendedObstruction(GRAPH, 4)) }).lower(request);

    expect(causeOf(lowered)).toBe('cone_contended');
    expect(lowered instanceof UnpublishedWriteReceipt ? lowered.repairHints[0]?.code : '').toBe('retry_cone_advance');
  });

  it('names a failed value recovery with its own repair', async () => {
    const event = new EventId(1, 'bob', 'a'.repeat(40), 0);
    const lowered = await lowering({ premise: async () => await Promise.resolve(new ConeRecoveryObstruction(event, 'unavailable')) }).lower(request);

    expect(causeOf(lowered)).toBe('cone_recovery');
  });

  it('reports an unavailable store fixing the basis or opening the patch as unpublished', async () => {
    const basis = await lowering({ premise: async () => await Promise.reject(unavailable()) }).lower(request);
    const patch = await lowering({ openPatch: async () => await Promise.reject(unavailable()) }).lower(request);

    expect(causeOf(basis)).toBe('write-basis-unavailable');
    expect(causeOf(patch)).toBe('write-basis-unavailable');
  });

  it('rejects a defect, corruption or an untyped failure while fixing the basis or opening the patch', async () => {
    const failures = [
      new TypeError('a defect'),
      new ConeRecordError('Cone basis head has no frontier', { code: 'E_CONE_RECORD_CORRUPT' }),
      new PersistenceError('object missing', PersistenceError.E_MISSING_OBJECT),
    ];
    for (const failure of failures) {
      await expect(lowering({ premise: async () => await Promise.reject(failure) }).lower(request)).rejects.toBe(failure);
    }
    await expect(lowering({ openPatch: async () => await Promise.reject(new Error('untyped')) }).lower(request)).rejects.toThrow('untyped');
  });

  it('reports an unavailable store reading the premise records as unpublished', async () => {
    const lowered = await lowering({ patch: failingPremiseRead(unavailable()) }).lower(request);

    expect(lowered).toBeInstanceOf(UnpublishedWriteReceipt);
    expect(causeOf(lowered)).toBe('write-premise-unavailable');
  });

  it('rejects defects, broken invariants and corruption met while reading the premise records', async () => {
    const failures = [
      new Error('untyped host failure'),
      new TypeError("Cannot read properties of undefined (reading 'root')"),
      new PatchError('PatchBuilder already committed', { code: 'E_PATCH_ALREADY_COMMITTED' }),
      new PersistenceError('object missing', PersistenceError.E_MISSING_OBJECT),
      new ConeRecordError('Stored cone record does not match its trie path', { code: 'E_CONE_RECORD_CORRUPT' }),
    ];
    for (const failure of failures) {
      await expect(lowering({ patch: failingPremiseRead(failure) }).lower(request)).rejects.toBe(failure);
    }
  });

  it('keeps the cause and repair of an expected refusal met while reading the premise records', async () => {
    const refusal = new WarpError('attached data', 'E_PATCH_DELETE_WITH_DATA');
    const lowered = await lowering({ patch: failingPremiseRead(refusal) }).lower(request);

    expect(causeOf(lowered)).toBe(operationalWriteFailure(refusal)?.reason.code);
  });

  it('rejects a corrupt patch history met while reading the premise records, not as a missing basis', async () => {
    const failures = [
      new MessageCodecError('stored trailer is invalid'),
      new CrdtError('stored dot is malformed'),
      new SyncError('patch history is broken', { code: 'E_SYNC_PATCH_HISTORY' }),
      new PatchError('stored patch is malformed', { code: 'E_PATCH_MALFORMED' }),
      new PatchError('stored patch schema is unknown', { code: 'E_PATCH_SCHEMA' }),
    ];
    for (const failure of failures) {
      const rejected = await lowering({ patch: failingPremiseRead(failure) }).lower(request).then(() => null, (error: Error) => error);
      expect(rejected).toMatchObject({ code: 'E_WRITE_HISTORY_CORRUPT', cause: failure });
    }
  });

  it('keeps the missing-basis refusal for a writer with no history to observe', async () => {
    const lowered = await lowering({ patch: builder({ journaled: false }) }).lower(removal);

    expect(causeOf(lowered)).toBe(operationalWriteFailure(new PatchError('no state', { code: 'E_PATCH_NO_STATE' }))?.reason.code);
  });

  it('keeps the cause of an expected refusal met while lowering the intents', async () => {
    const refusal = new WarpError('attached data', 'E_PATCH_DELETE_WITH_DATA');
    const patch = builder();
    vi.spyOn(patch, 'prepareConeWriteBasis').mockResolvedValue();
    vi.spyOn(patch, 'addNode').mockImplementation(() => { throw refusal; });

    expect(causeOf(await lowering({ patch }).lower(request))).toBe(operationalWriteFailure(refusal)?.reason.code);
  });

  it('does not hide a lowering failure that is not an expected write refusal', async () => {
    for (const failure of [new Error('boom'), new WarpError('odd', 'E_ODD')]) {
      const patch = builder();
      vi.spyOn(patch, 'prepareConeWriteBasis').mockResolvedValue();
      vi.spyOn(patch, 'addNode').mockImplementation(() => { throw failure; });
      await expect(lowering({ patch }).lower(request)).rejects.toBe(failure);
    }
  });
});

/** A basis whose frontier holds `count` writer chains, `w0` to `w<count - 1>`, each with a head of its own. */
function basisOf(count: number): ConeBasis {
  const position = (index: number): ConeWriterPosition => new ConeWriterPosition(index.toString(16).padStart(40, '0'), 1);
  return new ConeBasis(ConeRoot.empty(), new ConeFrontier(new Map(Array.from({ length: count }, (_, index) => [`w${index}`, position(index)]))));
}

function repairsOf(lowered: object): readonly string[] {
  return lowered instanceof UnpublishedWriteReceipt ? lowered.repairHints.map((hint) => hint.code) : [];
}

/** The premise the cone would publish, with its stored basis replaced by `basis`. */
function onto(basis: ConeBasis): Premise {
  return async (published) => {
    const premise = await published();
    if (!(premise instanceof ConeWritePremiseRecord)) {
      return premise;
    }
    return new ConeWritePremiseRecord({ from: premise.from, stored: new StoredConeBasis(basis, premise.stored.revision), reader: premise.reader });
  };
}

describe('ConeWriteLowering at the writer limit (#1075)', () => {
  it('holds 4,096 writers, so one write retains every head', () => {
    expect(WARP_SUPPORT_LIMITS.writers).toBe(4096);
  });

  it('admits the 4,096th writer and keeps every writer already in a full frontier writing', async () => {
    await expect(lowering({ premise: onto(basisOf(4095)) }).lower(request)).resolves.toBeInstanceOf(LoweredConeWrite);
    const full = basisOf(4095);
    const withAlice = new ConeBasis(full.root, full.frontier.advanced('alice', new ConeWriterPosition('e'.repeat(40), 1)));
    expect(withAlice.writerHeads().size).toBe(4096);
    await expect(lowering({ premise: onto(withAlice) }).lower(request)).resolves.toBeInstanceOf(LoweredConeWrite);
  });

  it('refuses the 4,097th writer before anything is reserved, with the repair', async () => {
    const lowered = await lowering({ premise: onto(basisOf(4096)) }).lower(request);

    expect(causeOf(lowered)).toBe('writer-limit-reached');
    expect(repairsOf(lowered)).toEqual(['reuse_writer_id']);
  });

  it('does not tell a new writer to reuse a writer ID on a frontier past the limit, where no ID can write', async () => {
    const lowered = await lowering({ premise: onto(basisOf(4097)) }).lower(request);

    expect(causeOf(lowered)).toBe('retention-refused-writer-limit');
    expect(repairsOf(lowered)).toEqual(['compact_writer_frontier']);
    expect(lowered instanceof UnpublishedWriteReceipt ? lowered.repairHints[0]?.message : '').toContain('cannot do that yet: issue #1044');
  });

  it('refuses a limit that is not a count', () => {
    expect(() => new WriterFrontierLimit(-1)).toThrow('count');
    expect(() => new WriterFrontierLimit(0.5)).toThrow('count');
  });
});
