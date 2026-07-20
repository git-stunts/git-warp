import { describe, expect, it, vi } from 'vitest';

import IntentController, {
  type IntentHost,
} from '../../../../../src/domain/services/controllers/IntentController.ts';
import type { QueryPropertyBag } from '../../../../../src/domain/capabilities/QueryCapability.ts';
import ReadIdentity from '../../../../../src/domain/services/optic/ReadIdentity.ts';
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

const PINNED_GUARD_COORDINATE =
  'warp:graph-coordinate:{"checkpointSha":"checkpoint:test",' +
  '"frontier":[{"patchSha":"patch:tip","writerId":"agent-1"}],"worldline":"events"}';

type TestNodePropsReader = (nodeId: string) => Promise<QueryPropertyBag | null>;

function withGuards(
  precommitGuards: WarpIntentDescriptor['precommitGuards'],
): WarpIntentDescriptor {
  return { ...descriptor, precommitGuards };
}

function createController(
  getNodeProps: TestNodePropsReader,
): IntentController {
  return new IntentController(createIntentHost(getNodeProps) as unknown as IntentHost);
}

function createIntentHost(
  getNodeProps: TestNodePropsReader,
  intentStore = createIntentStore(),
) {
  return {
    _graphName: 'events',
    _writerId: 'agent-1',
    _intentStore: intentStore,
    _readCheckpointSha: vi.fn(async () => 'checkpoint:test'),
    getFrontier: vi.fn(async () => new Map([['agent-1', 'patch:tip']])),
    worldline: vi.fn(() => boundedWorldline(getNodeProps)),
  };
}

function boundedWorldline(getNodeProps: TestNodePropsReader) {
  return {
    optic: () => ({
      node: (nodeId: string) => ({
        prop: (key: string) => ({
          read: async () => {
            const props = await getNodeProps(nodeId);
            return {
              value: props?.[key],
              readIdentity: testReadIdentity(nodeId, key),
            };
          },
        }),
      }),
    }),
  };
}

function testReadIdentity(nodeId: string, key: string): ReadIdentity {
  return new ReadIdentity({
    worldline: 'events',
    entityAspect: `node-property:${nodeId}:${key}`,
    checkpointSha: 'checkpoint:test',
    checkpointFrontier: [],
    checkpointIndexShards: [],
    tailWitnesses: [],
    reducerVersion: 'test-reducer-v1',
    projectionVersion: 'test-projection-v1',
  });
}

function createIntentStore(): IntentStorePort & {
  publish: ReturnType<typeof vi.fn>;
} {
  const queued = new Map<string, WarpIntentDescriptor[]>();
  const frontiers = new Map<string, string>();
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
    const journal = `warp:intent-journal/events/${request.channel}/${request.ownerId}`;
    const basisRef = frontiers.get(journal) ?? `${journal}/frontier/empty`;
    const publicationRef = `${journal}/publication/${encodeURIComponent(sha)}`;
    const resultingFrontierRef = `${journal}/frontier/${encodeURIComponent(sha)}`;
    frontiers.set(journal, resultingFrontierRef);
    return {
      sha,
      publicationRef,
      basisRef,
      resultingFrontierRef,
      retention: testRetentionWitness(sha),
    };
  });
  return {
    currentBasisRef: vi.fn(async (
      _graphName: string,
      channel: 'admitted' | 'queued',
      ownerId: string,
    ) => {
      const journal = `warp:intent-journal/events/${channel}/${ownerId}`;
      return frontiers.get(journal) ?? `${journal}/frontier/empty`;
    }),
    publish,
    scan: vi.fn((_graphName: string, channel: 'admitted' | 'queued', ownerId: string) => (
      WarpStream.from(channel === 'queued' ? queued.get(ownerId) ?? [] : [])
    )),
  } as unknown as IntentStorePort & { publish: ReturnType<typeof vi.fn> };
}

describe('IntentController', () => {
  it('publishes an admitted descriptor through the semantic intent store', async () => {
    const intentStore = createIntentStore();
    const host = createIntentHost(
      vi.fn<TestNodePropsReader>().mockResolvedValue(null),
      intentStore,
    );
    const controller = new IntentController(host as unknown as IntentHost);
    const sha = 'intent:assign-alice:agent-1:1';

    await expect(controller.admitIntent(descriptor)).resolves.toMatchObject({
      operation: 'write',
      intentId: 'assign-alice',
      outcome: {
        kind: 'derived',
        witness: {
          admittedSuffixRef:
            `warp:intent-journal/events/admitted/agent-1/publication/${encodeURIComponent(sha)}`,
          resultingFrontierRef:
            `warp:intent-journal/events/admitted/agent-1/frontier/${encodeURIComponent(sha)}`,
          evaluation: {
            sourceBasisRef:
              'warp:intent-journal/events/admitted/agent-1/frontier/empty',
            destinationBasisRef:
              'warp:intent-journal/events/admitted/agent-1/frontier/empty',
            evaluationCoordinateRef:
              'warp:intent-journal/events/admitted/agent-1/frontier/empty',
          },
        },
      },
      retention: testRetentionWitness(sha),
    });
    expect(intentStore.publish).toHaveBeenCalledWith({
      graphName: 'events',
      channel: 'admitted',
      ownerId: 'agent-1',
      descriptor,
    });
    expect(host._readCheckpointSha).not.toHaveBeenCalled();
    expect(host.getFrontier).not.toHaveBeenCalled();
    expect(host.worldline).not.toHaveBeenCalled();
  });

  it('pins every guard to one checkpoint-tail coordinate', async () => {
    const host = createIntentHost(
      vi.fn<TestNodePropsReader>().mockResolvedValue({ status: 'active', agentId: 'agent-1' })
    );
    const controller = new IntentController(host as unknown as IntentHost);
    const guarded = withGuards([
      {
        op: 'nodeStatus',
        nodeId: 'user:alice',
        expected: 'active',
        failureTag: 'wrong-status',
      },
      {
        op: 'nodeUnassignedOrSelf',
        nodeId: 'user:alice',
        agentId: 'agent-1',
        failureTag: 'assigned-elsewhere',
      },
    ]);

    await expect(controller.admitIntent(guarded)).resolves.toMatchObject({
      outcome: {
        kind: 'derived',
        witness: {
          evaluation: {
            evaluationCoordinateRef: PINNED_GUARD_COORDINATE,
          },
        },
      },
    });
    expect(host._readCheckpointSha).toHaveBeenCalledOnce();
    expect(host.getFrontier).toHaveBeenCalledOnce();
    expect(host.worldline).toHaveBeenCalledOnce();
    expect(host.worldline).toHaveBeenCalledWith({
      source: {
        kind: 'coordinate',
        checkpointSha: 'checkpoint:test',
        frontier: new Map([['agent-1', 'patch:tip']]),
      },
    });
  });

  it('enforces node status guards without persisting the descriptor', async () => {
    const getNodeProps = vi
      .fn<TestNodePropsReader>()
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

    await expect(controller.admitIntent(guarded)).resolves.toMatchObject({
      outcome: {
        kind: 'obstruction',
        witness: {
          reason: { family: 'law-violation', code: 'git-warp.intent-guard' },
          failedConditionRef: 'warp:intent-guard:condition/wrong-status/user%3Aalice',
          retry: { value: 'after-change' },
        },
      },
      intentId: 'assign-alice',
    });
    await expect(controller.admitIntent(guarded)).resolves.toMatchObject({
      intentId: 'assign-alice',
      outcome: { kind: 'derived' },
      retention: testRetentionWitness('intent:assign-alice:agent-1:1'),
    });
    await expect(controller.admitIntent(guarded)).resolves.toMatchObject({
      outcome: {
        kind: 'obstruction',
        witness: {
          suppliedEvidenceRefs: [
            expect.stringContaining('warp:intent-guard:actual/user%3Aalice/ABSENT'),
            expect.stringContaining('warp:read-identity:'),
          ],
        },
      },
    });
  });

  it('accepts an unassigned or matching agent and obstructs invalid assignments', async () => {
    const getNodeProps = vi
      .fn<TestNodePropsReader>()
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

    for (let counter = 1; counter <= 2; counter += 1) {
      await expect(controller.admitIntent(guarded)).resolves.toMatchObject({
        intentId: 'assign-alice',
        outcome: { kind: 'derived' },
        retention: testRetentionWitness(`intent:assign-alice:agent-1:${counter}`),
      });
    }
    await expect(controller.admitIntent(guarded)).resolves.toMatchObject({
      outcome: {
        kind: 'obstruction',
        witness: {
          suppliedEvidenceRefs: [
            expect.stringContaining('warp:intent-guard:actual/task%3A1/7'),
            expect.stringContaining('warp:read-identity:'),
          ],
        },
      },
    });
    await expect(controller.admitIntent(guarded)).resolves.toMatchObject({
      outcome: { kind: 'derived' },
      retention: testRetentionWitness('intent:assign-alice:agent-1:3'),
    });
    await expect(controller.admitIntent(guarded)).resolves.toMatchObject({
      outcome: {
        kind: 'obstruction',
        witness: {
          suppliedEvidenceRefs: [
            expect.stringContaining('warp:intent-guard:actual/task%3A1/agent-2'),
            expect.stringContaining('warp:read-identity:'),
          ],
        },
      },
      intentId: 'assign-alice',
    });
  });

  it('keeps malformed guard discriminants outside causal outcomes', async () => {
    const getNodeProps = vi.fn<TestNodePropsReader>();
    const controller = createController(getNodeProps);
    const malformed = withGuards([{
      // @ts-expect-error runtime guard for JavaScript callers
      op: 'edgeExists',
      nodeId: 'task:1',
      failureTag: 'unsupported-guard',
    }]);

    await expect(controller.admitIntent(malformed)).rejects.toMatchObject({
      code: 'E_VALIDATION',
    });
    expect(getNodeProps).not.toHaveBeenCalled();
  });

  it('publishes retained queued descriptors by strand', async () => {
    const controller = createController(vi.fn<TestNodePropsReader>());
    const strandId = 'draft-admin';
    const sha = `queued:${strandId}:assign-alice`;

    await expect(controller.queueIntent(strandId, descriptor)).resolves.toMatchObject({
      intentId: 'assign-alice',
      outcome: { kind: 'derived' },
      publicationRef:
        `warp:intent-journal/events/queued/draft-admin/publication/${encodeURIComponent(sha)}`,
      retention: testRetentionWitness(sha),
    });
    await expect(controller.getWriterIntents(strandId)).resolves.toEqual([descriptor]);
    await expect(controller.getWriterIntents('missing')).resolves.toEqual([]);
  });
});
