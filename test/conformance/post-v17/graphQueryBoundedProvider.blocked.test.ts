import { describe, expect, it } from 'vitest';
import { openMemoryRuntimeHostProduct as openRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';
import InMemoryGraphAdapter from '../../../test/helpers/InMemoryGraphAdapter.ts';
import type { WarpIntentDescriptor } from '../../../src/domain/types/WarpIntentDescriptor.ts';

const BASE_NODE_ID = 'bounded:base';
const TAIL_NODE_ID = 'bounded:tail';
const MISSING_NODE_ID = 'bounded:missing';

function guardedIntent(): WarpIntentDescriptor {
  return {
    intentId: 'bounded-guard-admission',
    nutritionLabel: {
      bundleHash: 'sha256:bounded-guard-bundle',
      coreHash: 'sha256:bounded-guard-law',
      profile: 'git-warp.bounded-guard/v1',
      budget: 'bounded',
    },
    precommitGuards: [
      {
        op: 'nodeStatus',
        nodeId: BASE_NODE_ID,
        expected: 'ready',
        failureTag: 'base-not-ready',
      },
      {
        op: 'nodeStatus',
        nodeId: TAIL_NODE_ID,
        expected: 'ready',
        failureTag: 'tail-not-ready',
      },
    ],
    suffixTransform: {
      op: 'bounded-guard-admission',
      payload: { base: BASE_NODE_ID, tail: TAIL_NODE_ID },
    },
  };
}

describe('post-v17 blocked witness: graph query bounded read-model provider', () => {
  it('answers exact id-only graph.query from checkpoint plus live tail without full materialization', async () => {
    const persistence = new InMemoryGraphAdapter();
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'bounded-query-provider',
      writerId: 'writer-1',
    });
    await graph.patch((patch) => {
      patch.addNode(BASE_NODE_ID);
    });
    await graph.materialize();
    await graph.createCheckpoint();
    await graph.patch((patch) => {
      patch.addNode(TAIL_NODE_ID);
    });
    graph._ensureFreshState = async () => {
      throw new Error('full materialization trap');
    };

    const base = await graph.query().match(BASE_NODE_ID).select(['id']).run();
    const tail = await graph.query().match(TAIL_NODE_ID).select(['id']).run();
    const missing = await graph.query().match(MISSING_NODE_ID).select(['id']).run();

    expect(base).toMatchObject({
      nodes: [{ id: BASE_NODE_ID }],
    });
    expect(tail).toMatchObject({
      nodes: [{ id: TAIL_NODE_ID }],
    });
    expect(missing).toMatchObject({
      nodes: [],
    });
    expect(base.stateHash).toContain('checkpoint-tail-query:');
    expect(tail.stateHash).toContain('checkpoint-tail-query:');
    expect(missing.stateHash).toContain('checkpoint-tail-query:');
  });

  it('answers exact id-only worldline queries from the checkpoint-tail optic, live and at a coordinate', async () => {
    const graph = await openRuntimeHostProduct({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'bounded-worldline-query',
      writerId: 'writer-1',
    });
    await graph.patch((patch) => {
      patch.addNode(BASE_NODE_ID);
    });
    const unanchored = await graph.worldline().query().match(BASE_NODE_ID).select(['id']).run();
    expect(unanchored.stateHash).not.toContain('checkpoint-tail-query:');
    await graph.materialize();
    const checkpointSha = await graph.createCheckpoint();
    const frontier = Object.fromEntries(await graph.getFrontier());
    await graph.patch((patch) => {
      patch.addNode(TAIL_NODE_ID);
    });
    graph._ensureFreshState = async () => {
      throw new Error('full materialization trap');
    };

    const live = await graph.worldline().query().match(TAIL_NODE_ID).select(['id']).run();
    const pinned = graph.worldline({ source: { kind: 'coordinate', frontier, ceiling: null, checkpointSha } });
    const atCheckpoint = await pinned.query().match(TAIL_NODE_ID).select(['id']).run();

    expect(live).toMatchObject({ nodes: [{ id: TAIL_NODE_ID }] });
    expect(live.stateHash).toContain('checkpoint-tail-query:');
    expect(atCheckpoint).toMatchObject({ nodes: [] });
    expect(atCheckpoint.stateHash).toContain('checkpoint-tail-query:');
  });

  it('evaluates intent guards through checkpoint-tail property optics', async () => {
    const persistence = new InMemoryGraphAdapter();
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'bounded-intent-guards',
      writerId: 'writer-1',
    });
    await graph.patch((patch) => {
      patch.addNode(BASE_NODE_ID);
      patch.setProperty(BASE_NODE_ID, 'status', 'ready');
    });
    await graph.materialize();
    await graph.createCheckpoint();
    await graph.patch((patch) => {
      patch.addNode(TAIL_NODE_ID);
      patch.setProperty(TAIL_NODE_ID, 'status', 'ready');
    });
    graph._ensureFreshState = async () => {
      throw new Error('full materialization trap');
    };

    await expect(graph.admitIntent(guardedIntent())).resolves.toMatchObject({
      operation: 'write',
      outcome: { kind: 'derived' },
    });
  });

  it('obstructs guarded admission when no bounded basis exists', async () => {
    const graph = await openRuntimeHostProduct({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'missing-bounded-intent-basis',
      writerId: 'writer-1',
    });

    await expect(graph.admitIntent(guardedIntent())).resolves.toMatchObject({
      operation: 'write',
      outcome: {
        kind: 'obstruction',
        witness: {
          reason: {
            family: 'unsupported-evidence',
            code: 'git-warp.missing-bounded-basis',
          },
          evaluation: {
            evaluationCoordinateRef: expect.stringContaining(
              'warp:graph-coordinate:{"basis":"missing-checkpoint"'
            ),
          },
          retry: { value: 'after-change' },
        },
      },
    });
  });
});
