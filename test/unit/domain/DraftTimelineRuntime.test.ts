import { describe, expect, it } from 'vitest';

import WarpWorldline, { type WarpWorldlinePatchBuild } from '../../../src/domain/WarpWorldline.ts';
import type {
  ApiRuntimeContext,
  ReceiptProvenance,
} from '../../../src/domain/api/ApiRuntimeContext.ts';
import {
  createDraftTimeline,
  joinDraftTimeline,
  previewDraftJoin,
} from '../../../src/domain/api/DraftTimelineRuntime.ts';
import { intent } from '../../../src/domain/api/IntentBuilders.ts';

type RuntimeOptions = {
  readonly commitPatch?: (build: WarpWorldlinePatchBuild) => Promise<string>;
  readonly previewDraftJoin?: (name: string) => Promise<readonly string[]>;
};

function createRuntimeContext(): {
  readonly context: ApiRuntimeContext;
  readonly provenance: ReceiptProvenance[];
} {
  const provenance: ReceiptProvenance[] = [];
  return {
    context: {
      createOpaqueId: async (namespace, payload) => `${namespace}:${payload.length}`,
      bindReceipt: (_receipt, record) => provenance.push(record),
    },
    provenance,
  };
}

function createRuntime(options: RuntimeOptions = {}): WarpWorldline {
  return new WarpWorldline({
    worldlineName: 'events',
    writerId: 'agent-1',
    commitPatch: options.commitPatch ?? (async () => 'commit-1'),
    createDraft: async () => undefined,
    createWorldline: () => {
      throw new Error('ProjectionHandle is not used by DraftTimelineRuntime tests');
    },
    patchDraft: async (name) => `${name}-draft-patch`,
    previewDraftJoin: options.previewDraftJoin ?? (async (name) => [`${name}-preview-patch`]),
    admitIntent: async (descriptor) => ({
      admitted: true,
      sha: 'intent-sha',
      intentId: descriptor.intentId,
    }),
  });
}

describe('DraftTimelineRuntime', () => {
  it('rejects concurrent joins without double-committing draft intents', async () => {
    let commitAttempts = 0;
    let releaseFirstCommit = (): void => undefined;
    let markFirstCommitStarted = (): void => undefined;
    const firstCommitStarted = new Promise<void>((resolve) => {
      markFirstCommitStarted = resolve;
    });
    const firstCommitRelease = new Promise<void>((resolve) => {
      releaseFirstCommit = resolve;
    });
    const runtime = createRuntime({
      commitPatch: async () => {
        commitAttempts += 1;
        if (commitAttempts === 1) {
          markFirstCommitStarted();
          await firstCommitRelease;
        }
        return `join-patch-${commitAttempts}`;
      },
    });
    const { context } = createRuntimeContext();
    const draft = await createDraftTimeline({
      runtime,
      context,
      timelineName: 'events',
      draftName: 'try-admin-role',
    });

    await draft.write(intent.node.add({ subject: 'user:alice' }));
    const firstJoin = joinDraftTimeline(runtime, draft, { policy: 'deterministic' });
    await firstCommitStarted;
    const secondJoin = await joinDraftTimeline(runtime, draft, { policy: 'deterministic' });
    releaseFirstCommit();
    const firstResult = await firstJoin;

    expect(firstResult.receipt.outcome).toBe('accepted');
    expect(secondJoin.receipt.outcome).toBe('rejected');
    expect(secondJoin.receipt.reason).toBe('Draft join is already in progress');
    expect(commitAttempts).toBe(1);
  });

  it('keeps preview object identities behind opaque evidence handles', async () => {
    const runtime = createRuntime({
      previewDraftJoin: async () => ['materialized-preview-patch'],
    });
    const { context, provenance } = createRuntimeContext();
    const draft = await createDraftTimeline({
      runtime,
      context,
      timelineName: 'events',
      draftName: 'try-admin-role',
    });

    await draft.write(intent.node.add({ subject: 'user:alice' }));
    const preview = await previewDraftJoin(runtime, draft, { policy: 'deterministic' });

    expect(preview.receipt.outcome).toBe('accepted');
    expect(preview.receipt.evidence?.support).toHaveLength(1);
    expect('patchShas' in preview.receipt).toBe(false);
    expect(provenance.at(-1)).toEqual({
      operation: 'join',
      patchShas: ['materialized-preview-patch'],
    });
  });

  it('does not replay committed draft intents after a partial join failure', async () => {
    let commitAttempts = 0;
    const runtime = createRuntime({
      commitPatch: async () => {
        commitAttempts += 1;
        if (commitAttempts === 2) {
          throw new Error('deterministic commit failure');
        }
        return `join-patch-${commitAttempts}`;
      },
    });
    const { context, provenance } = createRuntimeContext();
    const draft = await createDraftTimeline({
      runtime,
      context,
      timelineName: 'events',
      draftName: 'try-admin-role',
    });

    await draft.write(intent.node.add({ subject: 'user:alice' }));
    await draft.write(
      intent.property.set({
        subject: 'user:alice',
        key: 'role',
        value: 'admin',
      })
    );

    const failedJoin = await joinDraftTimeline(runtime, draft, { policy: 'deterministic' });
    const retryJoin = await joinDraftTimeline(runtime, draft, { policy: 'deterministic' });

    expect(failedJoin.receipt.outcome).toBe('rejected');
    expect(failedJoin.receipt.evidence?.support).toHaveLength(1);
    expect(failedJoin.receipt.reason).toBe('Draft join failed while committing intents');
    expect(retryJoin.receipt.outcome).toBe('rejected');
    expect(retryJoin.receipt.evidence?.support).toHaveLength(1);
    expect(retryJoin.receipt.reason).toBe('Draft join already has a failed commit attempt');
    expect(commitAttempts).toBe(2);
    expect(provenance.slice(-2)).toEqual([
      { operation: 'join', patchShas: ['join-patch-1'] },
      { operation: 'join', patchShas: ['join-patch-1'] },
    ]);
  });
});
