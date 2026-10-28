import { describe, expect, it } from 'vitest';
import { openWarp } from '../../../../src/application/openWarp.ts';
import { captureDraftSettlementSnapshot } from '../../../../src/domain/api/DraftSettlementRuntime.ts';
import { intent } from '../../../../src/domain/api/IntentBuilders.ts';
import { reading } from '../../../../src/domain/api/ReadingBuilders.ts';
import { executeReading } from '../../../../src/domain/api/ReadingRuntime.ts';
import ConeObstructedError from '../../../../src/domain/errors/ConeObstructedError.ts';
import WarpWorldline from '../../../../src/domain/WarpWorldline.ts';
import MemoryStorage from '../../../helpers/MemoryStorage.ts';
import { testDerivedIntentAdmissionReceipt } from '../../../helpers/intentAdmission.ts';

describe('draft settlement snapshots over cone bases (#1039)', () => {
  it('captures base, strand and target frontiers, then refuses a target whose cone basis is obstructed', async () => {
    const storage = MemoryStorage.create();
    try {
      const warp = await openWarp({ storage, writer: 'agent-1' });
      const timeline = await warp.timeline('events');
      await timeline.write(intent.node.add({ subject: 'user:alice' }));
      const draft = await timeline.draft('promote');
      await draft.write(intent.property.set({ subject: 'user:alice', key: 'role', value: 'admin' }));
      const snapshot = await captureDraftSettlementSnapshot(draft);
      expect(snapshot).toMatchObject({ status: 'ready', targetBasis: 'base' });
      expect(snapshot.baseTargetFrontierRef).toBe(snapshot.targetFrontierRef);
      expect(snapshot.basisEvidenceRefs).toHaveLength(3);

      storage.divergeLaneBasis('events', 'agent-1');
      await expect(captureDraftSettlementSnapshot(draft)).rejects.toBeInstanceOf(ConeObstructedError);
    } finally {
      await storage.close();
    }
  });
});

describe('ReadingRuntime over a handle without cone records', () => {
  it('lets a non-cone runtime failure escape instead of inventing a receipt', async () => {
    const runtime = new WarpWorldline({
      worldlineName: 'events', writerId: 'agent-1',
      commitPatch: async () => 'unused',
      createWorldline: () => { throw new Error('unused compatibility projection'); },
      admitIntent: async (descriptor) => testDerivedIntentAdmissionReceipt(descriptor.intentId),
    });
    const context = { createOpaqueId: async () => 'evidence:test', reserveRecoveryNonce: () => 'nonce', bindReceipt: () => undefined };
    await expect(executeReading({ runtime, context, reading: reading.node.exists({ subject: 'user:alice' }) }))
      .rejects.toMatchObject({ code: 'E_WARP_WORLDLINE_CONE_UNAVAILABLE' });
  });
});
