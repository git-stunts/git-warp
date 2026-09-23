/**
 * Property-sweep compaction in executeGC (16.x maintenance backport).
 *
 * Removing a node or edge tombstones its dot in the alive OR-Set but leaves
 * every property register keyed under that element in `state.prop`, and
 * nothing else deletes from that map. A graph under churn — retiring one
 * generation of elements to add the next, as an AST re-indexer does on every
 * file edit — grows it monotonically, ratcheting heap in long-lived processes
 * even across full GC runs.
 */

import { describe, it, expect } from 'vitest';
import { executeGC } from '../../../../src/domain/services/GCPolicy.js';
import { createEmptyStateV5 } from '../../../../src/domain/services/JoinReducer.js';
import { orsetAdd, orsetRemove } from '../../../../src/domain/crdt/ORSet.js';
import { createDot, encodeDot } from '../../../../src/domain/crdt/Dot.js';
import { createVersionVector } from '../../../../src/domain/crdt/VersionVector.js';
import {
  encodeEdgeKey,
  encodeEdgePropKey,
  encodePropKey,
} from '../../../../src/domain/services/KeyCodec.js';

let opCounter = 0;

/**
 * Distinct EventIds per call so LWW writes never collide on identity.
 * @returns {import('../../../../src/domain/utils/EventId.js').EventId}
 */
function nextEventId() {
  opCounter += 1;
  return { lamport: 1, writerId: 'A', patchSha: 'abcdef01', opIndex: opCounter };
}

/**
 * Writes a property register directly into state under an encoded key.
 * @param {import('../../../../src/domain/services/JoinReducer.js').WarpStateV5} state
 * @param {string} encodedKey
 * @param {unknown} value
 * @returns {void}
 */
function setProp(state, encodedKey, value) {
  state.prop.set(encodedKey, { eventId: nextEventId(), value });
}

/**
 * Reads back a register's value, failing the test if the key is absent.
 * @param {import('../../../../src/domain/services/JoinReducer.js').WarpStateV5} state
 * @param {string} encodedKey
 * @returns {unknown}
 */
function propValue(state, encodedKey) {
  const register = state.prop.get(encodedKey);
  expect(register).toBeDefined();
  return register?.value;
}

/**
 * Adds a node, then tombstones its only dot, leaving it dead.
 * @param {import('../../../../src/domain/services/JoinReducer.js').WarpStateV5} state
 * @param {string} nodeId
 * @param {import('../../../../src/domain/crdt/Dot.js').Dot} dot
 * @returns {void}
 */
function addThenRemoveNode(state, nodeId, dot) {
  orsetAdd(state.nodeAlive, nodeId, dot);
  orsetRemove(state.nodeAlive, new Set([encodeDot(dot)]));
}

/**
 * A VersionVector covering writer A through `counter`.
 * @param {number} counter
 * @returns {import('../../../../src/domain/crdt/VersionVector.js').VersionVector}
 */
function appliedThrough(counter) {
  const vv = createVersionVector();
  vv.set('A', counter);
  return vv;
}

describe('executeGC property sweep', () => {
  it('prunes property registers belonging to a dead node', () => {
    const state = createEmptyStateV5();
    addThenRemoveNode(state, 'ast:doomed', createDot('A', 1));
    setProp(state, encodePropKey('ast:doomed', 'type'), 'identifier');
    setProp(state, encodePropKey('ast:doomed', 'startRow'), 12);

    expect(state.prop.size).toBe(2);

    const result = executeGC(state, appliedThrough(1));

    expect(result.propertiesPruned).toBe(2);
    expect(state.prop.size).toBe(0);
  });

  it('leaves property registers of a live node untouched', () => {
    const state = createEmptyStateV5();
    orsetAdd(state.nodeAlive, 'ast:keeper', createDot('A', 1));
    setProp(state, encodePropKey('ast:keeper', 'type'), 'function_declaration');

    const result = executeGC(state, appliedThrough(1));

    expect(result.propertiesPruned).toBe(0);
    expect(propValue(state, encodePropKey('ast:keeper', 'type'))).toBe('function_declaration');
  });

  it('prunes dead nodes while preserving live ones in the same sweep', () => {
    const state = createEmptyStateV5();
    orsetAdd(state.nodeAlive, 'ast:keeper', createDot('A', 1));
    setProp(state, encodePropKey('ast:keeper', 'type'), 'function_declaration');
    addThenRemoveNode(state, 'ast:doomed', createDot('A', 2));
    setProp(state, encodePropKey('ast:doomed', 'type'), 'identifier');

    const result = executeGC(state, appliedThrough(2));

    expect(result.propertiesPruned).toBe(1);
    expect(state.prop.size).toBe(1);
    expect(state.prop.has(encodePropKey('ast:keeper', 'type'))).toBe(true);
  });

  it('prunes property registers belonging to a dead edge', () => {
    const state = createEmptyStateV5();
    const edgeKey = encodeEdgeKey('file:a.ts', 'ast:root', 'contains_ast');
    const dot = createDot('A', 1);
    orsetAdd(state.edgeAlive, edgeKey, dot);
    orsetRemove(state.edgeAlive, new Set([encodeDot(dot)]));
    setProp(state, encodeEdgePropKey('file:a.ts', 'ast:root', 'contains_ast', 'weight'), 1);

    const result = executeGC(state, appliedThrough(1));

    expect(result.propertiesPruned).toBe(1);
    expect(state.prop.size).toBe(0);
  });

  it('leaves property registers of a live edge untouched', () => {
    const state = createEmptyStateV5();
    const edgeKey = encodeEdgeKey('file:a.ts', 'ast:root', 'contains_ast');
    orsetAdd(state.edgeAlive, edgeKey, createDot('A', 1));
    const propKey = encodeEdgePropKey('file:a.ts', 'ast:root', 'contains_ast', 'weight');
    setProp(state, propKey, 1);

    const result = executeGC(state, appliedThrough(1));

    expect(result.propertiesPruned).toBe(0);
    expect(propValue(state, propKey)).toBe(1);
  });

  it('retains a property whose key does not decode unambiguously', () => {
    // A live node whose id embeds the field separator. Its key decodes to a
    // shorter, dead id, so a sweep trusting that decode would delete a live
    // node's registers.
    const state = createEmptyStateV5();
    const nodeId = encodeEdgeKey('file:a.ts', 'ast:root', 'contains_ast');
    orsetAdd(state.nodeAlive, nodeId, createDot('A', 1));
    setProp(state, encodePropKey(nodeId, 'kind'), 'node');

    const result = executeGC(state, appliedThrough(1));

    expect(result.propertiesPruned).toBe(0);
    expect(propValue(state, encodePropKey(nodeId, 'kind'))).toBe('node');
  });

  it('reclaims the edge birth event of a swept edge', () => {
    const state = createEmptyStateV5();
    const edgeKey = encodeEdgeKey('file:a.ts', 'ast:root', 'contains_ast');
    const dot = createDot('A', 1);
    orsetAdd(state.edgeAlive, edgeKey, dot);
    state.edgeBirthEvent.set(edgeKey, nextEventId());
    orsetRemove(state.edgeAlive, new Set([encodeDot(dot)]));

    executeGC(state, appliedThrough(1));

    expect(state.edgeBirthEvent.has(edgeKey)).toBe(false);
  });

  it('reports zero pruned properties for an empty state', () => {
    const result = executeGC(createEmptyStateV5(), createVersionVector());
    expect(result.propertiesPruned).toBe(0);
  });

  it('bounds prop growth across repeated churn', () => {
    // The daemon's failure mode: re-index a file, retiring every prior AST
    // anchor and adding fresh ones with the same seven properties each pass.
    const state = createEmptyStateV5();
    const keys = ['type', 'named', 'startRow', 'startCol', 'endRow', 'endCol', 'filePath'];

    for (let generation = 1; generation <= 25; generation++) {
      const anchorId = `ast:src/a.ts:gen${String(generation)}`;
      orsetAdd(state.nodeAlive, anchorId, createDot('A', generation));
      for (const key of keys) setProp(state, encodePropKey(anchorId, key), generation);

      if (generation > 1) {
        orsetRemove(state.nodeAlive, new Set([encodeDot(createDot('A', generation - 1))]));
      }
      executeGC(state, appliedThrough(generation));
    }

    expect(state.prop.size).toBe(keys.length);
  });
});
