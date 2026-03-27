import { describe, it, expect, beforeEach, vi } from 'vitest';
import WarpRuntime from '../../../src/domain/WarpRuntime.js';
import { encodeEdgePropKey } from '../../../src/domain/services/JoinReducer.js';
import { createStateBuilder } from '../../helpers/stateBuilder.js';

// =============================================================================

describe('WarpRuntime edge property visibility (WT/VIS/1)', () => {
  /** @type {any} */
  let mockPersistence;
  /** @type {any} */
  let graph;

  beforeEach(async () => {
    mockPersistence = {
      readRef: vi.fn().mockResolvedValue(null),
      listRefs: vi.fn().mockResolvedValue([]),
      updateRef: vi.fn().mockResolvedValue(undefined),
      configGet: vi.fn().mockResolvedValue(null),
      configSet: vi.fn().mockResolvedValue(undefined),
    };

    graph = await WarpRuntime.open({
      persistence: mockPersistence,
      graphName: 'test',
      writerId: 'writer-1',
    });
  });

  // ===========================================================================
  // Dead-edge visibility gating
  // ===========================================================================

  it('add edge with props -> remove edge -> props invisible via getEdges()', async () => {
    createStateBuilder()
      .node('a', { counter: 1 })
      .node('b', { counter: 2 })
      .edge('a', 'b', 'rel', { counter: 3, lamport: 1 })
      .edgeProp('a', 'b', 'rel', 'weight', 42, { lamport: 1 })
      .removeEdge('a', 'b', 'rel', { observed: [{ writerId: 'w1', counter: 3 }] })
      .seedGraph(graph);

    const edges = await graph.getEdges();
    // Edge is dead, so it should not appear at all
    expect(edges).toEqual([]);
  });

  it('add edge with props -> remove edge -> getEdgeProps returns null', async () => {
    createStateBuilder()
      .node('a', { counter: 1 })
      .node('b', { counter: 2 })
      .edge('a', 'b', 'rel', { counter: 3, lamport: 1 })
      .edgeProp('a', 'b', 'rel', 'weight', 42, { lamport: 1 })
      .removeEdge('a', 'b', 'rel', { observed: [{ writerId: 'w1', counter: 3 }] })
      .seedGraph(graph);

    const props = await graph.getEdgeProps('a', 'b', 'rel');
    expect(props).toBeNull();
  });

  // ===========================================================================
  // Clean-slate on re-add
  // ===========================================================================

  it('add edge with props -> remove edge -> re-add edge -> props are empty (clean slate)', async () => {
    createStateBuilder()
      .node('a', { counter: 1 })
      .node('b', { counter: 2 })
      .edge('a', 'b', 'rel', { counter: 3, lamport: 1 })
      .edgeProp('a', 'b', 'rel', 'weight', 42, { lamport: 1 })
      .removeEdge('a', 'b', 'rel', { observed: [{ writerId: 'w1', counter: 3 }] })
      .edge('a', 'b', 'rel', { counter: 4, lamport: 3 })
      .seedGraph(graph);

    // getEdgeProps should return empty object (clean slate — old prop is stale)
    const props = await graph.getEdgeProps('a', 'b', 'rel');
    expect(props).toEqual({});

    // getEdges should also return empty props
    const edges = await graph.getEdges();
    expect(edges).toHaveLength(1);
    expect(edges[0].props).toEqual({});
  });

  it('add edge with props -> remove -> re-add -> set new props -> new props visible', async () => {
    createStateBuilder()
      .node('a', { counter: 1 })
      .node('b', { counter: 2 })
      .edge('a', 'b', 'rel', { counter: 3, lamport: 1 })
      .edgeProp('a', 'b', 'rel', 'weight', 42, { lamport: 1 })
      .removeEdge('a', 'b', 'rel', { observed: [{ writerId: 'w1', counter: 3 }] })
      .edge('a', 'b', 'rel', { counter: 4, lamport: 3 })
      .edgeProp('a', 'b', 'rel', 'color', 'red', { lamport: 3 })
      .seedGraph(graph);

    const props = await graph.getEdgeProps('a', 'b', 'rel');
    // Old prop "weight" is filtered out (lamport 1 < birthLamport 3)
    // New prop "color" is visible (lamport 3 >= birthLamport 3)
    expect(props).toEqual({ color: 'red' });

    const edges = await graph.getEdges();
    expect(edges).toHaveLength(1);
    expect(edges[0].props).toEqual({ color: 'red' });
  });

  // ===========================================================================
  // Concurrent two-writer scenarios
  // ===========================================================================

  it('concurrent add and remove with props (two writers)', async () => {
    createStateBuilder()
      .node('a', { counter: 1 })
      .node('b', { counter: 2 })
      .edge('a', 'b', 'rel', { writerId: 'w1', counter: 3, lamport: 1 })
      .edgeProp('a', 'b', 'rel', 'weight', 42, { writerId: 'w1', lamport: 1 })
      .edge('a', 'b', 'rel', { writerId: 'w2', counter: 1, lamport: 1 })
      .removeEdge('a', 'b', 'rel', { observed: [{ writerId: 'w1', counter: 3 }] })
      .seedGraph(graph);

    // Edge is still alive because w2's dot is not tombstoned (OR-set add wins)
    const props = await graph.getEdgeProps('a', 'b', 'rel');
    expect(props).not.toBeNull();
    // Birth EventId is w2's (w2 > w1 lexicographically at same lamport).
    // Prop was set by w1 at lamport 1, which compares < w2's birth EventId,
    // so the prop is correctly filtered as stale.
    expect(props).toEqual({});
  });

  it('concurrent add+props from two writers, one removes, re-adds -> clean slate for old props', async () => {
    createStateBuilder()
      .node('a', { counter: 1 })
      .node('b', { counter: 2 })
      .edge('a', 'b', 'rel', { writerId: 'w1', counter: 3, lamport: 1 })
      .edgeProp('a', 'b', 'rel', 'weight', 42, { writerId: 'w1', lamport: 1 })
      .removeEdge('a', 'b', 'rel', { observed: [{ writerId: 'w1', counter: 3 }] })
      .edge('a', 'b', 'rel', { writerId: 'w1', counter: 4, lamport: 5 })
      .edgeProp('a', 'b', 'rel', 'color', 'blue', { writerId: 'w2', lamport: 6 })
      .seedGraph(graph);

    const props = await graph.getEdgeProps('a', 'b', 'rel');
    // "weight" was set at lamport 1, birthLamport is 5 → filtered out
    // "color" was set at lamport 6 >= 5 → visible
    expect(props).toEqual({ color: 'blue' });
  });

  // ===========================================================================
  // Edge without props
  // ===========================================================================

  it('edge without props -> remove -> re-add -> still no props', async () => {
    createStateBuilder()
      .node('a', { counter: 1 })
      .node('b', { counter: 2 })
      .edge('a', 'b', 'rel', { counter: 3, lamport: 1 })
      .removeEdge('a', 'b', 'rel', { observed: [{ writerId: 'w1', counter: 3 }] })
      .edge('a', 'b', 'rel', { counter: 4, lamport: 2 })
      .seedGraph(graph);

    const props = await graph.getEdgeProps('a', 'b', 'rel');
    expect(props).toEqual({});

    const edges = await graph.getEdges();
    expect(edges).toHaveLength(1);
    expect(edges[0].props).toEqual({});
  });

  // ===========================================================================
  // Property data remains in prop map (not purged)
  // ===========================================================================

  it('stale props remain in the prop map but are not surfaced', async () => {
    createStateBuilder()
      .node('a', { counter: 1 })
      .node('b', { counter: 2 })
      .edge('a', 'b', 'rel', { counter: 3, lamport: 1 })
      .edgeProp('a', 'b', 'rel', 'weight', 42, { lamport: 1 })
      .removeEdge('a', 'b', 'rel', { observed: [{ writerId: 'w1', counter: 3 }] })
      .edge('a', 'b', 'rel', { counter: 4, lamport: 3 })
      .seedGraph(graph);

    // The prop is still in the map (not physically deleted)
    const propKey = encodeEdgePropKey('a', 'b', 'rel', 'weight');
    expect(/** @type {any} */ (graph)._cachedState.prop.has(propKey)).toBeTruthy();

    // But it is not surfaced via getEdgeProps
    const props = await graph.getEdgeProps('a', 'b', 'rel');
    expect(props).toEqual({});
  });

  // ===========================================================================
  // Alive edge props are still visible (regression guard)
  // ===========================================================================

  it('props on a live edge with matching lamport are visible', async () => {
    createStateBuilder()
      .node('a', { counter: 1 })
      .node('b', { counter: 2 })
      .edge('a', 'b', 'rel', { counter: 3, lamport: 5 })
      .edgeProp('a', 'b', 'rel', 'weight', 99, { lamport: 5 })
      .seedGraph(graph);

    const props = await graph.getEdgeProps('a', 'b', 'rel');
    expect(props).toEqual({ weight: 99 });

    const edges = await graph.getEdges();
    expect(edges[0].props).toEqual({ weight: 99 });
  });

  it('props on a live edge with higher lamport are visible', async () => {
    createStateBuilder()
      .node('a', { counter: 1 })
      .node('b', { counter: 2 })
      .edge('a', 'b', 'rel', { counter: 3, lamport: 1 })
      .edgeProp('a', 'b', 'rel', 'weight', 99, { lamport: 5 })
      .seedGraph(graph);

    const props = await graph.getEdgeProps('a', 'b', 'rel');
    expect(props).toEqual({ weight: 99 });
  });
});
