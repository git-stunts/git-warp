/**
 * PatchDiff — captures alive-ness transitions during patch application.
 *
 * A diff entry is produced only when the alive-ness state of a node or edge
 * actually changes, or when an LWW property winner changes. Redundant ops
 * (e.g. NodeAdd on an already-alive node) produce no diff entries.
 *
 * @module domain/types/PatchDiff
 */

export type EdgeDiffEntry = {
  from: string;
  to: string;
  label: string;
};

export type PropDiffEntry = {
  nodeId: string;
  key: string;
  value: unknown;
  prevValue: unknown;
};

/**
 * PatchDiff — captures alive-ness transitions during patch application.
 */
export class PatchDiff {
  /** Edges that transitioned not-alive -> alive */
  edgesAdded: EdgeDiffEntry[];

  /** Edges that transitioned alive -> not-alive */
  edgesRemoved: EdgeDiffEntry[];

  /** Nodes that transitioned not-alive -> alive */
  nodesAdded: string[];

  /** Nodes that transitioned alive -> not-alive */
  nodesRemoved: string[];

  /** Properties whose LWW winner actually changed */
  propsChanged: PropDiffEntry[];

  /**
   * Creates a PatchDiff from field values.
   */
  constructor({ nodesAdded, nodesRemoved, edgesAdded, edgesRemoved, propsChanged }: {
    nodesAdded: string[];
    nodesRemoved: string[];
    edgesAdded: EdgeDiffEntry[];
    edgesRemoved: EdgeDiffEntry[];
    propsChanged: PropDiffEntry[];
  }) {
    this.nodesAdded = nodesAdded;
    this.nodesRemoved = nodesRemoved;
    this.edgesAdded = edgesAdded;
    this.edgesRemoved = edgesRemoved;
    this.propsChanged = propsChanged;
  }

  /**
   * Creates an empty PatchDiff.
   */
  static empty(): PatchDiff {
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
 */
export function createEmptyDiff(): PatchDiff {
  return PatchDiff.empty();
}

/**
 * Produces a unique string key for an edge diff entry.
 */
function edgeKey(e: EdgeDiffEntry): string {
  return `${e.from}\0${e.to}\0${e.label}`;
}

/**
 * Deduplicates property diff entries, keeping the last entry per (nodeId, key).
 */
function deduplicateProps(allProps: PropDiffEntry[]): PropDiffEntry[] {
  const propMap = new Map<string, PropDiffEntry>();
  for (const entry of allProps) {
    propMap.set(`${entry.nodeId}\0${entry.key}`, entry);
  }
  return [...propMap.values()];
}

/**
 * Merges two PatchDiff objects into a net diff by cancelling out
 * contradictory add/remove pairs.
 *
 * - A node that appears in `a.nodesAdded` and `b.nodesRemoved` (or vice-versa)
 *   is dropped from both lists (the transitions cancel out).
 * - Same logic applies to edges (keyed by `from\0to\0label`).
 * - For `propsChanged`, only the last entry per `(nodeId, key)` is kept.
 */
export function mergeDiffs(a: PatchDiff, b: PatchDiff): PatchDiff {
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
