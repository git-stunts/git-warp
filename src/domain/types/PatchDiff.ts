/**
 * PatchDiff — captures alive-ness transitions during patch application.
 *
 * A diff entry is produced only when the alive-ness state of a node or edge
 * actually changes, or when an LWW property winner changes. Redundant ops
 * (e.g. NodeAdd on an already-alive node) produce no diff entries.
 *
 * @module domain/types/PatchDiff
 */

import PatchError from '../errors/PatchError.ts';
import type { PropValue } from './PropValue.ts';

type EdgeDiffEntryFields = {
  readonly from: string;
  readonly to: string;
  readonly label: string;
};

type PropDiffEntryFields = {
  readonly nodeId: string;
  readonly key: string;
  readonly value: PropValue | undefined;
  readonly prevValue: PropValue | undefined;
};

function requireNonEmptyString(value: string, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new PatchError(`${field} must be a non-empty string`, {
      code: 'E_PATCH_DIFF_FIELD',
      context: { field },
    });
  }
  return value;
}

function requireArray(value: readonly (object | string)[], field: string): void {
  if (!Array.isArray(value)) {
    throw new PatchError(`${field} must be an array`, {
      code: 'E_PATCH_DIFF_ARRAY',
      context: { field },
    });
  }
}

export class EdgeDiffEntry {
  readonly from: string;
  readonly to: string;
  readonly label: string;

  constructor({ from, to, label }: EdgeDiffEntryFields) {
    this.from = requireNonEmptyString(from, 'from');
    this.to = requireNonEmptyString(to, 'to');
    this.label = requireNonEmptyString(label, 'label');
    Object.freeze(this);
  }

  static fromEntry(entry: EdgeDiffEntry | EdgeDiffEntryFields): EdgeDiffEntry {
    return entry instanceof EdgeDiffEntry ? entry : new EdgeDiffEntry(entry);
  }
}

export class PropDiffEntry {
  readonly nodeId: string;
  readonly key: string;
  readonly value: PropValue | undefined;
  readonly prevValue: PropValue | undefined;

  constructor({ nodeId, key, value, prevValue }: PropDiffEntryFields) {
    this.nodeId = requireNonEmptyString(nodeId, 'nodeId');
    this.key = requireNonEmptyString(key, 'key');
    this.value = value;
    this.prevValue = prevValue;
    Object.freeze(this);
  }

  static fromEntry(entry: PropDiffEntry | PropDiffEntryFields): PropDiffEntry {
    return entry instanceof PropDiffEntry ? entry : new PropDiffEntry(entry);
  }
}

/**
 * PatchDiff — captures alive-ness transitions during patch application.
 */
export class PatchDiff {
  /** Edges that transitioned not-alive -> alive */
  readonly edgesAdded: readonly EdgeDiffEntry[];

  /** Edges that transitioned alive -> not-alive */
  readonly edgesRemoved: readonly EdgeDiffEntry[];

  /** Nodes that transitioned not-alive -> alive */
  readonly nodesAdded: readonly string[];

  /** Nodes that transitioned alive -> not-alive */
  readonly nodesRemoved: readonly string[];

  /** Properties whose LWW winner actually changed */
  readonly propsChanged: readonly PropDiffEntry[];

  /**
   * Creates a PatchDiff from field values.
   */
  constructor({ nodesAdded, nodesRemoved, edgesAdded, edgesRemoved, propsChanged }: {
    nodesAdded: readonly string[];
    nodesRemoved: readonly string[];
    edgesAdded: readonly EdgeDiffEntry[];
    edgesRemoved: readonly EdgeDiffEntry[];
    propsChanged: readonly PropDiffEntry[];
  }) {
    requireArray(nodesAdded, 'nodesAdded');
    requireArray(nodesRemoved, 'nodesRemoved');
    requireArray(edgesAdded, 'edgesAdded');
    requireArray(edgesRemoved, 'edgesRemoved');
    requireArray(propsChanged, 'propsChanged');
    this.nodesAdded = Object.freeze(nodesAdded.map((nodeId) => requireNonEmptyString(nodeId, 'nodeId')));
    this.nodesRemoved = Object.freeze(nodesRemoved.map((nodeId) => requireNonEmptyString(nodeId, 'nodeId')));
    this.edgesAdded = Object.freeze(edgesAdded.map((entry) => EdgeDiffEntry.fromEntry(entry)));
    this.edgesRemoved = Object.freeze(edgesRemoved.map((entry) => EdgeDiffEntry.fromEntry(entry)));
    this.propsChanged = Object.freeze(propsChanged.map((entry) => PropDiffEntry.fromEntry(entry)));
    Object.freeze(this);
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

export type MutablePatchDiff = {
  readonly edgesAdded: EdgeDiffEntry[];
  readonly edgesRemoved: EdgeDiffEntry[];
  readonly nodesAdded: string[];
  readonly nodesRemoved: string[];
  readonly propsChanged: PropDiffEntry[];
};

export function createPatchDiffAccumulator(): MutablePatchDiff {
  return {
    edgesAdded: [],
    edgesRemoved: [],
    nodesAdded: [],
    nodesRemoved: [],
    propsChanged: [],
  };
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
function deduplicateProps(allProps: readonly PropDiffEntry[]): PropDiffEntry[] {
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
