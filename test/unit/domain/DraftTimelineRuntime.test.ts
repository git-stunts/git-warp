import { describe, expect, it } from 'vitest';

import WarpWorldline, { type WarpWorldlinePatchBuild } from '../../../src/domain/WarpWorldline.ts';
import AssetHandle from '../../../src/domain/storage/AssetHandle.ts';
import BundleHandle from '../../../src/domain/storage/BundleHandle.ts';
import Patch from '../../../src/domain/types/Patch.ts';
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
import type { PatchCommitResult } from '../../../src/domain/types/PatchCommitResult.ts';
import { testRetentionWitness } from '../../helpers/storageRetention.ts';

type RuntimeOptions = {
  readonly commitPatch?: (build: WarpWorldlinePatchBuild) => Promise<string>;
  readonly patchDraft?: (name: string, build: WarpWorldlinePatchBuild) => Promise<string>;
  readonly previewDraftJoin?: (name: string) => Promise<readonly string[]>;
};

type RuntimeContextOptions = {
  readonly createOpaqueId?: ApiRuntimeContext['createOpaqueId'];
};

function createRuntimeContext(options: RuntimeContextOptions = {}): {
  readonly context: ApiRuntimeContext;
  readonly provenance: ReceiptProvenance[];
} {
  const provenance: ReceiptProvenance[] = [];
  let recoverySequence = 0;
  return {
    context: {
      createOpaqueId:
        options.createOpaqueId ?? (async (namespace, payload) => `${namespace}:${payload.length}`),
      reserveRecoveryNonce: () => `test-runtime:${(recoverySequence += 1)}`,
      bindReceipt: (_receipt, record) => provenance.push(record),
    },
    provenance,
  };
}

function createRuntime(options: RuntimeOptions = {}): WarpWorldline {
  const commitPatch = options.commitPatch ?? (async () => 'commit-1');
  const patchDraft = options.patchDraft ?? (async (name) => `${name}-draft-patch`);
  return new WarpWorldline({
    worldlineName: 'events',
    writerId: 'agent-1',
    commitPatch,
    commitPatchWithEvidence: async (build) => testPatchPublication(await commitPatch(build)),
    createDraft: async () => undefined,
    createWorldline: () => {
      throw new Error('ProjectionHandle is not used by DraftTimelineRuntime tests');
    },
    patchDraft,
    patchDraftWithEvidence: async (name, build) =>
      testPatchPublication(await patchDraft(name, build)),
    previewDraftJoin: options.previewDraftJoin ?? (async (name) => [`${name}-preview-patch`]),
    admitIntent: async (descriptor) => ({
      admitted: true,
      sha: 'intent-sha',
      intentId: descriptor.intentId,
      retention: testRetentionWitness('intent-sha'),
    }),
  });
}

function testPatchPublication(sha: string): PatchCommitResult {
  const retention = testRetentionWitness(sha);
  return Object.freeze({
    sha,
    bundleHandle: new BundleHandle(`test-bundle:${sha}`),
    stagedPatch: Object.freeze({
      handle: new AssetHandle(`test-asset:${sha}`),
      size: 0,
      observedAt: retention.observedAt,
      retention: Object.freeze({
        reachability: 'unanchored',
        protection: 'not-established',
      }),
    }),
    retention,
    patch: new Patch({
      writer: 'agent-1',
      lamport: 0,
      context: {},
      ops: [],
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
    const secondJoinPending = joinDraftTimeline(runtime, draft, { policy: 'deterministic' });
    await firstCommitStarted;
    const secondJoin = await secondJoinPending;
    releaseFirstCommit();
    const firstResult = await firstJoin;

    expect(firstResult.receipt.outcome).toBe('accepted');
    expect(secondJoin.receipt.outcome).toBe('rejected');
    expect(secondJoin.receipt.reason).toBe('Draft join is already in progress');
    expect(commitAttempts).toBe(1);
  });

  it('returns an accepted draft-write receipt when canonical evidence hashing fails', async () => {
    let draftCommitted = false;
    let draftCommits = 0;
    const runtime = createRuntime({
      patchDraft: async () => {
        draftCommits += 1;
        draftCommitted = true;
        return 'committed-draft-patch';
      },
    });
    const { context, provenance } = createRuntimeContext({
      createOpaqueId: async (namespace, parts) => {
        if (draftCommitted && parts[0] !== 'recovery') {
          throw new Error('canonical evidence hashing failed after commit');
        }
        return `${namespace}:opaque-${parts.length}`;
      },
    });
    const draft = await createDraftTimeline({
      runtime,
      context,
      timelineName: 'events',
      draftName: 'try-admin-role',
    });

    const receipt = await draft.write(intent.node.add({ subject: 'user:alice' }));

    expect(receipt.outcome).toBe('accepted');
    expect(receipt.evidence?.support).toEqual([]);
    expect(draftCommits).toBe(1);
    expect(provenance.at(-1)).toEqual({
      operation: 'write',
      patchSha: 'committed-draft-patch',
    });
  });

  it('returns an accepted join receipt when canonical evidence hashing fails after commit', async () => {
    let joinCommitted = false;
    const runtime = createRuntime({
      commitPatch: async () => {
        joinCommitted = true;
        return 'committed-join-patch';
      },
    });
    const { context, provenance } = createRuntimeContext({
      createOpaqueId: async (namespace, parts) => {
        if (joinCommitted && parts[0] !== 'recovery') {
          throw new Error('canonical join evidence hashing failed after commit');
        }
        return `${namespace}:opaque-${parts.length}`;
      },
    });
    const draft = await createDraftTimeline({
      runtime,
      context,
      timelineName: 'events',
      draftName: 'try-admin-role',
    });
    await draft.write(intent.node.add({ subject: 'user:alice' }));

    const result = await joinDraftTimeline(runtime, draft, { policy: 'deterministic' });

    expect(result.receipt.outcome).toBe('accepted');
    expect(result.receipt.evidence?.support).toEqual([]);
    expect(provenance.at(-1)).toEqual({
      operation: 'join',
      patchShas: ['committed-join-patch'],
    });
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
