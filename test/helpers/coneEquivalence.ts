import { expect } from 'vitest';
import type ConeRecordStorePort from '../../src/ports/ConeRecordStorePort.ts';
import { CONE_ADJACENCY_PAGE_SIZE } from '../../src/domain/services/cone/ConeAdjacencyPage.ts';
import ConeReader from '../../src/domain/services/cone/ConeReader.ts';
import type { ConeDirection } from '../../src/domain/services/cone/ConeRecordKey.ts';
import type ConeRoot from '../../src/domain/services/cone/ConeRoot.ts';
import { decodeEdgeKey } from '../../src/domain/services/KeyCodec.ts';
import { createStateReader } from '../../src/domain/services/state/StateReader.ts';
import type WarpState from '../../src/domain/services/state/WarpState.ts';
import type { VisibleNodeView } from '../../src/domain/types/VisibleNodeView.ts';
import type { VisibleStateReader } from '../../src/domain/types/VisibleStateReader.ts';

/** The element universe a cone is compared over. */
export type ConeUniverse = { readonly seed: number; readonly nodeIds: readonly string[]; readonly edgeKeys: readonly string[] };

function normalizedView(view: VisibleNodeView | null): VisibleNodeView | null {
  if (view === null) {
    return null;
  }
  const order = (left: { nodeId: string; label: string }, right: { nodeId: string; label: string }): number =>
    `${left.nodeId}\0${left.label}`.localeCompare(`${right.nodeId}\0${right.label}`);
  return { ...view, outgoing: [...view.outgoing].sort(order), incoming: [...view.incoming].sort(order) };
}

/**
 * Compares liveness, properties and neighbourhood of every entity in the
 * universe between a full reduction and a cone. Returns the entities compared.
 */
export async function assertConeEquivalent(history: ConeUniverse, full: WarpState, cone: { store: ConeRecordStorePort; root: ConeRoot }): Promise<number> {
  const fullReader: VisibleStateReader = createStateReader(full);
  const reader = new ConeReader(cone.store);
  for (const nodeId of history.nodeIds) {
    const record = await reader.node(cone.root, nodeId);
    expect(record.isAlive(), `node ${nodeId} liveness, seed ${history.seed}`).toBe(full.nodeAlive.contains(nodeId));
    const neighbourhood = await reader.neighbourhood(cone.root, nodeId);
    expect(neighbourhood.hasNode(nodeId)).toBe(fullReader.hasNode(nodeId));
    const fullView = fullReader.inspectNode(nodeId);
    expect(normalizedView(neighbourhood.inspectNode(nodeId)), `node ${nodeId} view, seed ${history.seed}`).toEqual(normalizedView(fullView));
    for (const neighbour of fullView?.outgoing ?? []) {
      expect(neighbourhood.getEdgeProps(nodeId, neighbour.nodeId, neighbour.label))
        .toEqual(fullReader.getEdgeProps(nodeId, neighbour.nodeId, neighbour.label));
    }
    await assertAdjacencyComplete(reader, cone.root, { history, full, nodeId });
  }
  for (const edgeKey of history.edgeKeys) {
    expect((await reader.edge(cone.root, edgeKey)).isAlive(), `edge liveness, seed ${history.seed}`).toBe(full.edgeAlive.contains(edgeKey));
  }
  return history.nodeIds.length + history.edgeKeys.length;
}

/** Every edge the full state knows with this node as an endpoint is registered exactly once. */
async function assertAdjacencyComplete(
  reader: ConeReader,
  root: ConeRoot,
  context: { readonly history: ConeUniverse; readonly full: WarpState; readonly nodeId: string },
): Promise<void> {
  const record = await reader.node(root, context.nodeId);
  const directions: readonly ConeDirection[] = ['out', 'in'];
  for (const direction of directions) {
    const registered: string[] = [];
    for (let index = 0; index * CONE_ADJACENCY_PAGE_SIZE < record.degree(direction); index += 1) {
      registered.push(...(await reader.adjacencyPage(root, context.nodeId, { direction, index })).edgeKeys);
    }
    const expected = [...context.full.edgeAlive.entries.keys()].filter((edgeKey) => {
      const { from, to } = decodeEdgeKey(edgeKey);
      return (direction === 'out' ? from : to) === context.nodeId;
    });
    expect(new Set(registered).size).toBe(registered.length);
    for (const edgeKey of expected) {
      expect(registered).toContain(edgeKey);
    }
  }
}

