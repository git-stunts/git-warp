/**
 * Creates a v5 checkpoint from v4 visible projection.
 * This is the migration boundary.
 */
import { createEmptyStateV5 } from './JoinReducer.js';
import { orsetAdd } from '../crdt/ORSet.js';
import VersionVector from '../crdt/VersionVector.js';

/**
 * Migrates a V4 visible-projection state to a V5 state with ORSet internals.
 *
 * Creates synthetic dots for each visible node and edge under the migration
 * writer, rebuilds the ORSet structures, and copies only properties belonging
 * to visible nodes (dropping dangling props from deleted nodes).
 *
 * @param {{ nodeAlive: Map<string, {value: boolean}>, edgeAlive: Map<string, {value: boolean}>, prop: Map<string, import('../crdt/LWW.js').LWWRegister<unknown>> }} v4State - The V4 materialized state (visible projection)
 * @param {string} migrationWriterId - Writer ID to use for synthetic dots
 * @returns {import('./JoinReducer.js').WarpStateV5} The migrated V5 state
 */
export function migrateV4toV5(v4State, migrationWriterId) {
  const v5State = createEmptyStateV5();
  const vv = VersionVector.empty();

  migrateAliveEntities({ v4State, v5State, vv, migrationWriterId });
  migrateVisibleProps(v4State, v5State);

  v5State.observedFrontier = vv;
  return v5State;
}

/**
 * Migrates alive nodes and edges from v4 to v5 ORSets with synthetic dots.
 *
 * @param {{ v4State: { nodeAlive: Map<string, {value: boolean}>, edgeAlive: Map<string, {value: boolean}> }, v5State: import('./JoinReducer.js').WarpStateV5, vv: import('../crdt/VersionVector.js').default, migrationWriterId: string }} opts
 */
function migrateAliveEntities({ v4State, v5State, vv, migrationWriterId }) {
  for (const [nodeId, reg] of v4State.nodeAlive) {
    if (reg.value) {
      const dot = vv.increment(migrationWriterId);
      orsetAdd(v5State.nodeAlive, nodeId, dot);
    }
  }
  for (const [edgeKey, reg] of v4State.edgeAlive) {
    if (reg.value) {
      const dot = vv.increment(migrationWriterId);
      orsetAdd(v5State.edgeAlive, edgeKey, dot);
    }
  }
}

/**
 * Copies properties for visible nodes only, dropping dangling props from deleted nodes.
 *
 * @param {{ nodeAlive: Map<string, {value: boolean}>, prop: Map<string, import('../crdt/LWW.js').LWWRegister<unknown>> }} v4State
 * @param {import('./JoinReducer.js').WarpStateV5} v5State
 */
function migrateVisibleProps(v4State, v5State) {
  for (const [propKey, reg] of v4State.prop) {
    const idx = propKey.indexOf('\0');
    const nodeId = propKey.slice(0, idx);
    const nodeReg = v4State.nodeAlive.get(nodeId);
    if (nodeReg?.value === true) {
      v5State.prop.set(propKey, reg);
    }
  }
}
