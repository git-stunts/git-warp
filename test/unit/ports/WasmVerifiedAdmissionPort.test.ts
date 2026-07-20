import { describe, it, expect } from 'vitest';
import type { IntentAdmissionReceipt } from '../../../src/domain/admission/IntentAdmissionReceipt.ts';
import type { WarpIntentDescriptor } from '../../../src/domain/types/WarpIntentDescriptor.ts';
import type WarpWorldline from '../../../src/domain/WarpWorldline.ts';
import WasmVerifiedAdmissionService from '../../../src/domain/services/admission/WasmVerifiedAdmissionService.ts';
import {
  testDerivedIntentAdmissionReceipt,
  testObstructedIntentAdmissionReceipt,
} from '../../helpers/intentAdmission.ts';

function createMockWarpWorldline(outcome: IntentAdmissionReceipt): WarpWorldline {
  return {
    worldlineName: 'events',
    writerId: 'agent-1',
    admitIntent: async () => outcome,
  } as unknown as WarpWorldline;
}

function createService(worldline: WarpWorldline): WasmVerifiedAdmissionService {
  return new WasmVerifiedAdmissionService({
    worldline,
    readAdmissionBasis: async () => 'frontier:intent-journal:test',
  });
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

  it('admits through the worldline when the verifier report is trusted', async () => {
    const mockWorldline = createMockWarpWorldline(
      testDerivedIntentAdmissionReceipt(validIntentDescriptor.intentId, 'blob:intent:sha123')
    );

    const service = createService(mockWorldline);
    const outcome = await service.admitWasmIntent(validIntentDescriptor, validReport);

    expect(outcome.outcome.kind).toBe('derived');
    expect(outcome).toMatchObject({
      intentId: 'intent:xyph:quest:claim:001',
      publicationRef: 'blob:intent:sha123',
    });
  });

  it('should reject admission if verifier report is invalid or untrusted', async () => {
    const mockWorldline = createMockWarpWorldline(
      testDerivedIntentAdmissionReceipt(validIntentDescriptor.intentId)
    );

    const service = createService(mockWorldline);
    const outcome = await service.admitWasmIntent(validIntentDescriptor, invalidReport);
    const admission = outcome.outcome;

    expect(admission.kind).toBe('obstruction');
    if (admission.kind !== 'obstruction') {
      throw new Error('expected obstruction admission');
    }
    expect(admission.witness.reason).toMatchObject({
      family: 'invalid-derivation',
      code: 'git-warp.untrusted-wasm-verifier-report',
    });
    expect(admission.witness.suppliedEvidenceRefs).toContain(
      'warp:wasm-module:sha256%3AunknownWasmDigest'
    );
    expect(admission.witness.suppliedEvidenceRefs).toContain(
      'warp:wasm-report-status:unverified'
    );
  });

  it('should reflect precommit guard obstructions encountered during worldline admission', async () => {
    const mockWorldline = createMockWarpWorldline(
      testObstructedIntentAdmissionReceipt(
        validIntentDescriptor.intentId,
        'git-warp.quest-not-ready',
      )
    );

    const service = createService(mockWorldline);
    const outcome = await service.admitWasmIntent(validIntentDescriptor, validReport);
    const admission = outcome.outcome;

    expect(admission.kind).toBe('obstruction');
    if (admission.kind !== 'obstruction') {
      throw new Error('expected obstruction admission');
    }
    expect(admission.witness.reason.code).toBe('git-warp.quest-not-ready');
  });
});
