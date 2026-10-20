import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestRepo } from './helpers/setup.ts';

/**
 * Regression witness for #958: retained checkpoints must not fail once the
 * retention root set exceeds one backend metadata request (1000 objects).
 */
const GRAPH = 'retention-scale';
const WRITER = 'writer-1';
const NODES_PER_PATCH = 500;
const CHECKPOINT_ROUNDS = 3;
const CHURN_NODES = 50;
const CASE_TIMEOUT_MS = 600_000;

function nodeId(index: number): string {
  return `node:${String(index).padStart(5, '0')}`;
}

async function addNodes(graph, start: number, count: number): Promise<void> {
  for (let offset = 0; offset < count; offset += NODES_PER_PATCH) {
    const patch = await graph.createPatch();
    const end = Math.min(start + count, start + offset + NODES_PER_PATCH);
    for (let index = start + offset; index < end; index++) {
      patch.addNode(nodeId(index)).setProperty(nodeId(index), 'value', `value-${index}`);
    }
    await patch.commit();
    await graph.materialize();
  }
}

async function removeNodes(graph, start: number, count: number): Promise<void> {
  const patch = await graph.createPatch();
  for (let index = start; index < start + count; index++) {
    patch.removeNode(nodeId(index));
  }
  await patch.commit();
  await graph.materialize();
}

function sampleIndexes(live: readonly number[]): number[] {
  return [live[0], live[Math.floor(live.length / 2)], live[live.length - 1]];
}

describe('API: retained checkpoints beyond one metadata request', () => {
  let repo;

  beforeEach(async () => {
    repo = await createTestRepo('checkpoint-retention-scale');
  });

  afterEach(async () => {
    await repo?.cleanup();
  });

  it.each([500, 1500, 1600, 5000])(
    'retains %i live nodes across repeated checkpoints, churn, and reopen',
    async (nodeCount) => {
      const graph = await repo.openGraph(GRAPH, WRITER);
      await addNodes(graph, 0, nodeCount);
      let next = nodeCount;
      let removedThrough = 0;
      const checkpoints: string[] = [];
      for (let round = 0; round < CHECKPOINT_ROUNDS; round++) {
        if (round > 0) {
          await removeNodes(graph, removedThrough, CHURN_NODES);
          removedThrough += CHURN_NODES;
          await addNodes(graph, next, CHURN_NODES);
          next += CHURN_NODES;
        }
        await graph.materialize();
        checkpoints.push(await graph.createCheckpoint());
      }
      expect(new Set(checkpoints).size).toBe(CHECKPOINT_ROUNDS);

      const live = Array.from({ length: next - removedThrough }, (_, index) => index + removedThrough);
      const reopened = await repo.openGraph(GRAPH, WRITER);
      await reopened.materialize();
      const nodes = await reopened.getNodes();
      expect(nodes).toHaveLength(live.length);
      expect(nodes).not.toContain(nodeId(0));
      for (const index of sampleIndexes(live)) {
        expect(await reopened.getNodeProps(nodeId(index))).toEqual({ value: `value-${index}` });
      }
    },
    CASE_TIMEOUT_MS,
  );
});
