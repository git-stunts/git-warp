import { describe, expect, it } from 'vitest';
import V17CheckpointIndexTreeFixture from './fixtures/V17CheckpointIndexTreeFixture.ts';
import V17CheckpointNodeLivenessShardFixture from './fixtures/V17CheckpointNodeLivenessShardFixture.ts';
import V17CheckpointPropertyShardFixture from './fixtures/V17CheckpointPropertyShardFixture.ts';
import {
  CHECKPOINT_NODE_ID,
  CHECKPOINT_PROPERTY_VALUE,
  MISSING_NODE_ID,
  PROPERTY_KEY,
  TAIL_PROPERTY_VALUE,
  UNSUPPORTED_TAIL_PROPERTY_VALUE,
} from './fixtures/V17CheckpointTailOpticFixtureData.ts';
import V17CheckpointTailOpticGraphFixture from './fixtures/V17CheckpointTailOpticGraphFixture.ts';
import V17MaterializationFallbackTrap from './fixtures/V17MaterializationFallbackTrap.ts';
import V17OpticFailureExpectations from './fixtures/V17OpticFailureExpectations.ts';
import V17PublicOpticReadPath from './fixtures/V17PublicOpticReadPath.ts';
import V17TailBudgetExceededFixture from './fixtures/V17TailBudgetExceededFixture.ts';

const failures = new V17OpticFailureExpectations();

describe('v17 checkpoint-tail optic read basis', () => {
  it('requires exact node optic reads to avoid _materializeGraph()', async () => {
    const fixture = await V17CheckpointTailOpticGraphFixture.openIndexedCheckpoint('v17-optic-node-red');
    const graph = fixture.graph;
    await graph.patch((patch) => {
      patch.setProperty(CHECKPOINT_NODE_ID, 'ignoredByNodeRead', 'not a liveness fact');
    });
    const materialization = new V17MaterializationFallbackTrap(
      graph,
      'worldline optic node read must not full-materialize',
    );
    const readPath = new V17PublicOpticReadPath(graph.worldline());

    const result = await readPath.readNode(CHECKPOINT_NODE_ID);

    materialization.expectUnused();
    failures.expectReadIdentity(result);
    expect(result).toMatchObject({
      nodeId: CHECKPOINT_NODE_ID,
      alive: true,
    });
    failures.expectTailWitnessCount(result, 0);
  });

  it('requires property optic reads to fold live tail without _materializeGraph()', async () => {
    const fixture = await V17CheckpointTailOpticGraphFixture.openIndexedCheckpoint('v17-optic-prop-red');
    const graph = fixture.graph;
    await graph.patch((patch) => {
      patch.setProperty(CHECKPOINT_NODE_ID, PROPERTY_KEY, TAIL_PROPERTY_VALUE);
    });
    const materialization = new V17MaterializationFallbackTrap(
      graph,
      'worldline optic property read must not full-materialize',
    );
    const readPath = new V17PublicOpticReadPath(graph.worldline());

    const result = await readPath.readNodeProperty(CHECKPOINT_NODE_ID, PROPERTY_KEY);

    materialization.expectUnused();
    failures.expectReadIdentity(result);
    expect(result).toMatchObject({
      nodeId: CHECKPOINT_NODE_ID,
      key: PROPERTY_KEY,
      value: TAIL_PROPERTY_VALUE,
    });
    failures.expectTailWitnessCount(result, 1);
  });

  it('requires missing bounded basis to fail closed without materialization', async () => {
    const graphName = 'v17-optic-no-basis-red';
    const fixture = await V17CheckpointTailOpticGraphFixture.openEmpty(graphName);
    const graph = fixture.graph;
    const materialization = new V17MaterializationFallbackTrap(
      graph,
      'missing bounded basis must not fall back to materialization',
    );
    const readPath = new V17PublicOpticReadPath(graph.worldline());

    await failures.expectNoBoundedBasisFailure({
      read: readPath.readNode(MISSING_NODE_ID),
      graphName,
      opticKind: 'node',
      target: { nodeId: MISSING_NODE_ID },
      cause: 'missing-checkpoint',
    });
    materialization.expectUnused();
  });

  it('requires schema:5 checkpoints without index shards to fail closed without materialization', async () => {
    const graphName = 'v17-optic-missing-index-shards-red';
    const fixture = await V17CheckpointTailOpticGraphFixture.openIndexedCheckpoint(graphName);
    const graph = fixture.graph;
    const indexTree = await V17CheckpointIndexTreeFixture.load(graph);
    await indexTree.replaceWithEmptyIndexTree();
    const materialization = new V17MaterializationFallbackTrap(
      graph,
      'schema:5 checkpoint without index shards must not fall back to materialization',
    );
    const readPath = new V17PublicOpticReadPath(graph.worldline());

    await failures.expectNoBoundedBasisFailure({
      read: readPath.readNode(CHECKPOINT_NODE_ID),
      graphName,
      opticKind: 'node',
      target: { nodeId: CHECKPOINT_NODE_ID },
      cause: 'checkpoint-missing-index-shards',
    });
    materialization.expectUnused();
  });

  it('requires tail node removes to fail closed without materialization', async () => {
    const graphName = 'v17-optic-node-remove-tail-red';
    const fixture = await V17CheckpointTailOpticGraphFixture.openIndexedCheckpoint(graphName);
    const graph = fixture.graph;
    await graph.patch((patch) => {
      patch.removeNode(CHECKPOINT_NODE_ID);
    });
    const materialization = new V17MaterializationFallbackTrap(
      graph,
      'tail node remove must not fall back to materialization',
    );
    const readPath = new V17PublicOpticReadPath(graph.worldline());

    await failures.expectNoBoundedBasisFailure({
      read: readPath.readNode(CHECKPOINT_NODE_ID),
      graphName,
      opticKind: 'node',
      target: { nodeId: CHECKPOINT_NODE_ID },
      cause: 'tail-node-remove-needs-raw-liveness-witnesses',
    });
    materialization.expectUnused();
  });

  it('requires unsupported tail property values to fail closed without materialization', async () => {
    const graphName = 'v17-optic-prop-object-tail-red';
    const fixture = await V17CheckpointTailOpticGraphFixture.openIndexedCheckpoint(graphName);
    const graph = fixture.graph;
    await graph.patch((patch) => {
      patch.setProperty(CHECKPOINT_NODE_ID, PROPERTY_KEY, UNSUPPORTED_TAIL_PROPERTY_VALUE);
    });
    const materialization = new V17MaterializationFallbackTrap(
      graph,
      'unsupported tail property value must not fall back to materialization',
    );
    const readPath = new V17PublicOpticReadPath(graph.worldline());

    await failures.expectNoBoundedBasisFailure({
      read: readPath.readNodeProperty(CHECKPOINT_NODE_ID, PROPERTY_KEY),
      graphName,
      opticKind: 'node-property',
      target: { nodeId: CHECKPOINT_NODE_ID, propertyKey: PROPERTY_KEY },
      cause: 'tail-property-value-needs-parser',
    });
    materialization.expectUnused();
  });

  it('requires tail budget failures to expose structured context without materialization', async () => {
    const graphName = 'v17-optic-tail-budget-red';
    const fixture = await V17CheckpointTailOpticGraphFixture.openIndexedCheckpoint(graphName);
    const graph = fixture.graph;
    new V17TailBudgetExceededFixture(graph);
    const materialization = new V17MaterializationFallbackTrap(
      graph,
      'tail budget exceeded must not fall back to materialization',
    );
    const readPath = new V17PublicOpticReadPath(graph.worldline());

    await failures.expectTailBudgetExceededFailure({
      read: readPath.readNode(CHECKPOINT_NODE_ID),
      graphName,
      opticKind: 'node',
      target: { nodeId: CHECKPOINT_NODE_ID },
    });
    materialization.expectUnused();
  });

  it('requires unavailable checkpoint property shards to fail closed without materialization', async () => {
    const graphName = 'v17-optic-prop-shard-missing-red';
    const fixture = await V17CheckpointTailOpticGraphFixture.openIndexedCheckpoint(graphName);
    const graph = fixture.graph;
    const propertyShard = await V17CheckpointPropertyShardFixture.forNode(graph, CHECKPOINT_NODE_ID);
    propertyShard.makeUnavailable();
    const materialization = new V17MaterializationFallbackTrap(
      graph,
      'unavailable checkpoint property shard must not fall back to materialization',
    );
    const readPath = new V17PublicOpticReadPath(graph.worldline());

    await failures.expectShardUnavailableFailure({
      read: readPath.readNodeProperty(CHECKPOINT_NODE_ID, PROPERTY_KEY),
      graphName,
      opticKind: 'node-property',
      target: { nodeId: CHECKPOINT_NODE_ID, propertyKey: PROPERTY_KEY },
    });
    materialization.expectUnused();
  });

  it('requires invalid checkpoint property shards to fail closed without materialization', async () => {
    const graphName = 'v17-optic-prop-shard-invalid-red';
    const fixture = await V17CheckpointTailOpticGraphFixture.openIndexedCheckpoint(graphName);
    const graph = fixture.graph;
    const propertyShard = await V17CheckpointPropertyShardFixture.forNode(graph, CHECKPOINT_NODE_ID);
    propertyShard.makeInvalid();
    const materialization = new V17MaterializationFallbackTrap(
      graph,
      'invalid checkpoint property shard must not fall back to materialization',
    );
    const readPath = new V17PublicOpticReadPath(graph.worldline());

    await failures.expectNoBoundedBasisFailure({
      read: readPath.readNodeProperty(CHECKPOINT_NODE_ID, PROPERTY_KEY),
      graphName,
      opticKind: 'node-property',
      target: { nodeId: CHECKPOINT_NODE_ID, propertyKey: PROPERTY_KEY },
      cause: 'checkpoint-shard-invalid',
    });
    materialization.expectUnused();
  });

  it('requires unavailable checkpoint node liveness shards to fail closed without materialization', async () => {
    const graphName = 'v17-optic-node-shard-missing-red';
    const fixture = await V17CheckpointTailOpticGraphFixture.openIndexedCheckpoint(graphName);
    const graph = fixture.graph;
    const nodeLivenessShard = await V17CheckpointNodeLivenessShardFixture.forNode(graph, CHECKPOINT_NODE_ID);
    nodeLivenessShard.makeUnavailable();
    const materialization = new V17MaterializationFallbackTrap(
      graph,
      'unavailable checkpoint node liveness shard must not fall back to materialization',
    );
    const readPath = new V17PublicOpticReadPath(graph.worldline());

    await failures.expectShardUnavailableFailure({
      read: readPath.readNode(CHECKPOINT_NODE_ID),
      graphName,
      opticKind: 'node',
      target: { nodeId: CHECKPOINT_NODE_ID },
    });
    materialization.expectUnused();
  });

  it('requires invalid checkpoint node liveness shards to fail closed without materialization', async () => {
    const graphName = 'v17-optic-node-shard-invalid-red';
    const fixture = await V17CheckpointTailOpticGraphFixture.openIndexedCheckpoint(graphName);
    const graph = fixture.graph;
    const nodeLivenessShard = await V17CheckpointNodeLivenessShardFixture.forNode(graph, CHECKPOINT_NODE_ID);
    nodeLivenessShard.makeInvalid();
    const materialization = new V17MaterializationFallbackTrap(
      graph,
      'invalid checkpoint node liveness shard must not fall back to materialization',
    );
    const readPath = new V17PublicOpticReadPath(graph.worldline());

    await failures.expectNoBoundedBasisFailure({
      read: readPath.readNode(CHECKPOINT_NODE_ID),
      graphName,
      opticKind: 'node',
      target: { nodeId: CHECKPOINT_NODE_ID },
      cause: 'checkpoint-shard-invalid',
    });
    materialization.expectUnused();
  });
});
