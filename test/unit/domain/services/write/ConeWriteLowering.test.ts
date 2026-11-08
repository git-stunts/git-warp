import { describe, expect, it, vi } from 'vitest';
import { intent } from '../../../../../advanced.ts';
import IntentSequence from '../../../../../src/domain/api/IntentSequence.ts';
import UnpublishedWriteReceipt from '../../../../../src/domain/api/UnpublishedWriteReceipt.ts';
import WarpWriteGrant from '../../../../../src/domain/api/WarpWriteGrant.ts';
import { operationalWriteFailure } from '../../../../../src/domain/api/WriteRuntime.ts';
import DotMint from '../../../../../src/domain/crdt/DotMint.ts';
import VersionVector from '../../../../../src/domain/crdt/VersionVector.ts';
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
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import NodeCryptoAdapter from '../../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';
import MemoryConeFeed from '../../../../helpers/MemoryConeFeed.ts';
import { createPatchBuilderMockPersistence, RecordingPatchJournal } from '../PatchBuilderTestHarness.ts';

const GRAPH = 'g';
const GRANT = new WarpWriteGrant({ authority: 'a', budget: { records: 9, bytes: 9999, work: 9 } });
const request = { writer: 'alice', grant: GRANT, sequence: IntentSequence.from(intent.node.add({ subject: 'x' })) };
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

/** A real patch builder for the writer. */
function builder(): PatchBuilder {
  const refs = createPatchBuilderMockPersistence();
  return new PatchBuilder({
    persistence: refs, patchJournal: new RecordingPatchJournal(refs), graphName: GRAPH, writerId: 'alice', lamport: 1,
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

  it('rejects a defect or an untyped failure while fixing the basis or opening the patch', async () => {
    const defect = new TypeError('a defect');
    await expect(lowering({ premise: async () => await Promise.reject(defect) }).lower(request)).rejects.toBe(defect);
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

  it('does not hide a lowering failure that is not an expected write refusal', async () => {
    for (const failure of [new Error('boom'), new WarpError('odd', 'E_ODD')]) {
      const patch = builder();
      vi.spyOn(patch, 'prepareConeWriteBasis').mockResolvedValue();
      vi.spyOn(patch, 'addNode').mockImplementation(() => { throw failure; });
      await expect(lowering({ patch }).lower(request)).rejects.toBe(failure);
    }
  });
});
