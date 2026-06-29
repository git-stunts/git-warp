import { describe, it, expect } from 'vitest';
import type { WarpIntentDescriptor, WarpIntentOutcome } from '../../../src/domain/types/WarpIntentDescriptor.ts';
import type WarpWorldline from '../../../src/domain/WarpWorldline.ts';
import WasmVerifiedAdmissionService from '../../../src/domain/services/admission/WasmVerifiedAdmissionService.ts';

function createMockWarpWorldline(outcome: WarpIntentOutcome): WarpWorldline {
  return { admitIntent: async () => outcome } as unknown as WarpWorldline;
}

describe('WasmVerifiedAdmissionPort & WasmVerifiedAdmissionService', () => {
  const validIntentDescriptor: WarpIntentDescriptor = {
    intentId: 'intent:xyph:quest:claim:001',
    nutritionLabel: {
      bundleHash: 'sha256:bundle123',
      coreHash: 'sha256:core123',
      profile: 'continuum.lane.lawful-autonomous/v1',
      budget: '50',
    },
    precommitGuards: [
      {
        op: 'nodeStatus',
        nodeId: 'quest:abc',
        expected: 'READY',
        failureTag: 'QuestNotReady',
      },
    ],
    suffixTransform: {
      op: 'claimQuest',
      payload: { questId: 'quest:abc' },
    },
  };

  const validReport = {
    reportDigest: 'sha256:validReportDigest',
    wasmDigest: 'sha256:7f8a9b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a',
    verified: true,
  };

  const invalidReport = {
    reportDigest: 'sha256:invalidReportDigest',
    wasmDigest: 'sha256:unknownWasmDigest',
    verified: false,
  };

  it('should verify report digest and admit intent through worldline', async () => {
    const mockWorldline = createMockWarpWorldline({
      admitted: true,
      sha: 'blob:intent:sha123',
      intentId: validIntentDescriptor.intentId,
    });

    const service = new WasmVerifiedAdmissionService(mockWorldline);
    const outcome = await service.admitWasmIntent(validIntentDescriptor, validReport);

    expect(outcome.admitted).toBe(true);
    if (outcome.admitted) {
      expect(outcome.sha).toBe('blob:intent:sha123');
      expect(outcome.intentId).toBe('intent:xyph:quest:claim:001');
    }
  });

  it('should reject admission if verifier report is invalid or untrusted', async () => {
    const mockWorldline = createMockWarpWorldline({
      admitted: true,
      sha: 'blob:intent:sha123',
      intentId: validIntentDescriptor.intentId,
    });

    const service = new WasmVerifiedAdmissionService(mockWorldline);
    const outcome = await service.admitWasmIntent(validIntentDescriptor, invalidReport);

    expect(outcome.admitted).toBe(false);
    if (!outcome.admitted) {
      expect(outcome.obstruction.tag).toBe('UntrustedWasmVerifierReport');
      expect(outcome.obstruction.actual).toBe('sha256:unknownWasmDigest');
    }
  });

  it('should reflect precommit guard obstructions encountered during worldline admission', async () => {
    const mockWorldline = createMockWarpWorldline({
      admitted: false,
      obstruction: {
        tag: 'QuestNotReady',
        nodeId: 'quest:abc',
        actual: 'BACKLOG',
      },
      intentId: validIntentDescriptor.intentId,
    });

    const service = new WasmVerifiedAdmissionService(mockWorldline);
    const outcome = await service.admitWasmIntent(validIntentDescriptor, validReport);

    expect(outcome.admitted).toBe(false);
    if (!outcome.admitted) {
      expect(outcome.obstruction.tag).toBe('QuestNotReady');
      expect(outcome.obstruction.actual).toBe('BACKLOG');
    }
  });
});
