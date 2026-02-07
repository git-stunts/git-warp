/**
 * Creates a v5 checkpoint from v4 visible projection.
 * This is the migration boundary.
 */
import { createEmptyStateV5 } from './JoinReducer.js';
import { orsetAdd } from '../crdt/ORSet.js';
import { createVersionVector, vvIncrement } from '../crdt/VersionVector.js';

/**
 * Migrates a V4 visible-projection state to a V5 state with ORSet internals.
 *
 * Creates synthetic dots for each visible node and edge under the migration
 * writer, rebuilds the ORSet structures, and copies only properties belonging
 * to visible nodes (dropping dangling props from deleted nodes).
 *
 * @param {Object} v4State - The V4 materialized state (visible projection)
 * @param {Map<string, {value: boolean}>} v4State.nodeAlive - V4 node alive map
 * @param {Map<string, {value: boolean}>} v4State.edgeAlive - V4 edge alive map
 * @param {Map<string, *>} v4State.prop - V4 property map
 * @param {string} migrationWriterId - Writer ID to use for synthetic dots
 * @returns {import('./JoinReducer.js').WarpStateV5} The migrated V5 state
 */
export function migrateV4toV5(v4State, migrationWriterId) {
  const v5State = createEmptyStateV5();
  const vv = createVersionVector();

  // For each visible node in v4, add to v5 OR-Set with synthetic dot
  for (const [nodeId, reg] of v4State.nodeAlive) {
    if (reg.value) {
      const dot = vvIncrement(vv, migrationWriterId);
      orsetAdd(v5State.nodeAlive, nodeId, dot);
    }
  }

  // Same for edges
  for (const [edgeKey, reg] of v4State.edgeAlive) {
    if (reg.value) {
      const dot = vvIncrement(vv, migrationWriterId);
      orsetAdd(v5State.edgeAlive, edgeKey, dot);
    }
  }

  // Only copy props for VISIBLE nodes (don't carry dangling props)
  for (const [propKey, reg] of v4State.prop) {
    const idx = propKey.indexOf('\0');
    const nodeId = propKey.slice(0, idx);
    const nodeReg = v4State.nodeAlive.get(nodeId);
    if (nodeReg?.value) {
      v5State.prop.set(propKey, reg);
    }
  }

  v5State.observedFrontier = vv;
  return v5State;
}
