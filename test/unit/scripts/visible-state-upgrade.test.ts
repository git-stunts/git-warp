import { describe, it, expect } from 'vitest';
import { upgradeVisibleStateProjection } from '../../../scripts/migrations/v17.0.0/visible-state-upgrade.ts';
import {
  reducePatches,
  encodeEdgeKey as encodeEdgeKeyV5,
  encodePropKey as encodePropKeyV5,
} from '../../../src/domain/services/JoinReducer.ts';
import { compareEventIds, EventId } from '../../../src/domain/utils/EventId.ts';
import { lwwSet as lwwSetImported, lwwMax as lwwMaxImported } from '../../../src/domain/crdt/LWW.ts';

// Re-export lwwSet/lwwMax for use in tests
const lwwSetLocal = lwwSetImported;
const lwwMaxLocal = lwwMaxImported;

// ============================================================================
// Test-only v4 helpers (Schema:1 is deprecated)
// ============================================================================

/**
 * Creates an empty legacy state for migration testing.
 * NOTE: Test-only helper. Schema:1 is deprecated.
 * @returns {{nodeAlive: Map<string, any>, edgeAlive: Map<string, any>, prop: Map<string, any>}}
 */
function createEmptyState() {
  return {
    nodeAlive: new Map(),
    edgeAlive: new Map(),
    prop: new Map(),
  };
}

/**
 * Encodes an EdgeKey to a string for Map storage (v4 format).
 * NOTE: Test-only helper. Use JoinReducer.encodeEdgeKey in production.
 * @param {string} from
 * @param {string} to
 * @param {string} label
 * @returns {string}
 */
function encodeEdgeKey(from, to, label) {
  return `${from}\0${to}\0${label}`;
}

/**
 * Encodes a property key for Map storage (v4 format).
 * NOTE: Test-only helper. Use JoinReducer.encodePropKey in production.
 * @param {string} nodeId
 * @param {string} propKey
 * @returns {string}
 */
function encodePropKey(nodeId, propKey) {
  return `${nodeId}\0${propKey}`;
}

/**
 * v4 reducer for migration testing.
 * NOTE: Test-only helper. Schema:1 is deprecated.
 * @param {Array<{patch: any, sha: string}>} patches
 * @returns {{nodeAlive: Map<string, any>, edgeAlive: Map<string, any>, prop: Map<string, any>}}
 */
function reduce(patches: Array<{patch: any; sha: string}>) {
  const state = createEmptyState();

  // Expand all patches to (EventId, Op) tuples
  const tuples: Array<{eventId: any; op: any}> = [];
  for (const { patch, sha } of patches) {
    for (let index = 0; index < patch.ops.length; index++) {
      tuples.push({
        eventId: new EventId(patch.lamport, patch.writer, sha, index),
        op: patch.ops[index],
      });
    }
  }

  // Sort by EventId (total order)
  tuples.sort((a, b) => compareEventIds(a.eventId, b.eventId));

  // Apply sequentially using LWW semantics
  for (const { eventId, op } of tuples) {
    switch (op.type) {
      case 'NodeAdd': {
        const current = state.nodeAlive.get(op.node);
        const newReg = lwwSetLocal(eventId, true);
        state.nodeAlive.set(op.node, lwwMaxLocal(current, newReg));
        break;
      }
      case 'NodeTombstone': {
        const current = state.nodeAlive.get(op.node);
        const newReg = lwwSetLocal(eventId, false);
        state.nodeAlive.set(op.node, lwwMaxLocal(current, newReg));
        break;
      }
      case 'EdgeAdd': {
        const key = encodeEdgeKey(op.from, op.to, op.label);
        const current = state.edgeAlive.get(key);
        const newReg = lwwSetLocal(eventId, true);
        state.edgeAlive.set(key, lwwMaxLocal(current, newReg));
        break;
      }
      case 'EdgeTombstone': {
        const key = encodeEdgeKey(op.from, op.to, op.label);
        const current = state.edgeAlive.get(key);
        const newReg = lwwSetLocal(eventId, false);
        state.edgeAlive.set(key, lwwMaxLocal(current, newReg));
        break;
      }
      case 'PropSet': {
        const key = encodePropKey(op.node, op.key);
        const current = state.prop.get(key);
        const newReg = lwwSetLocal(eventId, op.value);
        state.prop.set(key, lwwMaxLocal(current, newReg));
        break;
      }
    }
  }

  return state;
}

// ============================================================================
// End of v4 test helpers
// ============================================================================
import { computeStateHash, nodeVisible, edgeVisible } from '../../../src/domain/services/state/StateSerializer.ts';
import { lwwSet, lwwValue } from '../../../src/domain/crdt/LWW.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../src/domain/crdt/VersionVector.ts';
// v1 op types (for migration tests) — inlined after WarpTypes.ts deletion
/** @param {string} node */
function createNodeAdd(node) { return { type: 'NodeAdd', node }; }
/** @param {string} node */
function createNodeTombstone(node) { return { type: 'NodeTombstone', node }; }
/** @param {string} from @param {string} to @param {string} label */
function createEdgeAdd(from, to, label) { return { type: 'EdgeAdd', from, to, label }; }
/** @param {string} from @param {string} to @param {string} label */
function createEdgeTombstone(from, to, label) { return { type: 'EdgeTombstone', from, to, label }; }
/** @param {string} node @param {string} key @param {unknown} value */
function createPropSet(node, key, value) { return { type: 'PropSet', node, key, value }; }
/** @param {unknown} value */
function createInlineValue(value) { return { type: 'inline', value }; }
import Patch from '../../../src/domain/types/Patch.ts';
import NodeAddClass from '../../../src/domain/types/ops/NodeAdd.ts';
import EdgeAddClass from '../../../src/domain/types/ops/EdgeAdd.ts';
import PropSetClass from '../../../src/domain/types/ops/PropSet.ts';

/** @param {Record<string, unknown>} opts */
function createPatch(opts) { return new Patch((opts)); }
/** @param {string} node @param {any} dot */
function createNodeAddV2(node, dot) { return new NodeAddClass(node, dot); }
/** @param {string} from @param {string} to @param {string} label @param {any} dot */
function createEdgeAddV2(from, to, label, dot) { return new EdgeAddClass({ from, to, label, dot }); }
/** @param {string} node @param {string} key @param {unknown} value */
function createPropSetV2(node, key, value) { return new PropSetClass(node, key, value); }
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';

const crypto = new NodeCryptoAdapter();

/**
 * Creates a PatchV1 (schema:1) for migration testing.
 * NOTE: This is a test-only helper. Schema:1 is deprecated and
 * createPatch is no longer exported from WarpTypes.js.
 * @param {Object} options - Patch options
 * @param {string} options.writer - Writer ID
 * @param {number} options.lamport - Lamport timestamp
 * @param {any[]} options.ops - Array of operations
 * @param {string} [options.baseCheckpoint] - Optional base checkpoint OID
 * @returns {any} PatchV1 object
 */
function createPatchV1({ writer, lamport, ops, baseCheckpoint }: { writer: any; lamport: any; ops: any; baseCheckpoint?: any }) {
  const patch: any = {
    schema: 1,
    writer,
    lamport,
    ops,
  };
  if (baseCheckpoint !== undefined) {
    patch.baseCheckpoint = baseCheckpoint;
  }
  return patch;
}

/**
 * Helper to create a legacy state with nodes, edges, and props directly
 */
function createV4State({ nodes = [] as any[], edges = [] as any[], props = [] as any[] }: { nodes?: any[]; edges?: any[]; props?: any[] } = {}) {
  const state = createEmptyState();
  let counter = 0;

  for (const { nodeId, alive } of nodes) {
    const eventId = new EventId(++counter, 'test-writer', 'abcd1234', 0);
    state.nodeAlive.set(nodeId, lwwSet(eventId, alive));
  }

  for (const { from, to, label, alive } of edges) {
    const eventId = new EventId(++counter, 'test-writer', 'abcd1234', 0);
    const edgeKey = encodeEdgeKey(from, to, label);
    state.edgeAlive.set(edgeKey, lwwSet(eventId, alive));
  }

  for (const { nodeId, key, value } of props) {
    const eventId = new EventId(++counter, 'test-writer', 'abcd1234', 0);
    const propKey = encodePropKey(nodeId, key);
    state.prop.set(propKey, lwwSet(eventId, value));
  }

  return state;
}

describe('visible-state upgrade helper', () => {
  describe('upgradeVisibleStateProjection', () => {
    describe('empty legacy state produces empty current state', () => {
      it('returns empty current state for empty legacy state', () => {
        const legacyState = createEmptyState();
        const migrationWriterId = 'migration-writer';

        const currentState = upgradeVisibleStateProjection(legacyState, migrationWriterId);

        expect(currentState.nodeAlive.elements()).toHaveLength(0);
        expect(currentState.edgeAlive.elements()).toHaveLength(0);
        expect(currentState.propSize()).toBe(0);
        expect(currentState.observedFrontier.size).toBe(0);
      });
    });

    describe('visible nodes migrate to current OR-Set', () => {
      it('migrates single visible node', () => {
        const legacyState = createV4State({
          nodes: [{ nodeId: 'node-a', alive: true }],
        });
        const migrationWriterId = 'migration-writer';

        const currentState = upgradeVisibleStateProjection(legacyState, migrationWriterId);

        expect(currentState.nodeAlive.contains('node-a')).toBe(true);
        expect(currentState.nodeAlive.elements()).toEqual(['node-a']);
      });

      it('migrates multiple visible nodes', () => {
        const legacyState = createV4State({
          nodes: [
            { nodeId: 'node-a', alive: true },
            { nodeId: 'node-b', alive: true },
            { nodeId: 'node-c', alive: true },
          ],
        });
        const migrationWriterId = 'migration-writer';

        const currentState = upgradeVisibleStateProjection(legacyState, migrationWriterId);

        expect(currentState.nodeAlive.contains('node-a')).toBe(true);
        expect(currentState.nodeAlive.contains('node-b')).toBe(true);
        expect(currentState.nodeAlive.contains('node-c')).toBe(true);
        expect(currentState.nodeAlive.elements()).toHaveLength(3);
      });

      it('assigns synthetic dots from migration writer', () => {
        const legacyState = createV4State({
          nodes: [
            { nodeId: 'node-a', alive: true },
            { nodeId: 'node-b', alive: true },
          ],
        });
        const migrationWriterId = 'migration-writer';

        const currentState = upgradeVisibleStateProjection(legacyState, migrationWriterId);

        // Each node should have a dot from the migration writer
        // The version vector should track the migration writer's counter
        expect(currentState.observedFrontier.get(migrationWriterId)).toBeGreaterThanOrEqual(2);
      });
    });

    describe('deleted nodes (value=false) do NOT migrate', () => {
      it('does not migrate tombstoned node', () => {
        const legacyState = createV4State({
          nodes: [{ nodeId: 'deleted-node', alive: false }],
        });
        const migrationWriterId = 'migration-writer';

        const currentState = upgradeVisibleStateProjection(legacyState, migrationWriterId);

        expect(currentState.nodeAlive.contains('deleted-node')).toBe(false);
        expect(currentState.nodeAlive.elements()).toHaveLength(0);
      });

      it('only migrates visible nodes, not tombstoned ones', () => {
        const legacyState = createV4State({
          nodes: [
            { nodeId: 'visible-node', alive: true },
            { nodeId: 'deleted-node', alive: false },
          ],
        });
        const migrationWriterId = 'migration-writer';

        const currentState = upgradeVisibleStateProjection(legacyState, migrationWriterId);

        expect(currentState.nodeAlive.contains('visible-node')).toBe(true);
        expect(currentState.nodeAlive.contains('deleted-node')).toBe(false);
        expect(currentState.nodeAlive.elements()).toEqual(['visible-node']);
      });

      it('handles previously deleted then re-created node (final state visible)', () => {
        // Use reducer to create a realistic legacy state with delete-resurrect cycle
        const patches = [
          {
            patch: createPatchV1({
              writer: 'W',
              lamport: 1,
              ops: [createNodeAdd('node-x')],
            }),
            sha: 'aaa11111',
          },
          {
            patch: createPatchV1({
              writer: 'W',
              lamport: 2,
              ops: [createNodeTombstone('node-x')],
            }),
            sha: 'bbb22222',
          },
          {
            patch: createPatchV1({
              writer: 'W',
              lamport: 3,
              ops: [createNodeAdd('node-x')],
            }),
            sha: 'ccc33333',
          },
        ];

        const legacyState = reduce(patches);
        const currentState = upgradeVisibleStateProjection(legacyState, 'migration-writer');

        // Node is visible in v4 after resurrection
        expect(lwwValue(legacyState.nodeAlive.get('node-x'))).toBe(true);
        // Node should be present in current
        expect(currentState.nodeAlive.contains('node-x')).toBe(true);
      });
    });

    describe('edges migrate with synthetic dots', () => {
      it('migrates visible edge', () => {
        const legacyState = createV4State({
          nodes: [
            { nodeId: 'a', alive: true },
            { nodeId: 'b', alive: true },
          ],
          edges: [{ from: 'a', to: 'b', label: 'rel', alive: true }],
        });
        const migrationWriterId = 'migration-writer';

        const currentState = upgradeVisibleStateProjection(legacyState, migrationWriterId);

        const edgeKey = encodeEdgeKey('a', 'b', 'rel');
        expect(currentState.edgeAlive.contains(edgeKey)).toBe(true);
      });

      it('does not migrate tombstoned edge', () => {
        const legacyState = createV4State({
          edges: [{ from: 'a', to: 'b', label: 'rel', alive: false }],
        });
        const migrationWriterId = 'migration-writer';

        const currentState = upgradeVisibleStateProjection(legacyState, migrationWriterId);

        const edgeKey = encodeEdgeKey('a', 'b', 'rel');
        expect(currentState.edgeAlive.contains(edgeKey)).toBe(false);
      });

      it('migrates multiple edges with different labels', () => {
        const legacyState = createV4State({
          edges: [
            { from: 'a', to: 'b', label: 'follows', alive: true },
            { from: 'a', to: 'b', label: 'likes', alive: true },
            { from: 'b', to: 'a', label: 'follows', alive: true },
          ],
        });
        const migrationWriterId = 'migration-writer';

        const currentState = upgradeVisibleStateProjection(legacyState, migrationWriterId);

        expect(currentState.edgeAlive.contains(encodeEdgeKey('a', 'b', 'follows'))).toBe(true);
        expect(currentState.edgeAlive.contains(encodeEdgeKey('a', 'b', 'likes'))).toBe(true);
        expect(currentState.edgeAlive.contains(encodeEdgeKey('b', 'a', 'follows'))).toBe(true);
        expect(currentState.edgeAlive.elements()).toHaveLength(3);
      });

      it('filters visible from tombstoned edges', () => {
        const legacyState = createV4State({
          edges: [
            { from: 'a', to: 'b', label: 'visible', alive: true },
            { from: 'a', to: 'c', label: 'deleted', alive: false },
          ],
        });
        const migrationWriterId = 'migration-writer';

        const currentState = upgradeVisibleStateProjection(legacyState, migrationWriterId);

        expect(currentState.edgeAlive.contains(encodeEdgeKey('a', 'b', 'visible'))).toBe(true);
        expect(currentState.edgeAlive.contains(encodeEdgeKey('a', 'c', 'deleted'))).toBe(false);
        expect(currentState.edgeAlive.elements()).toHaveLength(1);
      });
    });

    describe('props for visible nodes migrate, props for deleted nodes do NOT', () => {
      it('migrates props for visible node', () => {
        const legacyState = createV4State({
          nodes: [{ nodeId: 'node-a', alive: true }],
          props: [
            { nodeId: 'node-a', key: 'name', value: createInlineValue('Alice') },
            { nodeId: 'node-a', key: 'age', value: createInlineValue(30) },
          ],
        });
        const migrationWriterId = 'migration-writer';

        const currentState = upgradeVisibleStateProjection(legacyState, migrationWriterId);

        expect(currentState.propSize()).toBe(2);
        expect(lwwValue(currentState.getEncodedProp(encodePropKey('node-a', 'name')))).toEqual(
          createInlineValue('Alice')
        );
        expect(lwwValue(currentState.getEncodedProp(encodePropKey('node-a', 'age')))).toEqual(
          createInlineValue(30)
        );
      });

      it('does NOT migrate props for deleted node', () => {
        const legacyState = createV4State({
          nodes: [{ nodeId: 'deleted-node', alive: false }],
          props: [
            { nodeId: 'deleted-node', key: 'name', value: createInlineValue('Ghost') },
          ],
        });
        const migrationWriterId = 'migration-writer';

        const currentState = upgradeVisibleStateProjection(legacyState, migrationWriterId);

        expect(currentState.propSize()).toBe(0);
      });

      it('migrates props selectively based on node visibility', () => {
        const legacyState = createV4State({
          nodes: [
            { nodeId: 'visible-node', alive: true },
            { nodeId: 'deleted-node', alive: false },
          ],
          props: [
            { nodeId: 'visible-node', key: 'name', value: createInlineValue('Visible') },
            { nodeId: 'deleted-node', key: 'name', value: createInlineValue('Deleted') },
          ],
        });
        const migrationWriterId = 'migration-writer';

        const currentState = upgradeVisibleStateProjection(legacyState, migrationWriterId);

        expect(currentState.propSize()).toBe(1);
        expect(lwwValue(currentState.getEncodedProp(encodePropKey('visible-node', 'name')))).toEqual(
          createInlineValue('Visible')
        );
        expect(currentState.hasProp(encodePropKey('deleted-node', 'name'))).toBe(false);
      });

      it('handles props for nodes with no entry in nodeAlive map (dangling)', () => {
        // Create a legacy state with a prop for a node that has no nodeAlive entry
        const legacyState = createEmptyState();
        const eventId = new EventId(1, 'test-writer', 'abcd1234', 0);
        legacyState.prop.set(
          encodePropKey('orphan-node', 'name'),
          lwwSet(eventId, createInlineValue('Orphan')),
        );

        const migrationWriterId = 'migration-writer';
        const currentState = upgradeVisibleStateProjection(legacyState, migrationWriterId);

        // Orphan props should not be migrated
        expect(currentState.propSize()).toBe(0);
      });
    });

    describe('visible projections match after migration', () => {
      it('legacy visible projection matches current visible projection', () => {
        // Build a realistic legacy state via the reducer
        const patches = [
          {
            patch: createPatchV1({
              writer: 'alice',
              lamport: 1,
              ops: [
                createNodeAdd('user:alice'),
                createPropSet('user:alice', 'name', createInlineValue('Alice')),
              ],
            }),
            sha: 'aaaa1111',
          },
          {
            patch: createPatchV1({
              writer: 'bob',
              lamport: 2,
              ops: [
                createNodeAdd('user:bob'),
                createPropSet('user:bob', 'name', createInlineValue('Bob')),
                createEdgeAdd('user:bob', 'user:alice', 'follows'),
              ],
            }),
            sha: 'bbbb2222',
          },
          {
            patch: createPatchV1({
              writer: 'alice',
              lamport: 3,
              ops: [
                createNodeAdd('post:1'),
                createPropSet('post:1', 'content', createInlineValue('Hello!')),
                createEdgeAdd('user:alice', 'post:1', 'authored'),
              ],
            }),
            sha: 'cccc3333',
          },
        ];

        const legacyState = reduce(patches);
        const currentState = upgradeVisibleStateProjection(legacyState, 'migration-writer');

        // Compute visible projection from v4
        const v4VisibleNodes: string[] = [];
        for (const [nodeId, reg] of legacyState.nodeAlive) {
          if (reg.value === true) {
            v4VisibleNodes.push(nodeId);
          }
        }
        v4VisibleNodes.sort();

        const v4VisibleEdges: string[] = [];
        for (const [edgeKey, reg] of legacyState.edgeAlive) {
          if (reg.value === true) {
            v4VisibleEdges.push(edgeKey);
          }
        }
        v4VisibleEdges.sort();

        // Compute visible projection from current
        const v5VisibleNodes = currentState.nodeAlive.elements();
        v5VisibleNodes.sort();

        const v5VisibleEdges = currentState.edgeAlive.elements();
        v5VisibleEdges.sort();

        // They should match
        expect(v5VisibleNodes).toEqual(v4VisibleNodes);
        expect(v5VisibleEdges).toEqual(v4VisibleEdges);
      });

      it('handles mixed visible and tombstoned entities correctly', () => {
        const patches = [
          {
            patch: createPatchV1({
              writer: 'W',
              lamport: 1,
              ops: [
                createNodeAdd('a'),
                createNodeAdd('b'),
                createNodeAdd('c'),
                createEdgeAdd('a', 'b', 'link'),
                createEdgeAdd('b', 'c', 'link'),
              ],
            }),
            sha: 'aaaa1111',
          },
          {
            patch: createPatchV1({
              writer: 'W',
              lamport: 2,
              ops: [
                createNodeTombstone('b'),
                createEdgeTombstone('a', 'b', 'link'),
              ],
            }),
            sha: 'bbbb2222',
          },
        ];

        const legacyState = reduce(patches);
        const currentState = upgradeVisibleStateProjection(legacyState, 'migration-writer');

        // v4 should have: nodes a, c visible; node b tombstoned
        expect(lwwValue(legacyState.nodeAlive.get('a'))).toBe(true);
        expect(lwwValue(legacyState.nodeAlive.get('b'))).toBe(false);
        expect(lwwValue(legacyState.nodeAlive.get('c'))).toBe(true);

        // current state should match the visible projection
        expect(currentState.nodeAlive.contains('a')).toBe(true);
        expect(currentState.nodeAlive.contains('b')).toBe(false);
        expect(currentState.nodeAlive.contains('c')).toBe(true);

        // Edge a->b should be tombstoned, b->c should be visible
        expect(currentState.edgeAlive.contains(encodeEdgeKey('a', 'b', 'link'))).toBe(false);
        expect(currentState.edgeAlive.contains(encodeEdgeKey('b', 'c', 'link'))).toBe(true);
      });

      it('preserves LWW register metadata for props', () => {
        const legacyState = createV4State({
          nodes: [{ nodeId: 'node-a', alive: true }],
          props: [{ nodeId: 'node-a', key: 'name', value: createInlineValue('Test') }],
        });

        const currentState = upgradeVisibleStateProjection(legacyState, 'migration-writer');

        // The prop register should preserve its eventId and value
        const v4PropReg = legacyState.prop.get(encodePropKey('node-a', 'name'));
        const v5PropReg = currentState.getEncodedProp(encodePropKey('node-a', 'name'));

        expect(v5PropReg).toEqual(v4PropReg);
      });
    });

    describe('version vector tracking', () => {
      it('tracks all synthetic dots in observedFrontier', () => {
        const legacyState = createV4State({
          nodes: [
            { nodeId: 'a', alive: true },
            { nodeId: 'b', alive: true },
          ],
          edges: [{ from: 'a', to: 'b', label: 'link', alive: true }],
        });
        const migrationWriterId = 'migration-writer';

        const currentState = upgradeVisibleStateProjection(legacyState, migrationWriterId);

        // 2 nodes + 1 edge = 3 synthetic dots
        expect(currentState.observedFrontier.get(migrationWriterId)).toBe(3);
      });

      it('empty state results in empty version vector', () => {
        const legacyState = createEmptyState();
        const currentState = upgradeVisibleStateProjection(legacyState, 'migration-writer');

        expect(currentState.observedFrontier.size).toBe(0);
      });
    });

    // =========================================================================
    // WARP current Legacy Check: legacy -> current Upgrade with Post-Migration current Patches
    // =========================================================================
    describe('legacy -> current upgrade (applying current patches after migration)', () => {
      it('migrates legacy state and applies current patches correctly without data loss', () => {
        // Step 1: Build v4 graph state via v1 patches (LWW-based)
        const v4Patches = [
          {
            patch: createPatchV1({
              writer: 'alice',
              lamport: 1,
              ops: [
                createNodeAdd('user:alice'),
                createPropSet('user:alice', 'name', createInlineValue('Alice')),
              ],
            }),
            sha: 'aaaa1111',
          },
          {
            patch: createPatchV1({
              writer: 'bob',
              lamport: 2,
              ops: [
                createNodeAdd('user:bob'),
                createPropSet('user:bob', 'name', createInlineValue('Bob')),
                createEdgeAdd('user:bob', 'user:alice', 'follows'),
              ],
            }),
            sha: 'bbbb2222',
          },
        ];

        // Create legacy state (LWW-based)
        const legacyState = reduce(v4Patches);

        // Verify legacy state is correct
        expect(lwwValue(legacyState.nodeAlive.get('user:alice'))).toBe(true);
        expect(lwwValue(legacyState.nodeAlive.get('user:bob'))).toBe(true);
        expect(lwwValue(legacyState.edgeAlive.get(encodeEdgeKey('user:bob', 'user:alice', 'follows')))).toBe(true);

        // Step 2: Migrate to current (creates OR-Set based state)
        const currentState = upgradeVisibleStateProjection(legacyState, '__migration__');

        // Verify migration preserved all visible entities
        expect(nodeVisible(currentState, 'user:alice')).toBe(true);
        expect(nodeVisible(currentState, 'user:bob')).toBe(true);
        expect(edgeVisible(currentState, encodeEdgeKeyV5('user:bob', 'user:alice', 'follows'))).toBe(true);

        // Step 3: Apply current patches (OR-Set based) AFTER migration
        const v5Patches = [
          {
            patch: createPatch({
              writer: 'charlie',
              lamport: 10,
              context: (VersionVector.empty() as any),
              ops: [
                createNodeAddV2('user:charlie', Dot.create('charlie', 1)),
                createPropSetV2('user:charlie', 'name', createInlineValue('Charlie')),
              ],
            }),
            sha: 'cccc3333',
          },
          {
            patch: createPatch({
              writer: 'charlie',
              lamport: 11,
              context: (VersionVector.empty() as any),
              ops: [
                createEdgeAddV2('user:charlie', 'user:alice', 'follows', Dot.create('charlie', 2)),
                createEdgeAddV2('user:charlie', 'user:bob', 'follows', Dot.create('charlie', 3)),
              ],
            }),
            sha: 'dddd4444',
          },
        ];

        // Apply current patches to migrated state
        const finalState = reducePatches(v5Patches, currentState);

        // Step 4: Verify NO data loss - all original v4 data is preserved
        expect(nodeVisible(finalState, 'user:alice')).toBe(true);
        expect(nodeVisible(finalState, 'user:bob')).toBe(true);
        expect(edgeVisible(finalState, encodeEdgeKeyV5('user:bob', 'user:alice', 'follows'))).toBe(true);

        // Verify props from v4 are preserved
        const alicePropKey = encodePropKeyV5('user:alice', 'name');
        const bobPropKey = encodePropKeyV5('user:bob', 'name');
        expect(lwwValue(finalState.getEncodedProp(alicePropKey))).toEqual(createInlineValue('Alice'));
        expect(lwwValue(finalState.getEncodedProp(bobPropKey))).toEqual(createInlineValue('Bob'));

        // Step 5: Verify new current data is present
        expect(nodeVisible(finalState, 'user:charlie')).toBe(true);
        expect(edgeVisible(finalState, encodeEdgeKeyV5('user:charlie', 'user:alice', 'follows'))).toBe(true);
        expect(edgeVisible(finalState, encodeEdgeKeyV5('user:charlie', 'user:bob', 'follows'))).toBe(true);

        // Verify Charlie's prop
        const charliePropKey = encodePropKeyV5('user:charlie', 'name');
        expect(lwwValue(finalState.getEncodedProp(charliePropKey))).toEqual(createInlineValue('Charlie'));
      });

      it('permutation invariance holds for current patches applied after migration', async () => {
        // Build legacy state
        const v4Patches = [
          {
            patch: createPatchV1({
              writer: 'W',
              lamport: 1,
              ops: [createNodeAdd('existing-node')],
            }),
            sha: 'aaaa1111',
          },
        ];

        const legacyState = reduce(v4Patches);
        const currentState = upgradeVisibleStateProjection(legacyState, '__migration__');

        // Multiple current patches
        const v5PatchA = {
          patch: createPatch({
            writer: 'A',
            lamport: 10,
            context: (VersionVector.empty() as any),
            ops: [createNodeAddV2('node-a', Dot.create('A', 1))],
          }),
          sha: 'aaaa2222',
        };

        const v5PatchB = {
          patch: createPatch({
            writer: 'B',
            lamport: 11,
            context: (VersionVector.empty() as any),
            ops: [createNodeAddV2('node-b', Dot.create('B', 1))],
          }),
          sha: 'bbbb3333',
        };

        const v5PatchC = {
          patch: createPatch({
            writer: 'C',
            lamport: 12,
            context: (VersionVector.empty() as any),
            ops: [createEdgeAddV2('node-a', 'node-b', 'link', Dot.create('C', 1))],
          }),
          sha: 'cccc4444',
        };

        // Apply in different orders
        const stateABC = reducePatches([v5PatchA, v5PatchB, v5PatchC], currentState);
        const stateCBA = reducePatches([v5PatchC, v5PatchB, v5PatchA], currentState);
        const stateBAC = reducePatches([v5PatchB, v5PatchA, v5PatchC], currentState);

        // All orders produce the same hash (permutation invariance)
        const hashABC = await computeStateHash(stateABC, { crypto });
        const hashCBA = await computeStateHash(stateCBA, { crypto });
        const hashBAC = await computeStateHash(stateBAC, { crypto });

        expect(hashABC).toBe(hashCBA);
        expect(hashABC).toBe(hashBAC);

        // Original v4 data preserved in all cases
        expect(nodeVisible(stateABC, 'existing-node')).toBe(true);
        expect(nodeVisible(stateCBA, 'existing-node')).toBe(true);
        expect(nodeVisible(stateBAC, 'existing-node')).toBe(true);
      });
    });

    // =========================================================================
    // WARP current Legacy Check: Mixed Mode (v1/v2 patch interleaving)
    // =========================================================================
    describe('mixed mode: v1/v2 patch handling', () => {
      /**
       * WARP current HARD RULE: "No interleaving v1/v2 patches in a single reducer."
       *
       * The migration boundary enforces this at the WarpCore level:
       * - v1 patches are processed by reduce() (LWW-based) before migration
       * - A current checkpoint is created via upgradeVisibleStateProjection()
       * - v2 patches are processed by reducePatches() (OR-Set based) after migration
       *
       * The reducers themselves do NOT validate patch schema because they
       * trust the migration boundary to be properly enforced by the API layer.
       *
       * These tests document the expected behavior when the boundary is respected.
       */

      it('reducePatches only processes v2 patches (v1 patches should go through migration first)', () => {
        // Create a v1 patch (schema:1, LWW operations)
        const v1Patch = {
          patch: createPatchV1({
            writer: 'alice',
            lamport: 1,
            ops: [createNodeAdd('node-from-v1')],
          }),
          sha: 'a1aa1111',
        };

        // Create a v2 patch (schema:2, OR-Set operations with dots)
        const v2Patch = {
          patch: createPatch({
            writer: 'bob',
            lamport: 2,
            context: (VersionVector.empty() as any),
            ops: [createNodeAddV2('node-from-v2', Dot.create('bob', 1))],
          }),
          sha: 'b2bb2222',
        };

        // CORRECT WORKFLOW: Process v1 patches first, then migrate, then v2
        const legacyState = reduce([v1Patch]);
        const migratedState = upgradeVisibleStateProjection(legacyState, '__migration__');
        const finalState = reducePatches([v2Patch], migratedState);

        // Both nodes visible after proper migration workflow
        expect(nodeVisible(finalState, 'node-from-v1')).toBe(true);
        expect(nodeVisible(finalState, 'node-from-v2')).toBe(true);
      });

      it('migration boundary is the separation point between v1 and v2 patches', () => {
        // Build a v4 graph with multiple v1 patches
        const v1Patches = [
          {
            patch: createPatchV1({
              writer: 'W',
              lamport: 1,
              ops: [
                createNodeAdd('n1'),
                createNodeAdd('n2'),
                createEdgeAdd('n1', 'n2', 'link'),
              ],
            }),
            sha: 'aaaa1111',
          },
          {
            patch: createPatchV1({
              writer: 'W',
              lamport: 2,
              ops: [createNodeTombstone('n2')],
            }),
            sha: 'bbbb2222',
          },
        ];

        // BEFORE migration: legacy state via LWW reducer
        const legacyState = reduce(v1Patches);
        expect(lwwValue(legacyState.nodeAlive.get('n1'))).toBe(true);
        expect(lwwValue(legacyState.nodeAlive.get('n2'))).toBe(false); // tombstoned

        // MIGRATION BOUNDARY: Convert to current
        const currentState = upgradeVisibleStateProjection(legacyState, '__migration__');

        // AFTER migration: Only visible entities survive
        expect(nodeVisible(currentState, 'n1')).toBe(true);
        expect(nodeVisible(currentState, 'n2')).toBe(false); // stays deleted

        // v2 patches can now add new data
        const v2Patches = [
          {
            patch: createPatch({
              writer: 'current-writer',
              lamport: 10,
              context: (VersionVector.empty() as any),
              ops: [
                createNodeAddV2('n3', Dot.create('current-writer', 1)),
                createEdgeAddV2('n1', 'n3', 'link', Dot.create('current-writer', 2)),
              ],
            }),
            sha: 'cccc3333',
          },
        ];

        const finalState = reducePatches(v2Patches, currentState);

        // Verify migration boundary was respected
        expect(nodeVisible(finalState, 'n1')).toBe(true);  // from v4
        expect(nodeVisible(finalState, 'n2')).toBe(false); // tombstoned in v4
        expect(nodeVisible(finalState, 'n3')).toBe(true);  // from current
        expect(edgeVisible(finalState, encodeEdgeKeyV5('n1', 'n3', 'link'))).toBe(true);
      });

      it('documents that direct mixing of v1/v2 patches is NOT supported', () => {
        /**
         * This test documents the expected behavior when mixing patches.
         * The reducers do NOT validate schema - they trust the migration boundary.
         *
         * If v1 patches were passed to reducePatches, they would be processed
         * incorrectly because v1 patches use different operation types
         * (NodeAdd vs NodeAdd with dot, NodeTombstone vs NodeRemove with observedDots).
         *
         * The proper enforcement happens at WarpCore._validateMigrationBoundary()
         * which prevents opening a schema:2 graph with v1 history without migration.
         */

        // This demonstrates WHY the migration boundary matters:
        // v1 ops: NodeAdd, NodeTombstone, EdgeAdd, EdgeTombstone, PropSet
        // v2 ops: NodeAdd(with dot), NodeRemove(with observedDots), etc.

        // A v1 patch's NodeAdd has no 'dot' field
        const v1Patch = createPatchV1({
          writer: 'W',
          lamport: 1,
          ops: [createNodeAdd('test-node')],
        });

        // A v2 patch's NodeAdd HAS a 'dot' field
        const v2Patch = createPatch({
          writer: 'W',
          lamport: 1,
          context: (VersionVector.empty() as any),
          ops: [createNodeAddV2('test-node', Dot.create('W', 1))],
        });

        // Verify the structural difference that makes mixing incompatible
        const v1Op0 = v1Patch.ops[0];
        expect(v1Op0).toBeDefined();
        expect(v1Op0?.type).toBe('NodeAdd');
        expect(v1Op0?.dot).toBeUndefined(); // v1 has no dot

        const v2Op0 = v2Patch.ops[0];
        expect(v2Op0).toBeDefined();
        expect(v2Op0?.type).toBe('NodeAdd');
        expect((v2Op0 as any)?.dot).toBeDefined(); // v2 has a dot
        expect((v2Op0 as any)?.dot.writerId).toBe('W');
        expect((v2Op0 as any)?.dot.counter).toBe(1);
      });
    });
  });
});
