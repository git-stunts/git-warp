import { expect, it, vi } from 'vitest';
import Patch from '../../../../src/domain/types/Patch.ts';
import PatchEntry from '../../../../src/domain/artifacts/PatchEntry.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import ObservedWriterHead from '../../../../src/domain/types/ObservedWriterHead.ts';
import ObservedWriteFrontier from '../../../../src/domain/types/ObservedWriteFrontier.ts';
import { PatchBuilder } from '../../../../src/domain/services/PatchBuilder.ts';
import BoundedNodeRemovalBasis, { MAX_REMOVAL_BASIS_WRITERS } from '../../../../src/domain/services/BoundedNodeRemovalBasis.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import ObservationJournal from '../../../helpers/ObservationJournal.ts';
import { createPatchBuilderMockPersistence, RecordingPatchJournal } from './PatchBuilderTestHarness.ts';

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
    lamport: 4, versionVector: VersionVector.empty(), expectedParentSha: PARENT,
    getCurrentState: () => null, ...overrides,
  });
  return { persistence, journal, builder };
}

it('restores persisted counters for an explicit strand without observing unrelated live refs', async () => {
  const { persistence, journal, builder } = fixture({ targetRefPath: 'refs/warp/events/strands/work' });
  await builder.prepareWriteBasis([]);
  builder.addNode('next');
  expect(builder.build().ops).toMatchObject([{ dot: { writerId: 'alice', counter: 8 } }]);
  expect(builder.build().observedFrontier).toBeUndefined();
  expect(persistence.listRefs).not.toHaveBeenCalled();
  expect(journal.closed).toBe(1);
});

it('keeps legacy cached membership when its caller supplies no paired frontier', async () => {
  const state = WarpState.empty();
  state.nodeAlive.add('n', new Dot('alice', 1));
  const { persistence, journal, builder } = fixture({ getCurrentState: () => state });
  await builder.prepareWriteBasis(['n']);
  builder.removeNode('n');
  expect(builder.build().ops).toMatchObject([{ observedDots: ['alice:1'] }]);
  expect(VersionVector.from(builder.build().context).get('alice')).toBe(7);
  expect(builder.build().observedFrontier).toBeUndefined();
  expect(persistence.listRefs).not.toHaveBeenCalled();
  expect(journal.closed).toBe(1);
});

it('refuses an unavailable persisted strand predecessor and closes its history', async () => {
  const { persistence } = fixture();
  const journal = new ObservationJournal(new Map());
  const { builder } = fixture({ persistence, patchJournal: journal, targetRefPath: 'refs/warp/events/strands/work' });
  await expect(builder.prepareWriteBasis([])).rejects.toMatchObject({ code: 'E_PATCH_NO_STATE' });
  expect(builder.ops).toHaveLength(0);
  expect(persistence.compareAndSwapRef).not.toHaveBeenCalled();
  expect(journal.closed).toBe(1);
});

it('refuses mutation during membership replay after immutable head capture', async () => {
  const persistence = createPatchBuilderMockPersistence();
  let mutate = (): void => {};
  let scans = 0;
  const journal = new RecordingPatchJournal(persistence);
  vi.spyOn(journal, 'scanPatchHistory').mockImplementation(() => {
    if (++scans === 2) { mutate(); }
    return WarpStream.from([retainedHead()]);
  });
  const builder = new PatchBuilder({
    persistence, patchJournal: journal, graphName: 'events', writerId: 'alice',
    lamport: 4, versionVector: VersionVector.empty(), expectedParentSha: PARENT,
    getCurrentState: () => null,
  });
  mutate = () => { builder.addNode('racing'); };
  await expect(builder.prepareWriteBasis(['n'])).rejects.toMatchObject({ code: 'E_PATCH_NO_STATE' });
  expect(persistence.compareAndSwapRef).not.toHaveBeenCalled();
  expect(scans).toBe(2);
  expect(journal.requests).toHaveLength(0);
});

it('retains the writer cap for both enumerated and supplied removal frontiers', async () => {
  const { persistence, journal } = fixture();
  const fields = { refs: persistence, journal, graphName: 'events', writerId: 'bob',
    expectedParentSha: null, targets: new Set(['n']) };
  persistence.listRefs.mockResolvedValue(Array.from({ length: MAX_REMOVAL_BASIS_WRITERS + 1 }, (_, i) => `refs/warp/events/writers/w${i}`));
  await expect(BoundedNodeRemovalBasis.capture(fields)).rejects.toMatchObject({ code: 'E_PATCH_NO_STATE' });
  const observation = new ObservedWriteFrontier('events', Array.from({ length: MAX_REMOVAL_BASIS_WRITERS + 1 }, (_, i) => new ObservedWriterHead(`w${i}`, PARENT, 3)));
  await expect(BoundedNodeRemovalBasis.capture({ ...fields, observation })).rejects.toMatchObject({ code: 'E_PATCH_NO_STATE' });
  expect(journal.scans).toHaveLength(0);
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
