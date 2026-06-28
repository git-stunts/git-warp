import { describe, expect, it } from 'vitest';

import WarpWorldline from '../../../src/domain/WarpWorldline.ts';
import ProjectionHandle from '../../../src/domain/services/ProjectionHandle.ts';
import type { WarpIntentDescriptor, WarpIntentOutcome } from '../../../src/domain/types/WarpIntentDescriptor.ts';

function createHandle(admitIntentMock?: (descriptor: WarpIntentDescriptor) => Promise<WarpIntentOutcome>): WarpWorldline {
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
    admitIntent: admitIntentMock ?? (async (desc) => ({ admitted: true, sha: 'intent-sha', intentId: desc.intentId })),
  } as any);
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

    expect(outcome.admitted).toBe(true);
    expect((outcome as any).sha).toBe('intent-sha');
    expect(outcome.intentId).toBe('intent:xyph:quest:claim:001');
  });

  it('fails closed when a precommit guard is obstructed', async () => {
    const handle = createHandle(async (desc) => ({
      admitted: false,
      obstruction: { tag: 'QuestNotReady', nodeId: 'quest:abc', actual: 'SEALED' },
      intentId: desc.intentId,
    }));

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

    expect(outcome.admitted).toBe(false);
    expect((outcome as any).obstruction).toEqual({ tag: 'QuestNotReady', nodeId: 'quest:abc', actual: 'SEALED' });
    expect(outcome.intentId).toBe('intent:xyph:quest:claim:002');
  });
});
