import { describe, it, expect } from 'vitest';
import { migrateV4toV5 } from '../../../../src/domain/services/MigrationService.js';
import {
  reduceV5 as _reduceV5,
  encodeEdgeKey as encodeEdgeKeyV5,
  encodePropKey as encodePropKeyV5,
} from '../../../../src/domain/services/JoinReducer.js';
/** @type {(...args: any[]) => any} */
const reduceV5 = _reduceV5;
import { compareEventIds, createEventId } from '../../../../src/domain/utils/EventId.js';
import { lwwSet as lwwSetImported, lwwMax as lwwMaxImported } from '../../../../src/domain/crdt/LWW.js';

// Re-export lwwSet/lwwMax for use in tests
const lwwSetLocal = lwwSetImported;
const lwwMaxLocal = lwwMaxImported;

// ============================================================================
// Test-only v4 helpers (Schema:1 is deprecated)
// ============================================================================

/**
 * Creates an empty v4 state for migration testing.
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
function reduce(patches) {
  const state = createEmptyState();

  // Expand all patches to (EventId, Op) tuples
  const tuples = [];
  for (const { patch, sha } of patches) {
    for (let index = 0; index < patch.ops.length; index++) {
      tuples.push({
        eventId: createEventId(patch.lamport, patch.writer, sha, index),
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
import { computeStateHashV5, nodeVisibleV5, edgeVisibleV5 } from '../../../../src/domain/services/StateSerializerV5.js';
import { orsetContains, orsetElements } from '../../../../src/domain/crdt/ORSet.js';
import { lwwSet, lwwValue } from '../../../../src/domain/crdt/LWW.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';
import { createVersionVector } from '../../../../src/domain/crdt/VersionVector.js';
import {
  createNodeAdd,
  createNodeTombstone,
  createEdgeAdd,
  createEdgeTombstone,
  createPropSet,
  createInlineValue,
} from '../../../../src/domain/types/WarpTypes.js';
import {
  createPatchV2,
  createNodeAddV2,
  createEdgeAddV2,
  createPropSetV2,
} from '../../../../src/domain/types/WarpTypesV2.js';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.js';

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
function createPatch({ writer, lamport, ops, baseCheckpoint }) {
  /** @type {any} */
  const patch = {
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
 * Helper to create a v4 state with nodes, edges, and props directly
 */
function createV4State({ nodes = /** @type {any[]} */ ([]), edges = /** @type {any[]} */ ([]), props = /** @type {any[]} */ ([]) } = {}) {
  const state = createEmptyState();
  let counter = 0;

  for (const { nodeId, alive } of nodes) {
    const eventId = createEventId(++counter, 'test-writer', 'abcd1234', 0);
    state.nodeAlive.set(nodeId, lwwSet(eventId, alive));
  }

  for (const { from, to, label, alive } of edges) {
    const eventId = createEventId(++counter, 'test-writer', 'abcd1234', 0);
    const edgeKey = encodeEdgeKey(from, to, label);
    state.edgeAlive.set(edgeKey, lwwSet(eventId, alive));
  }

  for (const { nodeId, key, value } of props) {
    const eventId = createEventId(++counter, 'test-writer', 'abcd1234', 0);
    const propKey = encodePropKey(nodeId, key);
    state.prop.set(propKey, lwwSet(eventId, value));
  }

  return state;
}

describe('MigrationService', () => {
  describe('migrateV4toV5', () => {
    describe('empty v4 state produces empty v5 state', () => {
      it('returns empty v5 state for empty v4 state', () => {
        const v4State = createEmptyState();
        const migrationWriterId = 'migration-writer';

        const v5State = migrateV4toV5(v4State, migrationWriterId);

        expect(orsetElements(v5State.nodeAlive)).toHaveLength(0);
        expect(orsetElements(v5State.edgeAlive)).toHaveLength(0);
        expect(v5State.prop.size).toBe(0);
        expect(v5State.observedFrontier.size).toBe(0);
      });
    });

    describe('visible nodes migrate to v5 OR-Set', () => {
      it('migrates single visible node', () => {
        const v4State = createV4State({
          nodes: [{ nodeId: 'node-a', alive: true }],
        });
        const migrationWriterId = 'migration-writer';

        const v5State = migrateV4toV5(v4State, migrationWriterId);

        expect(orsetContains(v5State.nodeAlive, 'node-a')).toBe(true);
        expect(orsetElements(v5State.nodeAlive)).toEqual(['node-a']);
      });

      it('migrates multiple visible nodes', () => {
        const v4State = createV4State({
          nodes: [
            { nodeId: 'node-a', alive: true },
            { nodeId: 'node-b', alive: true },
            { nodeId: 'node-c', alive: true },
          ],
        });
        const migrationWriterId = 'migration-writer';

        const v5State = migrateV4toV5(v4State, migrationWriterId);

        expect(orsetContains(v5State.nodeAlive, 'node-a')).toBe(true);
        expect(orsetContains(v5State.nodeAlive, 'node-b')).toBe(true);
        expect(orsetContains(v5State.nodeAlive, 'node-c')).toBe(true);
        expect(orsetElements(v5State.nodeAlive)).toHaveLength(3);
      });

      it('assigns synthetic dots from migration writer', () => {
        const v4State = createV4State({
          nodes: [
            { nodeId: 'node-a', alive: true },
            { nodeId: 'node-b', alive: true },
          ],
        });
        const migrationWriterId = 'migration-writer';

        const v5State = migrateV4toV5(v4State, migrationWriterId);

        // Each node should have a dot from the migration writer
        // The version vector should track the migration writer's counter
        expect(v5State.observedFrontier.get(migrationWriterId)).toBeGreaterThanOrEqual(2);
      });
    });

    describe('deleted nodes (value=false) do NOT migrate', () => {
      it('does not migrate tombstoned node', () => {
        const v4State = createV4State({
          nodes: [{ nodeId: 'deleted-node', alive: false }],
        });
        const migrationWriterId = 'migration-writer';

        const v5State = migrateV4toV5(v4State, migrationWriterId);

        expect(orsetContains(v5State.nodeAlive, 'deleted-node')).toBe(false);
        expect(orsetElements(v5State.nodeAlive)).toHaveLength(0);
      });

      it('only migrates visible nodes, not tombstoned ones', () => {
        const v4State = createV4State({
          nodes: [
            { nodeId: 'visible-node', alive: true },
            { nodeId: 'deleted-node', alive: false },
          ],
        });
        const migrationWriterId = 'migration-writer';

        const v5State = migrateV4toV5(v4State, migrationWriterId);

        expect(orsetContains(v5State.nodeAlive, 'visible-node')).toBe(true);
        expect(orsetContains(v5State.nodeAlive, 'deleted-node')).toBe(false);
        expect(orsetElements(v5State.nodeAlive)).toEqual(['visible-node']);
      });

      it('handles previously deleted then re-created node (final state visible)', () => {
        // Use reducer to create a realistic v4 state with delete-resurrect cycle
        const patches = [
          {
            patch: createPatch({
              writer: 'W',
              lamport: 1,
              ops: [createNodeAdd('node-x')],
            }),
            sha: 'aaa11111',
          },
          {
            patch: createPatch({
              writer: 'W',
              lamport: 2,
              ops: [createNodeTombstone('node-x')],
            }),
            sha: 'bbb22222',
          },
          {
            patch: createPatch({
              writer: 'W',
              lamport: 3,
              ops: [createNodeAdd('node-x')],
            }),
            sha: 'ccc33333',
          },
        ];

        const v4State = reduce(patches);
        const v5State = migrateV4toV5(v4State, 'migration-writer');

        // Node is visible in v4 after resurrection
        expect(lwwValue(v4State.nodeAlive.get('node-x'))).toBe(true);
        // Node should be present in v5
        expect(orsetContains(v5State.nodeAlive, 'node-x')).toBe(true);
      });
    });

    describe('edges migrate with synthetic dots', () => {
      it('migrates visible edge', () => {
        const v4State = createV4State({
          nodes: [
            { nodeId: 'a', alive: true },
            { nodeId: 'b', alive: true },
          ],
          edges: [{ from: 'a', to: 'b', label: 'rel', alive: true }],
        });
        const migrationWriterId = 'migration-writer';

        const v5State = migrateV4toV5(v4State, migrationWriterId);

        const edgeKey = encodeEdgeKey('a', 'b', 'rel');
        expect(orsetContains(v5State.edgeAlive, edgeKey)).toBe(true);
      });

      it('does not migrate tombstoned edge', () => {
        const v4State = createV4State({
          edges: [{ from: 'a', to: 'b', label: 'rel', alive: false }],
        });
        const migrationWriterId = 'migration-writer';

        const v5State = migrateV4toV5(v4State, migrationWriterId);

        const edgeKey = encodeEdgeKey('a', 'b', 'rel');
        expect(orsetContains(v5State.edgeAlive, edgeKey)).toBe(false);
      });

      it('migrates multiple edges with different labels', () => {
        const v4State = createV4State({
          edges: [
            { from: 'a', to: 'b', label: 'follows', alive: true },
            { from: 'a', to: 'b', label: 'likes', alive: true },
            { from: 'b', to: 'a', label: 'follows', alive: true },
          ],
        });
        const migrationWriterId = 'migration-writer';

        const v5State = migrateV4toV5(v4State, migrationWriterId);

        expect(orsetContains(v5State.edgeAlive, encodeEdgeKey('a', 'b', 'follows'))).toBe(true);
        expect(orsetContains(v5State.edgeAlive, encodeEdgeKey('a', 'b', 'likes'))).toBe(true);
        expect(orsetContains(v5State.edgeAlive, encodeEdgeKey('b', 'a', 'follows'))).toBe(true);
        expect(orsetElements(v5State.edgeAlive)).toHaveLength(3);
      });

      it('filters visible from tombstoned edges', () => {
        const v4State = createV4State({
          edges: [
            { from: 'a', to: 'b', label: 'visible', alive: true },
            { from: 'a', to: 'c', label: 'deleted', alive: false },
          ],
        });
        const migrationWriterId = 'migration-writer';

        const v5State = migrateV4toV5(v4State, migrationWriterId);

        expect(orsetContains(v5State.edgeAlive, encodeEdgeKey('a', 'b', 'visible'))).toBe(true);
        expect(orsetContains(v5State.edgeAlive, encodeEdgeKey('a', 'c', 'deleted'))).toBe(false);
        expect(orsetElements(v5State.edgeAlive)).toHaveLength(1);
      });
    });

    describe('props for visible nodes migrate, props for deleted nodes do NOT', () => {
      it('migrates props for visible node', () => {
        const v4State = createV4State({
          nodes: [{ nodeId: 'node-a', alive: true }],
          props: [
            { nodeId: 'node-a', key: 'name', value: createInlineValue('Alice') },
            { nodeId: 'node-a', key: 'age', value: createInlineValue(30) },
          ],
        });
        const migrationWriterId = 'migration-writer';

        const v5State = migrateV4toV5(v4State, migrationWriterId);

        expect(v5State.prop.size).toBe(2);
        expect(lwwValue(v5State.prop.get(encodePropKey('node-a', 'name')))).toEqual(
          createInlineValue('Alice')
        );
        expect(lwwValue(v5State.prop.get(encodePropKey('node-a', 'age')))).toEqual(
          createInlineValue(30)
        );
      });

      it('does NOT migrate props for deleted node', () => {
        const v4State = createV4State({
          nodes: [{ nodeId: 'deleted-node', alive: false }],
          props: [
            { nodeId: 'deleted-node', key: 'name', value: createInlineValue('Ghost') },
          ],
        });
        const migrationWriterId = 'migration-writer';

        const v5State = migrateV4toV5(v4State, migrationWriterId);

        expect(v5State.prop.size).toBe(0);
      });

      it('migrates props selectively based on node visibility', () => {
        const v4State = createV4State({
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

        const v5State = migrateV4toV5(v4State, migrationWriterId);

        expect(v5State.prop.size).toBe(1);
        expect(lwwValue(v5State.prop.get(encodePropKey('visible-node', 'name')))).toEqual(
          createInlineValue('Visible')
        );
        expect(v5State.prop.has(encodePropKey('deleted-node', 'name'))).toBe(false);
      });

      it('handles props for nodes with no entry in nodeAlive map (dangling)', () => {
        // Create a v4 state with a prop for a node that has no nodeAlive entry
        const v4State = createEmptyState();
        const eventId = createEventId(1, 'test-writer', 'abcd1234', 0);
        v4State.prop.set(
          encodePropKey('orphan-node', 'name'),
          lwwSet(eventId, createInlineValue('Orphan'))
        );

        const migrationWriterId = 'migration-writer';
        const v5State = migrateV4toV5(v4State, migrationWriterId);

        // Orphan props should not be migrated
        expect(v5State.prop.size).toBe(0);
      });
    });

    describe('visible projections match after migration', () => {
      it('v4 visible projection matches v5 visible projection', () => {
        // Build a realistic v4 state via the reducer
        const patches = [
          {
            patch: createPatch({
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
            patch: createPatch({
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
            patch: createPatch({
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

        const v4State = reduce(patches);
        const v5State = migrateV4toV5(v4State, 'migration-writer');

        // Compute visible projection from v4
        const v4VisibleNodes = [];
        for (const [nodeId, reg] of v4State.nodeAlive) {
          if (reg.value === true) {
            v4VisibleNodes.push(nodeId);
          }
        }
        v4VisibleNodes.sort();

        const v4VisibleEdges = [];
        for (const [edgeKey, reg] of v4State.edgeAlive) {
          if (reg.value === true) {
            v4VisibleEdges.push(edgeKey);
          }
        }
        v4VisibleEdges.sort();

        // Compute visible projection from v5
        const v5VisibleNodes = orsetElements(v5State.nodeAlive);
        v5VisibleNodes.sort();

        const v5VisibleEdges = orsetElements(v5State.edgeAlive);
        v5VisibleEdges.sort();

        // They should match
        expect(v5VisibleNodes).toEqual(v4VisibleNodes);
        expect(v5VisibleEdges).toEqual(v4VisibleEdges);
      });

      it('handles mixed visible and tombstoned entities correctly', () => {
        const patches = [
          {
            patch: createPatch({
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
            patch: createPatch({
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

        const v4State = reduce(patches);
        const v5State = migrateV4toV5(v4State, 'migration-writer');

        // v4 should have: nodes a, c visible; node b tombstoned
        expect(lwwValue(v4State.nodeAlive.get('a'))).toBe(true);
        expect(lwwValue(v4State.nodeAlive.get('b'))).toBe(false);
        expect(lwwValue(v4State.nodeAlive.get('c'))).toBe(true);

        // v5 should match the visible projection
        expect(orsetContains(v5State.nodeAlive, 'a')).toBe(true);
        expect(orsetContains(v5State.nodeAlive, 'b')).toBe(false);
        expect(orsetContains(v5State.nodeAlive, 'c')).toBe(true);

        // Edge a->b should be tombstoned, b->c should be visible
        expect(orsetContains(v5State.edgeAlive, encodeEdgeKey('a', 'b', 'link'))).toBe(false);
        expect(orsetContains(v5State.edgeAlive, encodeEdgeKey('b', 'c', 'link'))).toBe(true);
      });

      it('preserves LWW register metadata for props', () => {
        const v4State = createV4State({
          nodes: [{ nodeId: 'node-a', alive: true }],
          props: [{ nodeId: 'node-a', key: 'name', value: createInlineValue('Test') }],
        });

        const v5State = migrateV4toV5(v4State, 'migration-writer');

        // The prop register should preserve its eventId and value
        const v4PropReg = v4State.prop.get(encodePropKey('node-a', 'name'));
        const v5PropReg = v5State.prop.get(encodePropKey('node-a', 'name'));

        expect(v5PropReg).toEqual(v4PropReg);
      });
    });

    describe('version vector tracking', () => {
      it('tracks all synthetic dots in observedFrontier', () => {
        const v4State = createV4State({
          nodes: [
            { nodeId: 'a', alive: true },
            { nodeId: 'b', alive: true },
          ],
          edges: [{ from: 'a', to: 'b', label: 'link', alive: true }],
        });
        const migrationWriterId = 'migration-writer';

        const v5State = migrateV4toV5(v4State, migrationWriterId);

        // 2 nodes + 1 edge = 3 synthetic dots
        expect(v5State.observedFrontier.get(migrationWriterId)).toBe(3);
      });

      it('empty state results in empty version vector', () => {
        const v4State = createEmptyState();
        const v5State = migrateV4toV5(v4State, 'migration-writer');

        expect(v5State.observedFrontier.size).toBe(0);
      });
    });

    // =========================================================================
    // WARP v5 Legacy Check: v4 -> v5 Upgrade with Post-Migration v5 Patches
    // =========================================================================
    describe('v4 -> v5 upgrade (applying v5 patches after migration)', () => {
      it('migrates v4 state and applies v5 patches correctly without data loss', () => {
        // Step 1: Build v4 graph state via v1 patches (LWW-based)
        const v4Patches = [
          {
            patch: createPatch({
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
            patch: createPatch({
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

        // Create v4 state (LWW-based)
        const v4State = reduce(v4Patches);

        // Verify v4 state is correct
        expect(lwwValue(v4State.nodeAlive.get('user:alice'))).toBe(true);
        expect(lwwValue(v4State.nodeAlive.get('user:bob'))).toBe(true);
        expect(lwwValue(v4State.edgeAlive.get(encodeEdgeKey('user:bob', 'user:alice', 'follows')))).toBe(true);

        // Step 2: Migrate to v5 (creates OR-Set based state)
        const v5State = migrateV4toV5(v4State, '__migration__');

        // Verify migration preserved all visible entities
        expect(nodeVisibleV5(v5State, 'user:alice')).toBe(true);
        expect(nodeVisibleV5(v5State, 'user:bob')).toBe(true);
        expect(edgeVisibleV5(v5State, encodeEdgeKeyV5('user:bob', 'user:alice', 'follows'))).toBe(true);

        // Step 3: Apply v5 patches (OR-Set based) AFTER migration
        const v5Patches = [
          {
            patch: createPatchV2({
              writer: 'charlie',
              lamport: 10,
              context: /** @type {any} */ (createVersionVector()),
              ops: [
                createNodeAddV2('user:charlie', createDot('charlie', 1)),
                createPropSetV2('user:charlie', 'name', createInlineValue('Charlie')),
              ],
            }),
            sha: 'cccc3333',
          },
          {
            patch: createPatchV2({
              writer: 'charlie',
              lamport: 11,
              context: /** @type {any} */ (createVersionVector()),
              ops: [
                createEdgeAddV2('user:charlie', 'user:alice', 'follows', createDot('charlie', 2)),
                createEdgeAddV2('user:charlie', 'user:bob', 'follows', createDot('charlie', 3)),
              ],
            }),
            sha: 'dddd4444',
          },
        ];

        // Apply v5 patches to migrated state
        const finalState = reduceV5(v5Patches, v5State);

        // Step 4: Verify NO data loss - all original v4 data is preserved
        expect(nodeVisibleV5(finalState, 'user:alice')).toBe(true);
        expect(nodeVisibleV5(finalState, 'user:bob')).toBe(true);
        expect(edgeVisibleV5(finalState, encodeEdgeKeyV5('user:bob', 'user:alice', 'follows'))).toBe(true);

        // Verify props from v4 are preserved
        const alicePropKey = encodePropKeyV5('user:alice', 'name');
        const bobPropKey = encodePropKeyV5('user:bob', 'name');
        expect(lwwValue(finalState.prop.get(alicePropKey))).toEqual(createInlineValue('Alice'));
        expect(lwwValue(finalState.prop.get(bobPropKey))).toEqual(createInlineValue('Bob'));

        // Step 5: Verify new v5 data is present
        expect(nodeVisibleV5(finalState, 'user:charlie')).toBe(true);
        expect(edgeVisibleV5(finalState, encodeEdgeKeyV5('user:charlie', 'user:alice', 'follows'))).toBe(true);
        expect(edgeVisibleV5(finalState, encodeEdgeKeyV5('user:charlie', 'user:bob', 'follows'))).toBe(true);

        // Verify Charlie's prop
        const charliePropKey = encodePropKeyV5('user:charlie', 'name');
        expect(lwwValue(finalState.prop.get(charliePropKey))).toEqual(createInlineValue('Charlie'));
      });

      it('permutation invariance holds for v5 patches applied after migration', async () => {
        // Build v4 state
        const v4Patches = [
          {
            patch: createPatch({
              writer: 'W',
              lamport: 1,
              ops: [createNodeAdd('existing-node')],
            }),
            sha: 'aaaa1111',
          },
        ];

        const v4State = reduce(v4Patches);
        const v5State = migrateV4toV5(v4State, '__migration__');

        // Multiple v5 patches
        const v5PatchA = {
          patch: createPatchV2({
            writer: 'A',
            lamport: 10,
            context: /** @type {any} */ (createVersionVector()),
            ops: [createNodeAddV2('node-a', createDot('A', 1))],
          }),
          sha: 'aaaa2222',
        };

        const v5PatchB = {
          patch: createPatchV2({
            writer: 'B',
            lamport: 11,
            context: /** @type {any} */ (createVersionVector()),
            ops: [createNodeAddV2('node-b', createDot('B', 1))],
          }),
          sha: 'bbbb3333',
        };

        const v5PatchC = {
          patch: createPatchV2({
            writer: 'C',
            lamport: 12,
            context: /** @type {any} */ (createVersionVector()),
            ops: [createEdgeAddV2('node-a', 'node-b', 'link', createDot('C', 1))],
          }),
          sha: 'cccc4444',
        };

        // Apply in different orders
        const stateABC = reduceV5([v5PatchA, v5PatchB, v5PatchC], v5State);
        const stateCBA = reduceV5([v5PatchC, v5PatchB, v5PatchA], v5State);
        const stateBAC = reduceV5([v5PatchB, v5PatchA, v5PatchC], v5State);

        // All orders produce the same hash (permutation invariance)
        const hashABC = await computeStateHashV5(stateABC, { crypto });
        const hashCBA = await computeStateHashV5(stateCBA, { crypto });
        const hashBAC = await computeStateHashV5(stateBAC, { crypto });

        expect(hashABC).toBe(hashCBA);
        expect(hashABC).toBe(hashBAC);

        // Original v4 data preserved in all cases
        expect(nodeVisibleV5(stateABC, 'existing-node')).toBe(true);
        expect(nodeVisibleV5(stateCBA, 'existing-node')).toBe(true);
        expect(nodeVisibleV5(stateBAC, 'existing-node')).toBe(true);
      });
    });

    // =========================================================================
    // WARP v5 Legacy Check: Mixed Mode (v1/v2 patch interleaving)
    // =========================================================================
    describe('mixed mode: v1/v2 patch handling', () => {
      /**
       * WARP v5 HARD RULE: "No interleaving v1/v2 patches in a single reducer."
       *
       * The migration boundary enforces this at the WarpGraph level:
       * - v1 patches are processed by reduce() (LWW-based) before migration
       * - A v5 checkpoint is created via migrateV4toV5()
       * - v2 patches are processed by reduceV5() (OR-Set based) after migration
       *
       * The reducers themselves do NOT validate patch schema because they
       * trust the migration boundary to be properly enforced by the API layer.
       *
       * These tests document the expected behavior when the boundary is respected.
       */

      it('reduceV5 only processes v2 patches (v1 patches should go through migration first)', () => {
        // Create a v1 patch (schema:1, LWW operations)
        const v1Patch = {
          patch: createPatch({
            writer: 'alice',
            lamport: 1,
            ops: [createNodeAdd('node-from-v1')],
          }),
          sha: 'a1aa1111',
        };

        // Create a v2 patch (schema:2, OR-Set operations with dots)
        const v2Patch = {
          patch: createPatchV2({
            writer: 'bob',
            lamport: 2,
            context: /** @type {any} */ (createVersionVector()),
            ops: [createNodeAddV2('node-from-v2', createDot('bob', 1))],
          }),
          sha: 'b2bb2222',
        };

        // CORRECT WORKFLOW: Process v1 patches first, then migrate, then v2
        const v4State = reduce([v1Patch]);
        const migratedState = migrateV4toV5(v4State, '__migration__');
        const finalState = reduceV5([v2Patch], migratedState);

        // Both nodes visible after proper migration workflow
        expect(nodeVisibleV5(finalState, 'node-from-v1')).toBe(true);
        expect(nodeVisibleV5(finalState, 'node-from-v2')).toBe(true);
      });

      it('migration boundary is the separation point between v1 and v2 patches', () => {
        // Build a v4 graph with multiple v1 patches
        const v1Patches = [
          {
            patch: createPatch({
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
            patch: createPatch({
              writer: 'W',
              lamport: 2,
              ops: [createNodeTombstone('n2')],
            }),
            sha: 'bbbb2222',
          },
        ];

        // BEFORE migration: v4 state via LWW reducer
        const v4State = reduce(v1Patches);
        expect(lwwValue(v4State.nodeAlive.get('n1'))).toBe(true);
        expect(lwwValue(v4State.nodeAlive.get('n2'))).toBe(false); // tombstoned

        // MIGRATION BOUNDARY: Convert to v5
        const v5State = migrateV4toV5(v4State, '__migration__');

        // AFTER migration: Only visible entities survive
        expect(nodeVisibleV5(v5State, 'n1')).toBe(true);
        expect(nodeVisibleV5(v5State, 'n2')).toBe(false); // stays deleted

        // v2 patches can now add new data
        const v2Patches = [
          {
            patch: createPatchV2({
              writer: 'V5-writer',
              lamport: 10,
              context: /** @type {any} */ (createVersionVector()),
              ops: [
                createNodeAddV2('n3', createDot('V5-writer', 1)),
                createEdgeAddV2('n1', 'n3', 'link', createDot('V5-writer', 2)),
              ],
            }),
            sha: 'cccc3333',
          },
        ];

        const finalState = reduceV5(v2Patches, v5State);

        // Verify migration boundary was respected
        expect(nodeVisibleV5(finalState, 'n1')).toBe(true);  // from v4
        expect(nodeVisibleV5(finalState, 'n2')).toBe(false); // tombstoned in v4
        expect(nodeVisibleV5(finalState, 'n3')).toBe(true);  // from v5
        expect(edgeVisibleV5(finalState, encodeEdgeKeyV5('n1', 'n3', 'link'))).toBe(true);
      });

      it('documents that direct mixing of v1/v2 patches is NOT supported', () => {
        /**
         * This test documents the expected behavior when mixing patches.
         * The reducers do NOT validate schema - they trust the migration boundary.
         *
         * If v1 patches were passed to reduceV5, they would be processed
         * incorrectly because v1 patches use different operation types
         * (NodeAdd vs NodeAdd with dot, NodeTombstone vs NodeRemove with observedDots).
         *
         * The proper enforcement happens at WarpGraph._validateMigrationBoundary()
         * which prevents opening a schema:2 graph with v1 history without migration.
         */

        // This demonstrates WHY the migration boundary matters:
        // v1 ops: NodeAdd, NodeTombstone, EdgeAdd, EdgeTombstone, PropSet
        // v2 ops: NodeAdd(with dot), NodeRemove(with observedDots), etc.

        // A v1 patch's NodeAdd has no 'dot' field
        const v1Patch = createPatch({
          writer: 'W',
          lamport: 1,
          ops: [createNodeAdd('test-node')],
        });

        // A v2 patch's NodeAdd HAS a 'dot' field
        const v2Patch = createPatchV2({
          writer: 'W',
          lamport: 1,
          context: /** @type {any} */ (createVersionVector()),
          ops: [createNodeAddV2('test-node', createDot('W', 1))],
        });

        // Verify the structural difference that makes mixing incompatible
        expect(v1Patch.ops[0].type).toBe('NodeAdd');
        expect(v1Patch.ops[0].dot).toBeUndefined(); // v1 has no dot

        expect(v2Patch.ops[0].type).toBe('NodeAdd');
        expect(/** @type {any} */ (v2Patch.ops[0]).dot).toBeDefined(); // v2 has a dot
        expect(/** @type {any} */ (v2Patch.ops[0]).dot.writerId).toBe('W');
        expect(/** @type {any} */ (v2Patch.ops[0]).dot.counter).toBe(1);
      });
    });
  });
});
