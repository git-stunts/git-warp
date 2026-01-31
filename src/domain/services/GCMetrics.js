/**
 * GCMetrics - Collects garbage collection metrics from WARP V5 state.
 */

/**
 * @typedef {Object} GCMetrics
 * @property {number} nodeEntries - Total dot entries in nodeAlive
 * @property {number} edgeEntries - Total dot entries in edgeAlive
 * @property {number} totalEntries - Sum of all entries
 * @property {number} nodeTombstones - Tombstoned dots in nodeAlive that reference entry dots
 * @property {number} edgeTombstones - Tombstoned dots in edgeAlive that reference entry dots
 * @property {number} totalTombstones - Sum of all tombstones
 * @property {number} nodeLiveDots - Live (non-tombstoned) dots in nodeAlive
 * @property {number} edgeLiveDots - Live (non-tombstoned) dots in edgeAlive
 * @property {number} totalLiveDots - Sum of all live dots
 * @property {number} tombstoneRatio - Ratio of tombstones to (tombstones + liveDots)
 */

/**
 * Counts total entries (dots) in an ORSet across all elements.
 * @param {import('../crdt/ORSet.js').ORSet} orset
 * @returns {number}
 */
export function countEntries(orset) {
  let count = 0;
  for (const dots of orset.entries.values()) {
    count += dots.size;
  }
  return count;
}

/**
 * Counts live dots in an ORSet (entries minus tombstoned).
 * @param {import('../crdt/ORSet.js').ORSet} orset
 * @returns {number}
 */
export function countLiveDots(orset) {
  let count = 0;
  for (const dots of orset.entries.values()) {
    for (const dot of dots) {
      if (!orset.tombstones.has(dot)) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Counts tombstones in an ORSet that reference entry dots.
 * Only counts tombstones that actually correspond to dots in entries.
 * @param {import('../crdt/ORSet.js').ORSet} orset
 * @returns {number}
 */
export function countTombstones(orset) {
  let count = 0;
  for (const dots of orset.entries.values()) {
    for (const dot of dots) {
      if (orset.tombstones.has(dot)) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Collects GC metrics from state.
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @returns {GCMetrics}
 */
export function collectGCMetrics(state) {
  const nodeEntries = countEntries(state.nodeAlive);
  const edgeEntries = countEntries(state.edgeAlive);
  const totalEntries = nodeEntries + edgeEntries;

  const nodeLiveDots = countLiveDots(state.nodeAlive);
  const edgeLiveDots = countLiveDots(state.edgeAlive);
  const totalLiveDots = nodeLiveDots + edgeLiveDots;

  const nodeTombstones = countTombstones(state.nodeAlive);
  const edgeTombstones = countTombstones(state.edgeAlive);
  const totalTombstones = nodeTombstones + edgeTombstones;

  // tombstoneRatio = tombstones / (tombstones + liveDots)
  const denominator = totalTombstones + totalLiveDots;
  const tombstoneRatio = denominator > 0 ? totalTombstones / denominator : 0;

  return {
    nodeEntries,
    edgeEntries,
    totalEntries,
    nodeTombstones,
    edgeTombstones,
    totalTombstones,
    nodeLiveDots,
    edgeLiveDots,
    totalLiveDots,
    tombstoneRatio,
  };
}
