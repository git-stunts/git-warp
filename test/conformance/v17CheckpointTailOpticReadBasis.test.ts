import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHECKPOINT_NODE_ID,
  CHECKPOINT_PROPERTY_VALUE,
  MISSING_NODE_ID,
  PROPERTY_KEY,
  TAIL_PROPERTY_VALUE,
  UNSUPPORTED_TAIL_PROPERTY_VALUE,
  expectNoBoundedBasisFailure,
  expectReadIdentity,
  expectShardUnavailableFailure,
  expectTailBudgetExceededFailure,
  expectTailWitnessCount,
  makeCheckpointPropertyShardInvalid,
  makeCheckpointPropertyShardUnavailable,
  mockTailBudgetExceeded,
  openEmptyGraph,
  openGraphWithIndexedCheckpoint,
  readNode,
  readNodeProperty,
  spyMaterializeGraphFailure,
} from './fixtures/v17CheckpointTailOpticFixtures.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DELIVERY_PLAN_PATH = 'docs/design/0112-v17-foundation-delivery-plan.md';

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ');
}

describe('v17 checkpoint-tail optic read basis', () => {
  it('requires exact node optic reads to avoid _materializeGraph()', async () => {
    const graph = await openGraphWithIndexedCheckpoint('v17-optic-node-red');
    await graph.patch((patch) => {
      patch.setProperty(CHECKPOINT_NODE_ID, 'ignoredByNodeRead', 'not a liveness fact');
    });
    const materializeGraph = spyMaterializeGraphFailure(
      graph,
      'worldline optic node read must not full-materialize',
    );

    const result = await readNode(graph.worldline(), CHECKPOINT_NODE_ID);

    expect(materializeGraph).not.toHaveBeenCalled();
    expectReadIdentity(result);
    expect(result).toMatchObject({
      nodeId: CHECKPOINT_NODE_ID,
      alive: true,
    });
    expectTailWitnessCount(result, 0);
  });

  it('requires property optic reads to fold live tail without _materializeGraph()', async () => {
    const graph = await openGraphWithIndexedCheckpoint('v17-optic-prop-red');
    await graph.patch((patch) => {
      patch.setProperty(CHECKPOINT_NODE_ID, PROPERTY_KEY, TAIL_PROPERTY_VALUE);
    });
    const materializeGraph = spyMaterializeGraphFailure(
      graph,
      'worldline optic property read must not full-materialize',
    );

    const result = await readNodeProperty(graph.worldline(), CHECKPOINT_NODE_ID, PROPERTY_KEY);

    expect(materializeGraph).not.toHaveBeenCalled();
    expectReadIdentity(result);
    expect(result).toMatchObject({
      nodeId: CHECKPOINT_NODE_ID,
      key: PROPERTY_KEY,
      value: TAIL_PROPERTY_VALUE,
    });
    expectTailWitnessCount(result, 1);
  });

  it('requires missing bounded basis to fail closed without materialization', async () => {
    const graphName = 'v17-optic-no-basis-red';
    const graph = await openEmptyGraph(graphName);
    const materializeGraph = spyMaterializeGraphFailure(
      graph,
      'missing bounded basis must not fall back to materialization',
    );

    await expectNoBoundedBasisFailure({
      read: readNode(graph.worldline(), MISSING_NODE_ID),
      graphName,
      opticKind: 'node',
      target: { nodeId: MISSING_NODE_ID },
      cause: 'missing-checkpoint',
    });
    expect(materializeGraph).not.toHaveBeenCalled();
  });

  it('requires tail node removes to fail closed without materialization', async () => {
    const graphName = 'v17-optic-node-remove-tail-red';
    const graph = await openGraphWithIndexedCheckpoint(graphName);
    await graph.patch((patch) => {
      patch.removeNode(CHECKPOINT_NODE_ID);
    });
    const materializeGraph = spyMaterializeGraphFailure(
      graph,
      'tail node remove must not fall back to materialization',
    );

    await expectNoBoundedBasisFailure({
      read: readNode(graph.worldline(), CHECKPOINT_NODE_ID),
      graphName,
      opticKind: 'node',
      target: { nodeId: CHECKPOINT_NODE_ID },
      cause: 'tail-node-remove-needs-raw-liveness-witnesses',
    });
    expect(materializeGraph).not.toHaveBeenCalled();
  });

  it('requires unsupported tail property values to fail closed without materialization', async () => {
    const graphName = 'v17-optic-prop-object-tail-red';
    const graph = await openGraphWithIndexedCheckpoint(graphName);
    await graph.patch((patch) => {
      patch.setProperty(CHECKPOINT_NODE_ID, PROPERTY_KEY, UNSUPPORTED_TAIL_PROPERTY_VALUE);
    });
    const materializeGraph = spyMaterializeGraphFailure(
      graph,
      'unsupported tail property value must not fall back to materialization',
    );

    await expectNoBoundedBasisFailure({
      read: readNodeProperty(graph.worldline(), CHECKPOINT_NODE_ID, PROPERTY_KEY),
      graphName,
      opticKind: 'node-property',
      target: { nodeId: CHECKPOINT_NODE_ID, propertyKey: PROPERTY_KEY },
      cause: 'tail-property-value-needs-parser',
    });
    expect(materializeGraph).not.toHaveBeenCalled();
  });

  it('requires tail budget failures to expose structured context without materialization', async () => {
    const graphName = 'v17-optic-tail-budget-red';
    const graph = await openGraphWithIndexedCheckpoint(graphName);
    mockTailBudgetExceeded(graph);
    const materializeGraph = spyMaterializeGraphFailure(
      graph,
      'tail budget exceeded must not fall back to materialization',
    );

    await expectTailBudgetExceededFailure({
      read: readNode(graph.worldline(), CHECKPOINT_NODE_ID),
      graphName,
      opticKind: 'node',
      target: { nodeId: CHECKPOINT_NODE_ID },
    });
    expect(materializeGraph).not.toHaveBeenCalled();
  });

  it('requires unavailable checkpoint property shards to fail closed without materialization', async () => {
    const graphName = 'v17-optic-prop-shard-missing-red';
    const graph = await openGraphWithIndexedCheckpoint(graphName);
    await makeCheckpointPropertyShardUnavailable(graph, CHECKPOINT_NODE_ID);
    const materializeGraph = spyMaterializeGraphFailure(
      graph,
      'unavailable checkpoint property shard must not fall back to materialization',
    );

    await expectShardUnavailableFailure({
      read: readNodeProperty(graph.worldline(), CHECKPOINT_NODE_ID, PROPERTY_KEY),
      graphName,
      opticKind: 'node-property',
      target: { nodeId: CHECKPOINT_NODE_ID, propertyKey: PROPERTY_KEY },
    });
    expect(materializeGraph).not.toHaveBeenCalled();
  });

  it('requires invalid checkpoint property shards to fail closed without materialization', async () => {
    const graphName = 'v17-optic-prop-shard-invalid-red';
    const graph = await openGraphWithIndexedCheckpoint(graphName);
    await makeCheckpointPropertyShardInvalid(graph, CHECKPOINT_NODE_ID);
    const materializeGraph = spyMaterializeGraphFailure(
      graph,
      'invalid checkpoint property shard must not fall back to materialization',
    );

    await expectNoBoundedBasisFailure({
      read: readNodeProperty(graph.worldline(), CHECKPOINT_NODE_ID, PROPERTY_KEY),
      graphName,
      opticKind: 'node-property',
      target: { nodeId: CHECKPOINT_NODE_ID, propertyKey: PROPERTY_KEY },
      cause: 'checkpoint-shard-invalid',
    });
    expect(materializeGraph).not.toHaveBeenCalled();
  });

  it('keeps checkpoint tail semantics causal rather than scalar', () => {
    const deliveryPlan = collapseWhitespace(readRepoFile(DELIVERY_PLAN_PATH));

    expect(deliveryPlan).toContain('live suffix scan after that checkpoint frontier');
    expect(deliveryPlan).toContain('across all relevant writers and lanes');
    expect(deliveryPlan).toContain('all lane and writer suffixes not covered by the checkpoint frontier');
    expect(deliveryPlan).toContain('Do not assume one writer, one lane, or one scalar tail.');
  });
});
