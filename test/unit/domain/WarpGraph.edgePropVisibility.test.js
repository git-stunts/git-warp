import { describe, it, expect, beforeEach, vi } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import {
  createEmptyStateV5,
  encodeEdgeKey,
  encodeEdgePropKey,
} from '../../../src/domain/services/JoinReducer.js';
import { compareEventIds } from '../../../src/domain/utils/EventId.js';
import { orsetAdd, orsetRemove } from '../../../src/domain/crdt/ORSet.js';
import { createDot, encodeDot } from '../../../src/domain/crdt/Dot.js';

/**
 * Seeds a WarpGraph instance with a fresh empty V5 state and runs seedFn to populate it.
 * Replaces materialize with a no-op mock so tests exercise query methods directly.
 */
function setupGraphState(graph, seedFn) {
  const state = createEmptyStateV5();
  graph._cachedState = state;
  graph.materialize = vi.fn().mockResolvedValue(state);
  seedFn(state);
}

/** Adds a node to the ORSet with a dot at the given counter. */
function addNode(state, nodeId, writerId, counter) {
  orsetAdd(state.nodeAlive, nodeId, createDot(writerId, counter));
}

/** Adds an edge to the ORSet and records its birth event. */
function addEdge(state, from, to, label, writerId, counter, lamport) {
  const edgeKey = encodeEdgeKey(from, to, label);
  orsetAdd(state.edgeAlive, edgeKey, createDot(writerId, counter));
  // Record birth event using full EventId comparison (same as applyOpV2)
  const newEvent = { lamport, writerId, patchSha: 'aabbccdd', opIndex: 0 };
  const prev = state.edgeBirthEvent.get(edgeKey);
  if (!prev || compareEventIds(newEvent, prev) > 0) {
    state.edgeBirthEvent.set(edgeKey, newEvent);
  }
}

/** Removes an edge by tombstoning its observed dots. */
function removeEdge(state, from, to, label, writerId, counter) {
  const dot = encodeDot(createDot(writerId, counter));
  orsetRemove(state.edgeAlive, new Set([dot]));
}

/** Sets an edge property with a proper LWW register (eventId + value). */
function setEdgeProp(state, from, to, label, key, value, lamport, writerId, patchSha, opIndex) {
  const propKey = encodeEdgePropKey(from, to, label, key);
  state.prop.set(propKey, {
    eventId: { lamport, writerId, patchSha: patchSha || 'aabbccdd', opIndex: opIndex || 0 },
    value,
  });
}

// =============================================================================

describe('WarpGraph edge property visibility (WT/VIS/1)', () => {
  let mockPersistence;
  let graph;

  beforeEach(async () => {
    mockPersistence = {
      readRef: vi.fn().mockResolvedValue(null),
      listRefs: vi.fn().mockResolvedValue([]),
      updateRef: vi.fn().mockResolvedValue(),
      configGet: vi.fn().mockResolvedValue(null),
      configSet: vi.fn().mockResolvedValue(),
    };

    graph = await WarpGraph.open({
      persistence: mockPersistence,
      graphName: 'test',
      writerId: 'writer-1',
    });
  });

  // ===========================================================================
  // Dead-edge visibility gating
  // ===========================================================================

  it('add edge with props -> remove edge -> props invisible via getEdges()', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'a', 'w1', 1);
      addNode(state, 'b', 'w1', 2);
      // Edge added at lamport 1, counter 3
      addEdge(state, 'a', 'b', 'rel', 'w1', 3, 1);
      // Prop set at lamport 1
      setEdgeProp(state, 'a', 'b', 'rel', 'weight', 42, 1, 'w1');
      // Remove the edge (tombstone the dot)
      removeEdge(state, 'a', 'b', 'rel', 'w1', 3);
    });

    const edges = await graph.getEdges();
    // Edge is dead, so it should not appear at all
    expect(edges).toEqual([]);
  });

  it('add edge with props -> remove edge -> getEdgeProps returns null', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'a', 'w1', 1);
      addNode(state, 'b', 'w1', 2);
      addEdge(state, 'a', 'b', 'rel', 'w1', 3, 1);
      setEdgeProp(state, 'a', 'b', 'rel', 'weight', 42, 1, 'w1');
      removeEdge(state, 'a', 'b', 'rel', 'w1', 3);
    });

    const props = await graph.getEdgeProps('a', 'b', 'rel');
    expect(props).toBeNull();
  });

  // ===========================================================================
  // Clean-slate on re-add
  // ===========================================================================

  it('add edge with props -> remove edge -> re-add edge -> props are empty (clean slate)', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'a', 'w1', 1);
      addNode(state, 'b', 'w1', 2);
      // First incarnation: add at lamport 1
      addEdge(state, 'a', 'b', 'rel', 'w1', 3, 1);
      // Set prop during first incarnation (lamport 1)
      setEdgeProp(state, 'a', 'b', 'rel', 'weight', 42, 1, 'w1');
      // Remove edge (tombstone dot w1:3)
      removeEdge(state, 'a', 'b', 'rel', 'w1', 3);
      // Re-add edge at lamport 3 (later), new dot w1:4
      addEdge(state, 'a', 'b', 'rel', 'w1', 4, 3);
    });

    // getEdgeProps should return empty object (clean slate — old prop is stale)
    const props = await graph.getEdgeProps('a', 'b', 'rel');
    expect(props).toEqual({});

    // getEdges should also return empty props
    const edges = await graph.getEdges();
    expect(edges).toHaveLength(1);
    expect(edges[0].props).toEqual({});
  });

  it('add edge with props -> remove -> re-add -> set new props -> new props visible', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'a', 'w1', 1);
      addNode(state, 'b', 'w1', 2);
      // First incarnation at lamport 1
      addEdge(state, 'a', 'b', 'rel', 'w1', 3, 1);
      setEdgeProp(state, 'a', 'b', 'rel', 'weight', 42, 1, 'w1');
      // Remove
      removeEdge(state, 'a', 'b', 'rel', 'w1', 3);
      // Re-add at lamport 3
      addEdge(state, 'a', 'b', 'rel', 'w1', 4, 3);
      // Set NEW prop at lamport 3 (during new incarnation)
      setEdgeProp(state, 'a', 'b', 'rel', 'color', 'red', 3, 'w1');
    });

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
    setupGraphState(graph, (state) => {
      addNode(state, 'a', 'w1', 1);
      addNode(state, 'b', 'w1', 2);
      // Writer 1 adds edge at lamport 1
      addEdge(state, 'a', 'b', 'rel', 'w1', 3, 1);
      setEdgeProp(state, 'a', 'b', 'rel', 'weight', 42, 1, 'w1');
      // Writer 2 concurrently adds the same edge at lamport 1
      addEdge(state, 'a', 'b', 'rel', 'w2', 1, 1);
      // Writer 1 removes (only tombstones w1:3, NOT w2:1)
      removeEdge(state, 'a', 'b', 'rel', 'w1', 3);
    });

    // Edge is still alive because w2's dot is not tombstoned (OR-set add wins)
    const props = await graph.getEdgeProps('a', 'b', 'rel');
    expect(props).not.toBeNull();
    // Birth EventId is w2's (w2 > w1 lexicographically at same lamport).
    // Prop was set by w1 at lamport 1, which compares < w2's birth EventId,
    // so the prop is correctly filtered as stale.
    expect(props).toEqual({});
  });

  it('concurrent add+props from two writers, one removes, re-adds -> clean slate for old props', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'a', 'w1', 1);
      addNode(state, 'b', 'w1', 2);
      // Writer 1 adds edge at lamport 1
      addEdge(state, 'a', 'b', 'rel', 'w1', 3, 1);
      setEdgeProp(state, 'a', 'b', 'rel', 'weight', 42, 1, 'w1');
      // Writer 1 removes (tombstone w1:3)
      removeEdge(state, 'a', 'b', 'rel', 'w1', 3);
      // Writer 1 re-adds at lamport 5
      addEdge(state, 'a', 'b', 'rel', 'w1', 4, 5);
      // Writer 2 sets a new prop at lamport 6 (after the re-add)
      setEdgeProp(state, 'a', 'b', 'rel', 'color', 'blue', 6, 'w2');
    });

    const props = await graph.getEdgeProps('a', 'b', 'rel');
    // "weight" was set at lamport 1, birthLamport is 5 → filtered out
    // "color" was set at lamport 6 >= 5 → visible
    expect(props).toEqual({ color: 'blue' });
  });

  // ===========================================================================
  // Edge without props
  // ===========================================================================

  it('edge without props -> remove -> re-add -> still no props', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'a', 'w1', 1);
      addNode(state, 'b', 'w1', 2);
      // Add edge without props
      addEdge(state, 'a', 'b', 'rel', 'w1', 3, 1);
      // Remove
      removeEdge(state, 'a', 'b', 'rel', 'w1', 3);
      // Re-add
      addEdge(state, 'a', 'b', 'rel', 'w1', 4, 2);
    });

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
    setupGraphState(graph, (state) => {
      addNode(state, 'a', 'w1', 1);
      addNode(state, 'b', 'w1', 2);
      // Add edge, set prop, remove, re-add
      addEdge(state, 'a', 'b', 'rel', 'w1', 3, 1);
      setEdgeProp(state, 'a', 'b', 'rel', 'weight', 42, 1, 'w1');
      removeEdge(state, 'a', 'b', 'rel', 'w1', 3);
      addEdge(state, 'a', 'b', 'rel', 'w1', 4, 3);
    });

    // The prop is still in the map (not physically deleted)
    const propKey = encodeEdgePropKey('a', 'b', 'rel', 'weight');
    expect(graph._cachedState.prop.has(propKey)).toBeTruthy();

    // But it is not surfaced via getEdgeProps
    const props = await graph.getEdgeProps('a', 'b', 'rel');
    expect(props).toEqual({});
  });

  // ===========================================================================
  // Alive edge props are still visible (regression guard)
  // ===========================================================================

  it('props on a live edge with matching lamport are visible', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'a', 'w1', 1);
      addNode(state, 'b', 'w1', 2);
      addEdge(state, 'a', 'b', 'rel', 'w1', 3, 5);
      // Prop set at same lamport as edge birth
      setEdgeProp(state, 'a', 'b', 'rel', 'weight', 99, 5, 'w1');
    });

    const props = await graph.getEdgeProps('a', 'b', 'rel');
    expect(props).toEqual({ weight: 99 });

    const edges = await graph.getEdges();
    expect(edges[0].props).toEqual({ weight: 99 });
  });

  it('props on a live edge with higher lamport are visible', async () => {
    setupGraphState(graph, (state) => {
      addNode(state, 'a', 'w1', 1);
      addNode(state, 'b', 'w1', 2);
      addEdge(state, 'a', 'b', 'rel', 'w1', 3, 1);
      // Prop set at lamport 5, greater than birth lamport 1
      setEdgeProp(state, 'a', 'b', 'rel', 'weight', 99, 5, 'w1');
    });

    const props = await graph.getEdgeProps('a', 'b', 'rel');
    expect(props).toEqual({ weight: 99 });
  });
});
