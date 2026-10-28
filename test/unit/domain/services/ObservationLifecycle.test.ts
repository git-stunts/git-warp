import { expect, it } from 'vitest';
import Patch from '../../../../src/domain/types/Patch.ts';
import PatchEntry from '../../../../src/domain/artifacts/PatchEntry.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import DotMint from '../../../../src/domain/crdt/DotMint.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import { PatchBuilder } from '../../../../src/domain/services/PatchBuilder.ts';
import ConeLaneBasis from '../../../../src/domain/services/cone/ConeLaneBasis.ts';
import ConeWriteTargets from '../../../../src/domain/services/cone/ConeWriteTargets.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import ObservationJournal from '../../../helpers/ObservationJournal.ts';
import InMemoryConeRecordStore from '../../../helpers/InMemoryConeRecordStore.ts';
import MemoryConeFeed from '../../../helpers/MemoryConeFeed.ts';
import { createPatchBuilderMockPersistence } from './PatchBuilderTestHarness.ts';

const PARENT = 'a'.repeat(40);
function retainedHead(): PatchEntry {
  return new PatchEntry({ sha: PARENT, patch: new Patch({
    writer: 'alice', lamport: 3, context: { alice: 7 },
    ops: [new NodeAdd('n', new Dot('alice', 1))],
  }) });
}
function fixture(overrides: Partial<ConstructorParameters<typeof PatchBuilder>[0]> = {}) {
  const persistence = createPatchBuilderMockPersistence();
  const journal = new ObservationJournal(new Map([[PARENT, retainedHead()]]));
  const builder = new PatchBuilder({
    persistence, patchJournal: journal, graphName: 'events', writerId: 'alice',
    lamport: 4, versionVector: VersionVector.empty(), dotMint: DotMint.after('alice', 0), expectedParentSha: PARENT,
    getCurrentState: () => null, ...overrides,
  });
  return { persistence, journal, builder };
}

/** A cone basis no write below advances: blind targets never read records. */
function idleCone(): ConeLaneBasis {
  return ConeLaneBasis.ofLane({ store: new InMemoryConeRecordStore(), feed: new MemoryConeFeed('events'), lane: 'events' });
}
const BLIND = new ConeWriteTargets({ nodes: [], edges: [] });

it('restores persisted counters for an explicit strand without observing unrelated live refs', async () => {
  const { persistence, journal, builder } = fixture({ targetRefPath: 'refs/warp/events/strands/work' });
  await builder.prepareConeWriteBasis(BLIND, idleCone());
  builder.addNode('next');
  expect(builder.build().ops).toMatchObject([{ dot: { writerId: 'alice', counter: 8 } }]);
  expect(builder.build().observedFrontier).toBeUndefined();
  expect(persistence.listRefs).not.toHaveBeenCalled();
  expect(journal.closed).toBe(1);
});

it('removes from cached membership without preparing a basis', () => {
  const state = WarpState.empty();
  state.nodeAlive.add('n', new Dot('alice', 1));
  const { persistence, builder } = fixture({ getCurrentState: () => state });
  builder.removeNode('n');
  expect(builder.build().ops).toMatchObject([{ observedDots: ['alice:1'] }]);
  expect(builder.build().observedFrontier).toBeUndefined();
  expect(persistence.listRefs).not.toHaveBeenCalled();
});

it('refuses an unavailable persisted strand predecessor and closes its history', async () => {
  const { persistence } = fixture();
  const journal = new ObservationJournal(new Map());
  const { builder } = fixture({ persistence, patchJournal: journal, targetRefPath: 'refs/warp/events/strands/work' });
  await expect(builder.prepareConeWriteBasis(BLIND, idleCone())).rejects.toMatchObject({ code: 'E_PATCH_NO_STATE' });
  expect(builder.ops).toHaveLength(0);
  expect(persistence.compareAndSwapRef).not.toHaveBeenCalled();
  expect(journal.closed).toBe(1);
});

it('isolates the legacy Map context from subsequent caller changes', () => {
  const context = new Map([['alice', 7]]);
  const patch = new Patch({ writer: 'alice', lamport: 3, context, ops: [] });
  context.set('alice', 99);
  expect(VersionVector.from(patch.context).get('alice')).toBe(7);
  expect(Object.isFrozen(patch.context)).toBe(true);
});

it('rejects malformed provenance metadata from JavaScript callers', () => {
  const fields = { writer: 'alice', lamport: 3, context: {}, ops: [] };
  expect(() => new Patch({ ...fields, reads: [''] })).toThrow(expect.objectContaining({ code: 'E_PATCH_METADATA_ENTRY' }));
  // @ts-expect-error Deliberate JavaScript boundary input, not a trusted string array.
  expect(() => new Patch({ ...fields, writes: {} })).toThrow(expect.objectContaining({ code: 'E_PATCH_METADATA_TYPE' }));
});
