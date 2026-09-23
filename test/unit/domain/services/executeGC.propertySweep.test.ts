/**
 * Property-sweep compaction in executeGC.
 *
 * A node or edge removal tombstones its dot in the alive OR-Set, but the
 * property registers keyed under that element stay in `WarpState.prop`
 * forever. Under churn — re-indexing a file's AST on every edit — that map
 * grows monotonically and is never reclaimed, so a long-lived process
 * ratchets heap even when a full GC runs.
 *
 * These tests pin the sweep's contract: dead elements' registers are pruned,
 * live elements' registers are untouched, and the count is reported.
 */

import { describe, it, expect } from 'vitest';
import executeGC from '../../../../src/domain/services/executeGC.ts';
import { createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import { EDGE_PROP_PREFIX, encodeEdgeKey, encodeEdgePropKey, encodePropKey } from '../../../../src/domain/services/KeyCodec.ts';
import type WarpState from '../../../../src/domain/services/state/WarpState.ts';

/** Distinct EventIds per call so LWW writes never collide on identity. */
let opCounter = 0;
function nextEventId(writerId = 'A', lamport = 1): EventId {
  opCounter += 1;
  return new EventId(lamport, writerId, 'abcdef01', opCounter);
}

/** Writes a node property register directly into state. */
function setNodeProp(state: WarpState, nodeId: string, key: string, value: string): void {
  state.mutatePropLWW(encodePropKey(nodeId, key), nextEventId(), value);
}

/** Writes an edge property register directly into state. */
function setEdgeProp(
  state: WarpState,
  from: string,
  to: string,
  label: string,
  key: string,
  value: string,
): void {
  state.mutatePropLWW(encodeEdgePropKey(from, to, label, key), nextEventId(), value);
}

/** Adds a node, then tombstones its only dot, leaving it dead. */
function addThenRemoveNode(state: WarpState, nodeId: string, dot: Dot): void {
  state.nodeAlive.add(nodeId, dot);
  state.nodeAlive.remove(new Set([encodeDot(dot)]));
}

describe('executeGC property sweep', () => {
  it('prunes property registers belonging to a dead node', () => {
    const state = createEmptyState();
    const deadDot = Dot.create('A', 1);
    addThenRemoveNode(state, 'ast:doomed', deadDot);
    setNodeProp(state, 'ast:doomed', 'type', 'identifier');
    setNodeProp(state, 'ast:doomed', 'startRow', '12');

    expect(state.propSize()).toBe(2);

    const appliedVV = VersionVector.empty();
    appliedVV.set('A', 1);
    const result = executeGC(state, appliedVV);

    expect(result.propertiesPruned).toBe(2);
    expect(state.propSize()).toBe(0);
    expect(state.hasNodeProp('ast:doomed', 'type')).toBe(false);
  });

  it('leaves property registers of a live node untouched', () => {
    const state = createEmptyState();
    state.nodeAlive.add('ast:keeper', Dot.create('A', 1));
    setNodeProp(state, 'ast:keeper', 'type', 'function_declaration');

    const appliedVV = VersionVector.empty();
    appliedVV.set('A', 1);
    const result = executeGC(state, appliedVV);

    expect(result.propertiesPruned).toBe(0);
    expect(state.getNodeProp('ast:keeper', 'type')?.value).toBe('function_declaration');
  });

  it('prunes dead nodes while preserving live ones in the same sweep', () => {
    const state = createEmptyState();
    state.nodeAlive.add('ast:keeper', Dot.create('A', 1));
    setNodeProp(state, 'ast:keeper', 'type', 'function_declaration');
    addThenRemoveNode(state, 'ast:doomed', Dot.create('A', 2));
    setNodeProp(state, 'ast:doomed', 'type', 'identifier');

    const appliedVV = VersionVector.empty();
    appliedVV.set('A', 2);
    const result = executeGC(state, appliedVV);

    expect(result.propertiesPruned).toBe(1);
    expect(state.propSize()).toBe(1);
    expect(state.hasNodeProp('ast:keeper', 'type')).toBe(true);
    expect(state.hasNodeProp('ast:doomed', 'type')).toBe(false);
  });

  it('prunes property registers belonging to a dead edge', () => {
    const state = createEmptyState();
    const edgeKey = encodeEdgeKey('file:a.ts', 'ast:root', 'contains_ast');
    const dot = Dot.create('A', 1);
    state.edgeAlive.add(edgeKey, dot);
    state.edgeAlive.remove(new Set([encodeDot(dot)]));
    setEdgeProp(state, 'file:a.ts', 'ast:root', 'contains_ast', 'weight', '1');

    const appliedVV = VersionVector.empty();
    appliedVV.set('A', 1);
    const result = executeGC(state, appliedVV);

    expect(result.propertiesPruned).toBe(1);
    expect(state.getEdgeProp('file:a.ts', 'ast:root', 'contains_ast', 'weight')).toBeUndefined();
  });

  it('leaves property registers of a live edge untouched', () => {
    const state = createEmptyState();
    const edgeKey = encodeEdgeKey('file:a.ts', 'ast:root', 'contains_ast');
    state.edgeAlive.add(edgeKey, Dot.create('A', 1));
    setEdgeProp(state, 'file:a.ts', 'ast:root', 'contains_ast', 'weight', '1');

    const appliedVV = VersionVector.empty();
    appliedVV.set('A', 1);
    const result = executeGC(state, appliedVV);

    expect(result.propertiesPruned).toBe(0);
    expect(state.getEdgeProp('file:a.ts', 'ast:root', 'contains_ast', 'weight')?.value).toBe('1');
  });

  it('retains a property whose key does not decode unambiguously', () => {
    const state = createEmptyState();
    // A live node whose id embeds the field separator, alongside a dead edge
    // with the same endpoints. The node's key decodes to a shorter, dead id,
    // so a sweep trusting that decode would delete a live node's registers.
    // The edge's key decodes cleanly and its edge is dead, so it goes.
    const from = 'file:a.ts';
    const to = 'ast:root';
    const label = 'contains_ast';
    state.nodeAlive.add(encodeEdgeKey(from, to, label), Dot.create('A', 1));
    setNodeProp(state, encodeEdgeKey(from, to, label), 'kind', 'node');

    const edgeDot = Dot.create('A', 2);
    state.edgeAlive.add(encodeEdgeKey(from, to, label), edgeDot);
    state.edgeAlive.remove(new Set([encodeDot(edgeDot)]));
    setEdgeProp(state, from, to, label, 'kind', 'edge');

    const appliedVV = VersionVector.empty();
    appliedVV.set('A', 2);
    const result = executeGC(state, appliedVV);

    expect(result.propertiesPruned).toBe(1);
    expect(state.getEdgeProp(from, to, label, 'kind')).toBeUndefined();
    expect(state.getNodeProp(encodeEdgeKey(from, to, label), 'kind')?.value).toBe('node');
  });

  it('reclaims the edge birth event of a swept edge', () => {
    const state = createEmptyState();
    const edgeKey = encodeEdgeKey('file:a.ts', 'ast:root', 'contains_ast');
    const dot = Dot.create('A', 1);
    state.edgeAlive.add(edgeKey, dot);
    state.edgeBirthEvent.set(edgeKey, nextEventId());
    state.edgeAlive.remove(new Set([encodeDot(dot)]));

    const appliedVV = VersionVector.empty();
    appliedVV.set('A', 1);
    executeGC(state, appliedVV);

    expect(state.edgeBirthEvent.has(edgeKey)).toBe(false);
  });

  it('retains a malformed edge-property key instead of aborting the sweep', () => {
    // Full-state deserialization accepts prop-map keys without validating
    // their shape, and decodeEdgePropKey throws on the wrong field count.
    // One such key must not take GC down with it.
    const state = createEmptyState();
    state.mutatePropLWW(`${EDGE_PROP_PREFIX}a\0b\0c\0d\0e`, nextEventId(), 'kept');
    const deadDot = Dot.create('A', 1);
    addThenRemoveNode(state, 'ast:doomed', deadDot);
    setNodeProp(state, 'ast:doomed', 'type', 'identifier');

    const appliedVV = VersionVector.empty();
    appliedVV.set('A', 1);

    let result!: ReturnType<typeof executeGC>;
    expect(() => { result = executeGC(state, appliedVV); }).not.toThrow();

    // The unreadable key survives; the readable dead one is still swept.
    expect(result.propertiesPruned).toBe(1);
    expect(state.hasProp(`${EDGE_PROP_PREFIX}a\0b\0c\0d\0e`)).toBe(true);
    expect(state.hasNodeProp('ast:doomed', 'type')).toBe(false);
  });

  it('surfaces a non-codec fault instead of silently skipping the sweep', () => {
    // The decode guard exists for malformed keys. A fault in the liveness
    // check itself is a bug, not data: swallowing it would report every
    // owner as alive and disable the sweep with no signal.
    const state = createEmptyState();
    setNodeProp(state, 'ast:doomed', 'type', 'identifier');
    const boom = new TypeError('alive-set fault');
    state.nodeAlive.contains = (): boolean => { throw boom; };

    expect(() => executeGC(state, VersionVector.empty())).toThrow(boom);
  });

  it('reports zero pruned properties for an empty state', () => {
    const state = createEmptyState();
    const result = executeGC(state, VersionVector.empty());
    expect(result.propertiesPruned).toBe(0);
  });

  it('bounds prop growth across repeated churn of the same element', () => {
    // The daemon's failure mode: re-index a file, removing every prior AST
    // anchor and adding fresh ones with the same seven properties each pass.
    // Without a sweep, prop grows by seven registers per generation forever.
    const state = createEmptyState();
    const appliedVV = VersionVector.empty();
    const propsPerAnchor = ['type', 'named', 'startRow', 'startCol', 'endRow', 'endCol', 'filePath'];

    for (let generation = 1; generation <= 25; generation++) {
      const anchorId = `ast:src/a.ts:gen${String(generation)}`;
      const dot = Dot.create('A', generation);
      state.nodeAlive.add(anchorId, dot);
      for (const key of propsPerAnchor) setNodeProp(state, anchorId, key, String(generation));

      if (generation > 1) {
        // Retire the previous generation's anchor, as the indexer does.
        state.nodeAlive.remove(new Set([encodeDot(Dot.create('A', generation - 1))]));
      }

      appliedVV.set('A', generation);
      executeGC(state, appliedVV);
    }

    // Only the final generation's anchor survives, so prop holds exactly one
    // anchor's worth of registers rather than 25 generations of them.
    expect(state.propSize()).toBe(propsPerAnchor.length);
  });
});
