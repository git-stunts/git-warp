/**
 * PatchDiff — captures alive-ness transitions during patch application.
 *
 * A diff entry is produced only when the alive-ness state of a node or edge
 * actually changes, or when an LWW property winner changes. Redundant ops
 * (e.g. NodeAdd on an already-alive node) produce no diff entries.
 *
 * @module domain/types/PatchDiff
 */

/**
 * @typedef {Object} EdgeDiffEntry
 * @property {string} from  - Source node ID
 * @property {string} to    - Target node ID
 * @property {string} label - Edge label
 */

/**
 * @typedef {Object} PropDiffEntry
 * @property {string} nodeId   - Node (or edge-prop owner) ID
 * @property {string} key      - Property key
 * @property {unknown} value   - New LWW winner value
 * @property {unknown} prevValue - Previous LWW winner value (undefined if none)
 */

/**
 * PatchDiff — captures alive-ness transitions during patch application.
 */
export class PatchDiff {
  /** @type {EdgeDiffEntry[]} Edges that transitioned not-alive → alive */
  edgesAdded;

  /** @type {EdgeDiffEntry[]} Edges that transitioned alive → not-alive */
  edgesRemoved;

  /** @type {string[]} Nodes that transitioned not-alive → alive */
  nodesAdded;

  /** @type {string[]} Nodes that transitioned alive → not-alive */
  nodesRemoved;

  /** @type {PropDiffEntry[]} Properties whose LWW winner actually changed */
  propsChanged;

  /**
   * Creates a PatchDiff from field values.
   * @param {{ nodesAdded: string[], nodesRemoved: string[], edgesAdded: EdgeDiffEntry[], edgesRemoved: EdgeDiffEntry[], propsChanged: PropDiffEntry[] }} fields
   */
  constructor({ nodesAdded, nodesRemoved, edgesAdded, edgesRemoved, propsChanged }) {
    this.nodesAdded = nodesAdded;
    this.nodesRemoved = nodesRemoved;
    this.edgesAdded = edgesAdded;
    this.edgesRemoved = edgesRemoved;
    this.propsChanged = propsChanged;
  }

  /**
   * Creates an empty PatchDiff.
   * @returns {PatchDiff}
   */
  static empty() {
    return new PatchDiff({
      nodesAdded: [],
      nodesRemoved: [],
      edgesAdded: [],
      edgesRemoved: [],
      propsChanged: [],
    });
  }
}

/**
 * Creates an empty PatchDiff.
 * @returns {PatchDiff}
 */
export function createEmptyDiff() {
  return PatchDiff.empty();
}

/**
 * Merges two PatchDiff objects into a net diff by cancelling out
 * contradictory add/remove pairs.
 *
 * - A node that appears in `a.nodesAdded` and `b.nodesRemoved` (or vice-versa)
 *   is dropped from both lists (the transitions cancel out).
 * - Same logic applies to edges (keyed by `from\0to\0label`).
 * - For `propsChanged`, only the last entry per `(nodeId, key)` is kept.
 *
 * @param {PatchDiff} a
 * @param {PatchDiff} b
 * @returns {PatchDiff}
 */
/**
 * Produces a unique string key for an edge diff entry.
 *
 * @param {EdgeDiffEntry} e - The edge diff entry
 * @returns {string} Composite key using null-byte separators
 */
function edgeKey(e) {
  return `${e.from}\0${e.to}\0${e.label}`;
}

/**
 * Deduplicates property diff entries, keeping the last entry per (nodeId, key).
 *
 * @param {PropDiffEntry[]} allProps - Combined property entries
 * @returns {PropDiffEntry[]} Deduplicated entries
 */
function deduplicateProps(allProps) {
  /** @type {Map<string, PropDiffEntry>} */
  const propMap = new Map();
  for (const entry of allProps) {
    propMap.set(`${entry.nodeId}\0${entry.key}`, entry);
  }
  return [...propMap.values()];
}

/**
 * Merges two PatchDiff objects into a net diff by cancelling out
 * contradictory add/remove pairs.
 *
 * @param {PatchDiff} a - First diff
 * @param {PatchDiff} b - Second diff
 * @returns {PatchDiff} Merged diff with contradictions cancelled
 */
export function mergeDiffs(a, b) {
  const allAdded = a.nodesAdded.concat(b.nodesAdded);
  const allRemoved = a.nodesRemoved.concat(b.nodesRemoved);
  const removedSet = new Set(allRemoved);
  const addedSet = new Set(allAdded);
  const nodesAdded = allAdded.filter((id) => !removedSet.has(id));
  const nodesRemoved = allRemoved.filter((id) => !addedSet.has(id));

  const allEdgesAdded = a.edgesAdded.concat(b.edgesAdded);
  const allEdgesRemoved = a.edgesRemoved.concat(b.edgesRemoved);
  const edgeRemovedSet = new Set(allEdgesRemoved.map(edgeKey));
  const edgeAddedSet = new Set(allEdgesAdded.map(edgeKey));
  const edgesAdded = allEdgesAdded.filter((e) => !edgeRemovedSet.has(edgeKey(e)));
  const edgesRemoved = allEdgesRemoved.filter((e) => !edgeAddedSet.has(edgeKey(e)));

  const propsChanged = deduplicateProps(a.propsChanged.concat(b.propsChanged));

  return new PatchDiff({ nodesAdded, nodesRemoved, edgesAdded, edgesRemoved, propsChanged });
}
