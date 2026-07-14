import { describe, expect, it, vi } from 'vitest';

import IntentController, {
  type IntentHost,
} from '../../../../../src/domain/services/controllers/IntentController.ts';
import type { WarpIntentDescriptor } from '../../../../../src/domain/types/WarpIntentDescriptor.ts';

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
  return new IntentController({
    _graphName: 'events',
    _writerId: 'agent-1',
    worldline: () => ({ getNodeProps }),
  } as unknown as IntentHost);
}

describe('IntentController', () => {
  it('admits a descriptor without writing an unattached persistence blob', async () => {
    const writeBlob = vi.fn(async () => 'a'.repeat(40));
    const host = {
      _graphName: 'events',
      _writerId: 'agent-1',
      _persistence: { writeBlob },
      worldline: () => ({ getNodeProps: vi.fn() }),
    } as unknown as IntentHost;
    const controller = new IntentController(host);

    await expect(controller.admitIntent(descriptor)).resolves.toEqual({
      admitted: true,
      intentId: 'assign-alice',
      sha: 'intent:assign-alice:agent-1:1',
    });
    expect(writeBlob).not.toHaveBeenCalled();
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

  it('leaves unsupported guards to their owning admission layer', async () => {
    const controller = createController(vi.fn().mockResolvedValue({}));
    const guarded = withGuards([{
      op: 'edgeExists',
      nodeId: 'user:alice',
      failureTag: 'missing-edge',
    }]);

    await expect(controller.admitIntent(guarded)).resolves.toMatchObject({
      admitted: true,
      intentId: 'assign-alice',
    });
  });

  it('queues descriptors by strand without writing storage', async () => {
    const controller = createController(vi.fn());

    await expect(controller.queueIntent('draft:admin', descriptor)).resolves.toEqual({
      admitted: true,
      intentId: 'assign-alice',
      sha: 'queued:draft:admin:assign-alice',
    });
    await expect(controller.getWriterIntents('draft:admin')).resolves.toEqual([descriptor]);
    await expect(controller.getWriterIntents('missing')).resolves.toEqual([]);
  });
});
