import { expect, it, vi } from 'vitest';
import RuntimeActivity from '../../../src/application/RuntimeActivity.ts';
import { startContentObservation, startStrandContentObservation } from '../../../src/application/RuntimeContentObservation.ts';
import WarpWorldline from '../../../src/domain/WarpWorldline.ts';
import ContentOwner from '../../../src/domain/api/ContentOwner.ts';
import { createNodeContentObserver } from '../../../src/domain/api/ContentObserverRuntime.ts';
import { createTimeline } from '../../../src/domain/api/TimelineRuntime.ts';
import { createDraftTimeline } from '../../../src/domain/api/DraftTimelineRuntime.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import StrandConeBasis from '../../../src/domain/services/strand/StrandConeBasis.ts';
import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import { coneLane } from '../../helpers/coneLane.ts';

const STRAND_ID = 'a'.repeat(64);

function fixture(options: { readonly withCone?: boolean } = {}) {
  const lane = coneLane('documents', [['alice', [new NodeAdd('n', new Dot('alice', 1))]]]);
  const strand = coneLane('documents');
  const runtime = new WarpWorldline({
    worldlineName: 'documents', writerId: 'alice', commitPatch: vi.fn(), createWorldline: vi.fn(),
    admitIntent: vi.fn(), createDraft: vi.fn(async () => undefined), loadDraftPatchEntries: vi.fn(async () => []),
    openDraft: vi.fn(async () => new StrandConeBasis({ strandId: STRAND_ID, base: lane.cone, strand: strand.cone })),
    ...(options.withCone === false ? {} : { cone: lane.cone }),
  });
  const context = { createOpaqueId: vi.fn(async () => 'evidence:test'), reserveRecoveryNonce: () => 'nonce', bindReceipt: vi.fn() };
  const timeline = createTimeline(runtime, context);
  const activity = new RuntimeActivity();
  const observer = createNodeContentObserver({ subject: 'n' });
  const owner = new ContentOwner({ kind: 'node', subject: 'n' });
  return { runtime, context, timeline, activity, observer, owner, lane, strand };
}

it('reports unavailable storage as an obstruction and releases observation activity', async () => {
  const fields = fixture();
  const execution = await startContentObservation(fields);
  expect(await execution.receipt).toMatchObject({ status: 'obstructed', reason: 'E_CONTENT_STORAGE' });
  expect(await execution.readings[Symbol.asyncIterator]().next()).toMatchObject({ done: true });
  const released = vi.fn(async () => undefined);
  await fields.activity.close(released);
  expect(released).toHaveBeenCalledOnce();
});

it('refuses a lane whose storage keeps no cone records', async () => {
  const fields = fixture({ withCone: false });
  expect(await (await startContentObservation(fields)).receipt)
    .toMatchObject({ status: 'obstructed', reason: 'E_WARP_WORLDLINE_CONE_UNAVAILABLE' });
});

it('turns an obstructed cone basis into its receipt and preserves unexpected failures', async () => {
  const fields = fixture();
  fields.lane.feed.diverged.add('alice');
  expect(await (await startContentObservation(fields)).receipt)
    .toMatchObject({ status: 'obstructed', reason: 'cone_writer_diverged', repairHints: [{ code: 'rebuild_cone_basis' }] });
  const failure = new Error('records unavailable');
  fields.lane.feed.diverged.clear();
  vi.spyOn(fields.lane.store, 'readRecords').mockRejectedValueOnce(failure);
  await expect(startContentObservation(fields)).rejects.toBe(failure);
});

it('reads a strand owner from the strand cone basis', async () => {
  const fields = fixture();
  const draft = await createDraftTimeline({ ...fields, timelineName: 'documents', draftName: 'draft' });
  const reads = vi.spyOn(fields.strand.store, 'readRecords');
  const laneReads = vi.spyOn(fields.lane.store, 'readRecords');
  const execution = await startStrandContentObservation({ ...fields, draft });
  expect(await execution.receipt).toMatchObject({ lane: 'draft', status: 'obstructed', reason: 'E_CONTENT_STORAGE' });
  expect(reads).toHaveBeenCalled();
  expect(laneReads).not.toHaveBeenCalled();
  const failure = new Error('strand records unavailable');
  fields.strand.feed.append('@w.alice@s.' + STRAND_ID, [new NodeAdd('n', new Dot('@w.alice@s.' + STRAND_ID, 1))]);
  reads.mockRejectedValueOnce(failure);
  await expect(startStrandContentObservation({ ...fields, draft })).rejects.toBe(failure);
});
