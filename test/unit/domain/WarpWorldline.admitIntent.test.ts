import { describe, expect, it } from 'vitest';

import type { IntentAdmissionReceipt } from '../../../src/domain/admission/IntentAdmissionReceipt.ts';
import WarpWorldline from '../../../src/domain/WarpWorldline.ts';
import ProjectionHandle from '../../../src/domain/services/ProjectionHandle.ts';
import type { WarpIntentDescriptor } from '../../../src/domain/types/WarpIntentDescriptor.ts';
import {
  testDerivedIntentAdmissionReceipt,
  testObstructedIntentAdmissionReceipt,
} from '../../helpers/intentAdmission.ts';

function createHandle(
  admitIntentMock?: (descriptor: WarpIntentDescriptor) => Promise<IntentAdmissionReceipt>,
): WarpWorldline {
  return new WarpWorldline({
    worldlineName: 'events',
    writerId: 'agent-1',
    commitPatch: async () => 'patch-sha',
    createWorldline: () => new ProjectionHandle({
      graph: {
        observer: async () => {
          throw new Error('unused observer path');
        },
      },
    }),
    admitIntent: admitIntentMock
      ?? (async (descriptor) => testDerivedIntentAdmissionReceipt(descriptor.intentId, 'intent-sha')),
  });
}

describe('WarpWorldline admitIntent', () => {
  it('admits valid unmaterialized intents directly without JoinReducer materialization', async () => {
    const handle = createHandle();

    const outcome = await (handle as any).admitIntent({
      intentId: 'intent:xyph:quest:claim:001',
      nutritionLabel: {
        bundleHash: 'sha256:8f9a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a',
        coreHash: 'sha256:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1b',
        profile: 'gitwarp.ref_crdt@1',
        budget: '1000',
      },
      precommitGuards: [
        { op: 'nodeStatus', nodeId: 'quest:abc', expected: 'READY', failureTag: 'QuestNotReady' },
      ],
      suffixTransform: {
        op: 'xyph.quest.claim',
        payload: { agentId: 'agent:alpha' },
      },
    });

    expect(outcome.outcome.kind).toBe('derived');
    expect(outcome).toMatchObject({ publicationRef: 'intent-sha' });
    expect(outcome.intentId).toBe('intent:xyph:quest:claim:001');
  });

  it('fails closed when a precommit guard is obstructed', async () => {
    const handle = createHandle(async (descriptor) =>
      testObstructedIntentAdmissionReceipt(
        descriptor.intentId,
        'git-warp.quest-not-ready',
      ));

    const outcome = await (handle as any).admitIntent({
      intentId: 'intent:xyph:quest:claim:002',
      nutritionLabel: {
        bundleHash: 'sha256:8f9a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a',
        coreHash: 'sha256:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1b',
        profile: 'gitwarp.ref_crdt@1',
        budget: '1000',
      },
      precommitGuards: [
        { op: 'nodeStatus', nodeId: 'quest:abc', expected: 'READY', failureTag: 'QuestNotReady' },
      ],
      suffixTransform: {
        op: 'xyph.quest.claim',
        payload: { agentId: 'agent:alpha' },
      },
    });

    expect(outcome.outcome.kind).toBe('obstruction');
    expect(outcome.outcome.witness).toMatchObject({
      reason: { code: 'git-warp.quest-not-ready' },
    });
    expect(outcome.intentId).toBe('intent:xyph:quest:claim:002');
  });
});
