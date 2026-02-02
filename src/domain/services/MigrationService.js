/**
 * Creates a v5 checkpoint from v4 visible projection.
 * This is the migration boundary.
 */
import { createEmptyStateV5 } from './JoinReducer.js';
import { orsetAdd } from '../crdt/ORSet.js';
import { createVersionVector, vvIncrement } from '../crdt/VersionVector.js';

export function migrateV4toV5(v4State, migrationWriterId) {
  const v5State = createEmptyStateV5();
  const vv = createVersionVector();

  // For each visible node in v4, add to v5 OR-Set with synthetic dot
  for (const [nodeId, reg] of v4State.nodeAlive) {
    if (reg.value === true) {
      const dot = vvIncrement(vv, migrationWriterId);
      orsetAdd(v5State.nodeAlive, nodeId, dot);
    }
  }

  // Same for edges
  for (const [edgeKey, reg] of v4State.edgeAlive) {
    if (reg.value === true) {
      const dot = vvIncrement(vv, migrationWriterId);
      orsetAdd(v5State.edgeAlive, edgeKey, dot);
    }
  }

  // Only copy props for VISIBLE nodes (don't carry dangling props)
  for (const [propKey, reg] of v4State.prop) {
    const idx = propKey.indexOf('\0');
    const nodeId = propKey.slice(0, idx);
    const nodeReg = v4State.nodeAlive.get(nodeId);
    if (nodeReg?.value === true) {
      v5State.prop.set(propKey, reg);
    }
  }

  v5State.observedFrontier = vv;
  return v5State;
}
