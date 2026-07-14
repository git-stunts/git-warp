import { describe, expect, it } from 'vitest';

import { inspectReceipt } from '../../../diagnostics.ts';
import { openWarp } from '../../../src/application/openWarp.ts';
import { createApiRuntimeContext } from '../../../src/application/ReceiptProvenanceRegistry.ts';
import { intent } from '../../../src/domain/api/IntentBuilders.ts';
import { reading } from '../../../src/domain/api/ReadingBuilders.ts';
import WriteReceipt from '../../../src/domain/api/WriteReceipt.ts';
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import { MemoryStorage } from '../../../storage.ts';
import { createBoundedReadBasis } from '../../helpers/BoundedReadBasis.ts';

describe('receipt diagnostics', () => {
  it('uses collision-safe typed framing for opaque identity inputs', async () => {
    const context = createApiRuntimeContext(MemoryStorage.create(), new NodeCryptoAdapter());
    const ids = await Promise.all([
      context.createOpaqueId('evidence', ['ab', 'c']),
      context.createOpaqueId('evidence', ['a', 'bc']),
      context.createOpaqueId('evidence', [1]),
      context.createOpaqueId('evidence', ['1']),
    ]);

    expect(new Set(ids).size).toBe(ids.length);
    await expect(context.createOpaqueId('evidence', ['ab', 'c'])).resolves.toBe(ids[0]);
  });

  it('reserves recovery nonces across contexts sharing one storage', () => {
    const storage = MemoryStorage.create();
    const first = createApiRuntimeContext(storage, new NodeCryptoAdapter());
    const reopened = createApiRuntimeContext(storage, new NodeCryptoAdapter());

    const firstNonce = first.reserveRecoveryNonce();
    const reopenedNonce = reopened.reserveRecoveryNonce();

    expect(firstNonce).toMatch(/:1$/);
    expect(reopenedNonce).toMatch(/:2$/);
    expect(reopenedNonce).not.toBe(firstNonce);
  });

  it('recovers exact write provenance only with explicit storage context', async () => {
    const storage = MemoryStorage.create();
    const warp = await openWarp({ storage, writer: 'agent-1' });
    const timeline = await warp.timeline('events');
    const receipt = await timeline.write(intent.node.add({ subject: 'user:alice' }));

    const inspection = inspectReceipt(receipt, { storage });

    expect(inspection).toMatchObject({
      operation: 'write',
      outcome: 'accepted',
      timeline: 'events',
      writer: 'agent-1',
      reason: undefined,
      evidence: 'present',
      substrate: { operation: 'write' },
    });
    expect(inspection.objectIds).toHaveLength(1);
    expect(inspection.substrate.operation).toBe('write');
    if (inspection.substrate.operation !== 'write') {
      throw new Error('write receipt diagnostics must expose write provenance');
    }
    expect(inspection.substrate.patchSha).toBe(inspection.objectIds[0]);
    expect('patchSha' in receipt).toBe(false);
  });

  it('does not invent object identities for unresolved writes', async () => {
    const storage = MemoryStorage.create();
    const warp = await openWarp({ storage, writer: 'agent-1' });
    const timeline = await warp.timeline('events');
    const receipt = await timeline.write(intent.node.remove({ subject: 'user:alice' }));

    const inspection = inspectReceipt(receipt, { storage });

    expect(receipt.outcome).not.toBe('accepted');
    expect(inspection.objectIds).toEqual([]);
    expect(inspection.evidence).toBe('absent');
  });

  it('recovers full bounded-read provenance without exposing it on evidence', async () => {
    const storage = MemoryStorage.create();
    const warp = await openWarp({ storage, writer: 'agent-1' });
    const timeline = await warp.timeline('events');
    await timeline.write(intent.node.add({ subject: 'user:alice' }));
    await createBoundedReadBasis(storage, timeline.name);
    const propertyWrite = await timeline.write(
      intent.property.set({ subject: 'user:alice', key: 'role', value: 'admin' })
    );
    const result = await timeline.read(reading.property({ subject: 'user:alice', key: 'role' }));

    const inspection = inspectReceipt(result.receipt, { storage });

    expect(result.receipt.outcome).toBe('accepted');
    expect(result.receipt.evidence).not.toHaveProperty('checkpointSha');
    expect(result.receipt.evidence?.support).toContainEqual(propertyWrite.evidence?.support[0]);
    expect(inspection.substrate.operation).toBe('read');
    if (inspection.substrate.operation !== 'read') {
      throw new Error('read receipt diagnostics must expose read provenance');
    }
    expect(inspection.substrate.identity?.checkpointSha).toBeTruthy();
    expect(inspection.objectIds).toContain(inspection.substrate.identity?.checkpointSha);
  });

  it('recovers join object identities behind correlated support handles', async () => {
    const storage = MemoryStorage.create();
    const warp = await openWarp({ storage, writer: 'agent-1' });
    const timeline = await warp.timeline('events');
    await timeline.write(intent.node.add({ subject: 'user:alice' }));
    const draft = await timeline.draft('try-admin-role');
    const draftWrite = await draft.write(
      intent.property.set({ subject: 'user:alice', key: 'role', value: 'admin' })
    );
    const preview = await timeline.previewJoin(draft);

    const inspection = inspectReceipt(preview.receipt, { storage });

    expect(preview.receipt.evidence?.support).toContainEqual(draftWrite.evidence?.support[0]);
    expect('patchShas' in preview.receipt).toBe(false);
    expect(inspection.substrate.operation).toBe('join');
    if (inspection.substrate.operation !== 'join') {
      throw new Error('join receipt diagnostics must expose join provenance');
    }
    expect(inspection.substrate.patchShas.length).toBeGreaterThan(0);
    expect(preview.receipt.evidence?.support).toHaveLength(inspection.substrate.patchShas.length);
    expect(inspection.objectIds).toEqual(inspection.substrate.patchShas);
  });

  it('rejects diagnostics requests made with a different storage handle', async () => {
    const storage = MemoryStorage.create();
    const otherStorage = MemoryStorage.create();
    const warp = await openWarp({ storage, writer: 'agent-1' });
    const timeline = await warp.timeline('events');
    const receipt = await timeline.write(intent.node.add({ subject: 'user:alice' }));

    expect(() => inspectReceipt(receipt, { storage: otherStorage })).toThrow(
      'Receipt does not belong to the supplied storage'
    );
  });

  it('requires an explicit diagnostics storage context', async () => {
    const storage = MemoryStorage.create();
    const warp = await openWarp({ storage, writer: 'agent-1' });
    const timeline = await warp.timeline('events');
    const receipt = await timeline.write(intent.node.add({ subject: 'user:alice' }));

    expect(() => inspectReceipt(receipt, undefined as never)).toThrow(
      'Receipt inspection requires an explicit storage context'
    );
  });

  it('rejects receipts that were not issued by an openWarp runtime', () => {
    const storage = MemoryStorage.create();
    const receipt = new WriteReceipt({
      timeline: 'events',
      writer: 'agent-1',
      intent: intent.node.add({ subject: 'user:alice' }),
      outcome: 'rejected',
      reason: 'not_admitted',
    });

    expect(() => inspectReceipt(receipt, { storage })).toThrow(
      'Receipt was not issued by an openWarp runtime'
    );
  });

  it('binds raw receipt provenance exactly once', () => {
    const storage = MemoryStorage.create();
    const receipt = new WriteReceipt({
      timeline: 'events',
      writer: 'agent-1',
      intent: intent.node.add({ subject: 'user:alice' }),
      outcome: 'rejected',
      reason: 'not_admitted',
    });
    const context = createApiRuntimeContext(storage, new NodeCryptoAdapter());
    const provenance = { operation: 'write' as const, patchSha: undefined };

    context.bindReceipt(receipt, provenance);

    expect(() => context.bindReceipt(receipt, provenance)).toThrow(
      'Receipt provenance is already bound'
    );
  });
});
