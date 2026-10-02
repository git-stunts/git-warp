import { expect, it, vi } from 'vitest';
import ContentReadProjection, { MAX_CONTENT_READ_MEMBERS, MAX_CONTENT_READ_TEXT_UNITS } from '../../../../src/domain/services/ContentReadProjection.ts';
import ContentReadBasis from '../../../../src/domain/services/ContentReadBasis.ts';
import ContentOwner from '../../../../src/domain/api/ContentOwner.ts';
import ContentAttachmentProjection from '../../../../src/domain/services/ContentAttachmentProjection.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import { applyPatchOp } from '../../../../src/domain/services/JoinReducer.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import PatchEntry from '../../../../src/domain/artifacts/PatchEntry.ts';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import { hydratePatchAtDecodeBoundary } from '../../../../src/infrastructure/adapters/PatchHydrationAdapter.ts';
import { createPatchBuilderMockPersistence, RecordingPatchJournal } from './PatchBuilderTestHarness.ts';

const EDGE = { from: 'target', to: 'peer', label: 'links' };
const NODE = new ContentOwner({ kind: 'node', subject: 'target' });
const EDGE_OWNER = new ContentOwner({ kind: 'edge', ...EDGE });
const ORIGINAL = new PatchEntry({ sha: 'a001', patch: hydratePatchAtDecodeBoundary({
  schema: 3, writer: 'alice', lamport: 1, context: {}, ops: [
    { type: 'NodeAdd', node: 'target', dot: ['alice', 1] },
    { type: 'NodeAdd', node: 'peer', dot: ['alice', 2] },
    { type: 'EdgeAdd', ...EDGE, dot: ['alice', 3] },
    { type: 'NodePropSet', node: 'target', key: '_content', value: 'asset:node' },
    { type: 'EdgePropSet', ...EDGE, key: '_content', value: 'asset:edge' },
  ],
}) });

async function projected(entries: readonly PatchEntry[], owner: ContentOwner) {
  const journal = new RecordingPatchJournal(createPatchBuilderMockPersistence());
  vi.spyOn(journal, 'scanPatchHistory').mockImplementation(() => WarpStream.from(entries));
  return await new ContentReadProjection(owner).read(journal, new ContentReadBasis(new Map([['alice', entries[0]!.sha]])));
}

function full(entries: readonly PatchEntry[], owner: ContentOwner) {
  const state = WarpState.empty();
  for (const entry of [...entries].reverse()) {
    entry.patch.ops.forEach((op, index) => applyPatchOp(state, op, new EventId(entry.patch.lamport, 'alice', entry.sha, index)));
  }
  return owner.descriptor.kind === 'node'
    ? ContentAttachmentProjection.forNode(state, owner.descriptor.subject)
    : ContentAttachmentProjection.forEdge(state, owner.descriptor);
}

const REMOVALS = [
  { name: 'node', owner: NODE, op: { type: 'NodeRemove', node: 'other', observedDots: ['alice:1'] } },
  { name: 'edge', owner: EDGE_OWNER, op: { type: 'EdgeRemove', from: 'other', to: 'elsewhere', label: 'different', observedDots: ['alice:3'] } },
  { name: 'edge endpoint', owner: EDGE_OWNER, op: { type: 'NodeRemove', node: 'other', observedDots: ['alice:2'] } },
];

it.each(REMOVALS)('matches decoded dot-based $name removal in newest-first history', async ({ owner, op }) => {
  const removal = new PatchEntry({ sha: 'a002', patch: hydratePatchAtDecodeBoundary({
    schema: 3, writer: 'alice', lamport: 2, context: {}, ops: [op],
  }) });
  const entries = [removal, ORIGINAL];
  expect(full(entries, owner)).toBeNull();
  expect(await projected(entries, owner)).toEqual(full(entries, owner));
});

it.each(REMOVALS)('keeps declared-owner lifecycle separate after cross-owner $name removal and re-add', async ({ owner, op }) => {
  const removal = new PatchEntry({ sha: 'a002', patch: hydratePatchAtDecodeBoundary({
    schema: 3, writer: 'alice', lamport: 2, context: {}, ops: [op],
  }) });
  const restored = new PatchEntry({ sha: 'a003', patch: hydratePatchAtDecodeBoundary({
    schema: 3, writer: 'alice', lamport: 3, context: {}, ops: [
      { type: 'NodeAdd', node: 'target', dot: ['alice', 4] },
      { type: 'NodeAdd', node: 'peer', dot: ['alice', 5] },
      { type: 'EdgeAdd', ...EDGE, dot: ['alice', 6] },
    ],
  }) });
  const entries = [restored, removal, ORIGINAL];
  expect(full(entries, owner)?.payload.handle.toString() ?? null)
    .toBe(owner.descriptor.kind === 'node' ? 'asset:node' : null);
  expect(await projected(entries, owner)).toEqual(full(entries, owner));
});

it.each(['node', 'edge'])('charges unrelated %s removal dots before retaining them', async (kind) => {
  for (const observedDots of [
    Array.from({ length: MAX_CONTENT_READ_MEMBERS + 1 }, () => 'alice:1'),
    ['x'.repeat(MAX_CONTENT_READ_TEXT_UNITS + 1)],
  ]) {
    const op = kind === 'node'
      ? { type: 'NodeRemove', node: 'other', observedDots }
      : { type: 'EdgeRemove', from: 'other', to: 'elsewhere', label: 'different', observedDots };
    const removal = new PatchEntry({ sha: 'a002', patch: hydratePatchAtDecodeBoundary({
      schema: 3, writer: 'alice', lamport: 2, context: {}, ops: [op],
    }) });
    await expect(projected([removal, ORIGINAL], EDGE_OWNER)).rejects.toMatchObject({ code: 'E_CONTENT_READ_LIMIT' });
  }
});
