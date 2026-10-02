import { expect, it, vi } from 'vitest';
import RuntimeActivity from '../../../src/application/RuntimeActivity.ts';
import { startContentObservation, startStrandContentObservation } from '../../../src/application/RuntimeContentObservation.ts';
import WarpWorldline from '../../../src/domain/WarpWorldline.ts';
import WarpWorldlineCoordinate from '../../../src/domain/WarpWorldlineCoordinate.ts';
import WarpError from '../../../src/domain/errors/WarpError.ts';
import ContentOwner from '../../../src/domain/api/ContentOwner.ts';
import { createNodeContentObserver } from '../../../src/domain/api/ContentObserverRuntime.ts';
import { createTimeline } from '../../../src/domain/api/TimelineRuntime.ts';
import { createDraftTimeline } from '../../../src/domain/api/DraftTimelineRuntime.ts';
import { bindContentReadRuntime, captureContentReadBasis } from '../../../src/domain/services/ContentReadRuntime.ts';
import { createPatchBuilderMockPersistence, RecordingPatchJournal } from '../domain/services/PatchBuilderTestHarness.ts';

function fixture() {
  const refs = createPatchBuilderMockPersistence();
  refs.listRefs.mockResolvedValue([]);
  const journal = new RecordingPatchJournal(refs);
  const prepareStrandOptic = vi.fn<WarpWorldline['prepareStrandOptic']>();
  const runtime = new WarpWorldline({
    worldlineName: 'documents', writerId: 'alice', commitPatch: vi.fn(), createWorldline: vi.fn(),
    admitIntent: vi.fn(), createDraft: vi.fn(), loadDraftPatchEntries: vi.fn(async () => []), prepareStrandOptic,
  });
  const context = { createOpaqueId: vi.fn(async () => 'evidence:test'), reserveRecoveryNonce: () => 'nonce', bindReceipt: vi.fn() };
  const timeline = createTimeline(runtime, context);
  const activity = new RuntimeActivity();
  const observer = createNodeContentObserver({ subject: 'n' });
  const owner = new ContentOwner({ kind: 'node', subject: 'n' });
  return { runtime, context, timeline, activity, observer, owner, refs, journal, prepareStrandOptic };
}

it('refuses absent and duplicate content bindings', async () => {
  const fields = fixture();
  await expect(captureContentReadBasis(fields.runtime)).rejects.toMatchObject({ code: 'E_CONTENT_READ_BINDING' });
  bindContentReadRuntime(fields.runtime, fields);
  expect(() => bindContentReadRuntime(fields.runtime, fields)).toThrow();
});

it('reports unavailable storage as an obstruction and releases observation activity', async () => {
  const fields = fixture();
  bindContentReadRuntime(fields.runtime, fields);
  const execution = await startContentObservation(fields);
  expect(await execution.receipt).toMatchObject({ status: 'obstructed', reason: 'E_CONTENT_STORAGE' });
  expect(await execution.readings[Symbol.asyncIterator]().next()).toMatchObject({ done: true });
  const released = vi.fn(async () => undefined);
  await fields.activity.close(released);
  expect(released).toHaveBeenCalledOnce();
});

it('preserves unexpected storage failures and reports typed refusal without claiming absence', async () => {
  const fields = fixture();
  bindContentReadRuntime(fields.runtime, fields);
  const failure = new Error('backend failed');
  fields.refs.listRefs.mockRejectedValueOnce(failure);
  await expect(startContentObservation(fields)).rejects.toBe(failure);
  fields.refs.listRefs.mockRejectedValueOnce(new WarpError('bounded refusal', 'E_CONTENT_READ_LIMIT'));
  expect(await (await startContentObservation(fields)).receipt)
    .toMatchObject({ status: 'obstructed', reason: 'E_CONTENT_READ_LIMIT' });
});

it('refuses a strand without its captured coordinate', async () => {
  const fields = fixture();
  const draft = await createDraftTimeline({ ...fields, timelineName: 'documents', draftName: 'draft' });
  const execution = await startStrandContentObservation({ ...fields, draft });
  expect(await execution.receipt).toMatchObject({ status: 'obstructed', reason: 'E_CONTENT_READ_BASIS' });
});

it('propagates an unexpected strand capture failure', async () => {
  const fields = fixture();
  const forkedAt = new WarpWorldlineCoordinate({ worldlineName: 'documents', checkpointSha: 'a001', frontier: new Map(), createWorldline: vi.fn() });
  const draft = await createDraftTimeline({ ...fields, forkedAt, timelineName: 'documents', draftName: 'draft' });
  const failure = new Error('capture failed');
  fields.prepareStrandOptic.mockRejectedValue(failure);
  await expect(startStrandContentObservation({ ...fields, draft })).rejects.toBe(failure);
});
