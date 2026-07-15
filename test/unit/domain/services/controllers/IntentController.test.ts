import { describe, expect, it, vi } from 'vitest';

import IntentController, {
  type IntentHost,
} from '../../../../../src/domain/services/controllers/IntentController.ts';
import WarpStream from '../../../../../src/domain/stream/WarpStream.ts';
import type { WarpIntentDescriptor } from '../../../../../src/domain/types/WarpIntentDescriptor.ts';
import type IntentStorePort from '../../../../../src/ports/IntentStorePort.ts';
import { testRetentionWitness } from '../../../../helpers/storageRetention.ts';

const descriptor: WarpIntentDescriptor = {
  intentId: 'assign-alice',
  nutritionLabel: {
    bundleHash: 'bundle',
    coreHash: 'core',
    profile: 'default',
    budget: 'bounded',
  },
  precommitGuards: [],
  suffixTransform: {
    op: 'property.set',
    payload: { subject: 'user:alice', key: 'role', value: 'admin' },
  },
};

function withGuards(
  precommitGuards: WarpIntentDescriptor['precommitGuards'],
): WarpIntentDescriptor {
  return { ...descriptor, precommitGuards };
}

function createController(
  getNodeProps: ReturnType<typeof vi.fn>,
): IntentController {
  const intentStore = createIntentStore();
  return new IntentController({
    _graphName: 'events',
    _writerId: 'agent-1',
    _intentStore: intentStore,
    worldline: () => ({ getNodeProps }),
  } as unknown as IntentHost);
}

function createIntentStore(): IntentStorePort & {
  publish: ReturnType<typeof vi.fn>;
} {
  const queued = new Map<string, WarpIntentDescriptor[]>();
  let admissionSequence = 0;
  const publish = vi.fn(async (request: {
    channel: 'admitted' | 'queued';
    ownerId: string;
    descriptor: WarpIntentDescriptor;
  }) => {
    if (request.channel === 'queued') {
      const descriptors = queued.get(request.ownerId) ?? [];
      descriptors.push(request.descriptor);
      queued.set(request.ownerId, descriptors);
    } else {
      admissionSequence += 1;
    }
    const sha = request.channel === 'queued'
      ? `queued:${request.ownerId}:${request.descriptor.intentId}`
      : `intent:${request.descriptor.intentId}:${request.ownerId}:${admissionSequence}`;
    return {
      sha,
      retention: testRetentionWitness(sha),
    };
  });
  return {
    publish,
    scan: vi.fn((_graphName: string, channel: 'admitted' | 'queued', ownerId: string) => (
      WarpStream.from(channel === 'queued' ? queued.get(ownerId) ?? [] : [])
    )),
  } as unknown as IntentStorePort & { publish: ReturnType<typeof vi.fn> };
}

describe('IntentController', () => {
  it('publishes an admitted descriptor through the semantic intent store', async () => {
    const intentStore = createIntentStore();
    const host = {
      _graphName: 'events',
      _writerId: 'agent-1',
      _intentStore: intentStore,
      worldline: () => ({ getNodeProps: vi.fn() }),
    } as unknown as IntentHost;
    const controller = new IntentController(host);
    const sha = 'intent:assign-alice:agent-1:1';

    await expect(controller.admitIntent(descriptor)).resolves.toEqual({
      admitted: true,
      intentId: 'assign-alice',
      sha,
      retention: testRetentionWitness(sha),
    });
    expect(intentStore.publish).toHaveBeenCalledWith({
      graphName: 'events',
      channel: 'admitted',
      ownerId: 'agent-1',
      descriptor,
    });
  });

  it('enforces node status guards without persisting the descriptor', async () => {
    const getNodeProps = vi
      .fn()
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'active' })
      .mockResolvedValueOnce({ status: 7 });
    const controller = createController(getNodeProps);
    const guarded = withGuards([{
      op: 'nodeStatus',
      nodeId: 'user:alice',
      expected: 'active',
      failureTag: 'wrong-status',
    }]);

    await expect(controller.admitIntent(guarded)).resolves.toEqual({
      admitted: false,
      obstruction: {
        tag: 'wrong-status',
        nodeId: 'user:alice',
        actual: 'pending',
      },
      intentId: 'assign-alice',
    });
    await expect(controller.admitIntent(guarded)).resolves.toEqual({
      admitted: true,
      intentId: 'assign-alice',
      sha: 'intent:assign-alice:agent-1:1',
      retention: testRetentionWitness('intent:assign-alice:agent-1:1'),
    });
    await expect(controller.admitIntent(guarded)).resolves.toMatchObject({
      admitted: false,
      obstruction: { actual: 'ABSENT' },
    });
  });

  it('accepts an unassigned or matching agent and obstructs another agent', async () => {
    const getNodeProps = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ agentId: 7 })
      .mockResolvedValueOnce({ agentId: 'agent-1' })
      .mockResolvedValueOnce({ agentId: 'agent-2' });
    const controller = createController(getNodeProps);
    const guarded = withGuards([{
      op: 'nodeUnassignedOrSelf',
      nodeId: 'task:1',
      agentId: 'agent-1',
      failureTag: 'assigned-elsewhere',
    }]);

    for (let counter = 1; counter <= 4; counter += 1) {
      await expect(controller.admitIntent(guarded)).resolves.toEqual({
        admitted: true,
        intentId: 'assign-alice',
        sha: `intent:assign-alice:agent-1:${counter}`,
        retention: testRetentionWitness(`intent:assign-alice:agent-1:${counter}`),
      });
    }
    await expect(controller.admitIntent(guarded)).resolves.toEqual({
      admitted: false,
      obstruction: {
        tag: 'assigned-elsewhere',
        nodeId: 'task:1',
        actual: 'agent-2',
      },
      intentId: 'assign-alice',
    });
  });

  it('queues descriptors by strand without writing storage', async () => {
    const controller = createController(vi.fn());
    const strandId = 'draft-admin';
    const sha = `queued:${strandId}:assign-alice`;

    await expect(controller.queueIntent(strandId, descriptor)).resolves.toEqual({
      admitted: true,
      intentId: 'assign-alice',
      sha,
      retention: testRetentionWitness(sha),
    });
    await expect(controller.getWriterIntents(strandId)).resolves.toEqual([descriptor]);
    await expect(controller.getWriterIntents('missing')).resolves.toEqual([]);
  });
});
