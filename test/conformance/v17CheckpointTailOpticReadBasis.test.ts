import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import InMemoryGraphAdapter from '../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import { openRuntimeHostProduct } from '../../src/domain/warp/RuntimeHostProduct.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DELIVERY_PLAN_PATH = 'docs/design/0112-v17-foundation-delivery-plan.md';
const MISSING_NODE_ID = 'node:missing';
const CHECKPOINT_NODE_ID = 'node:checkpoint-basis';
const PROPERTY_KEY = 'title';
const CHECKPOINT_PROPERTY_VALUE = 'checkpoint title';
const TAIL_PROPERTY_VALUE = 'tail title';

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ');
}

function invokeObject(receiver: object, methodName: string, args: readonly string[] = []): object {
  const method = Reflect.get(receiver, methodName);
  if (typeof method !== 'function') {
    throw new Error(`${methodName}() must exist for v17 optic RED`);
  }

  const result = method.call(receiver, ...args);
  if (typeof result !== 'object' || result === null) {
    throw new Error(`${methodName}() must return an object for v17 optic RED`);
  }

  return result;
}

async function invokePromiseObject(receiver: object, methodName: string): Promise<object> {
  const method = Reflect.get(receiver, methodName);
  if (typeof method !== 'function') {
    throw new Error(`${methodName}() must exist for v17 optic RED`);
  }

  const result = method.call(receiver);
  if (!(result instanceof Promise)) {
    throw new Error(`${methodName}() must return a Promise for v17 optic RED`);
  }

  const awaited = await result;
  if (typeof awaited !== 'object' || awaited === null) {
    throw new Error(`${methodName}() must resolve to an object for v17 optic RED`);
  }

  return awaited;
}

async function readNode(worldline: object, nodeId: string): Promise<object> {
  const optic = invokeObject(worldline, 'optic');
  const nodeScope = invokeObject(optic, 'node', [nodeId]);
  return await invokePromiseObject(nodeScope, 'read');
}

async function readNodeProperty(worldline: object, nodeId: string, propertyKey: string): Promise<object> {
  const optic = invokeObject(worldline, 'optic');
  const nodeScope = invokeObject(optic, 'node', [nodeId]);
  const propertyScope = invokeObject(nodeScope, 'prop', [propertyKey]);
  return await invokePromiseObject(propertyScope, 'read');
}

function expectReadIdentity(result: object): void {
  expect(result).toHaveProperty('readIdentity');
  expect(result).not.toHaveProperty('stateHash');
}

function expectTailWitnessCount(result: object, count: number): void {
  const readIdentity = Reflect.get(result, 'readIdentity');
  expect(Reflect.get(readIdentity, 'tailWitnesses')).toHaveLength(count);
}

async function openGraphWithIndexedCheckpoint(graphName: string) {
  const graph = await openRuntimeHostProduct({
    persistence: new InMemoryGraphAdapter(),
    graphName,
    writerId: 'reader',
  });
  await graph.patch((patch) => {
    patch.addNode(CHECKPOINT_NODE_ID);
    patch.setProperty(CHECKPOINT_NODE_ID, PROPERTY_KEY, CHECKPOINT_PROPERTY_VALUE);
  });
  await graph.materialize();
  await graph.createCheckpoint();
  return graph;
}

describe('v17 checkpoint-tail optic read basis', () => {
  it('requires exact node optic reads to avoid _materializeGraph()', async () => {
    const graph = await openGraphWithIndexedCheckpoint('v17-optic-node-red');
    await graph.patch((patch) => {
      patch.setProperty(CHECKPOINT_NODE_ID, 'ignoredByNodeRead', 'not a liveness fact');
    });
    const materializeGraph = vi.spyOn(graph, '_materializeGraph');
    materializeGraph.mockRejectedValue(
      new Error('worldline optic node read must not full-materialize'),
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
    const materializeGraph = vi.spyOn(graph, '_materializeGraph');
    materializeGraph.mockRejectedValue(
      new Error('worldline optic property read must not full-materialize'),
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
    const graph = await openRuntimeHostProduct({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'v17-optic-no-basis-red',
      writerId: 'reader',
    });
    const materializeGraph = vi.spyOn(graph, '_materializeGraph');
    materializeGraph.mockRejectedValue(
      new Error('missing bounded basis must not fall back to materialization'),
    );

    await expect(readNode(graph.worldline(), MISSING_NODE_ID))
      .rejects
      .toMatchObject({ code: 'E_OPTIC_NO_BOUNDED_BASIS' });
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
