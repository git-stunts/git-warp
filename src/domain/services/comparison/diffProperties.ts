/**
 * Property comparison functions for visible-state diffing.
 *
 * Covers node property maps, edge property maps, and per-node-view property deltas.
 * Pure functions — no side effects, no I/O, no classes.
 *
 * @module domain/services/comparison/diffProperties
 */

import {
  valueKey,
  compareNodePropRefs,
  compareEdgePropRefs,
  compareStrings,
} from './diffKeys.ts';

// ── Node property map diffing ────────────────────────────────────────────────

type NodePropEntry = { node: string; key: string; value: unknown };
type NodePropChanged = { node: string; key: string; leftValue: unknown; rightValue: unknown };

/**
 * Finds removed and changed entries by iterating the left map against the right.
 */
export function findNodePropRemovedAndChanged(
  left: Map<string, NodePropEntry>,
  right: Map<string, NodePropEntry>,
): { removed: NodePropEntry[]; changed: NodePropChanged[] } {
  const removed: NodePropEntry[] = [];
  const changed: NodePropChanged[] = [];
  for (const [key, leftEntry] of left.entries()) {
    const rightEntry = right.get(key);
    if (rightEntry === undefined) {
      removed.push(leftEntry);
      continue;
    }
    if (valueKey(leftEntry.value) !== valueKey(rightEntry.value)) {
      changed.push({
        node: leftEntry.node,
        key: leftEntry.key,
        leftValue: leftEntry.value,
        rightValue: rightEntry.value,
      });
    }
  }
  return { removed, changed };
}

/**
 * Finds entries present in right but absent from left.
 */
export function findNodePropAdded(
  left: Map<string, NodePropEntry>,
  right: Map<string, NodePropEntry>,
): NodePropEntry[] {
  const added: NodePropEntry[] = [];
  for (const [key, rightEntry] of right.entries()) {
    if (!left.has(key)) {
      added.push(rightEntry);
    }
  }
  return added;
}

/**
 * Computes added, removed, and changed deltas between two node property maps.
 */
export function compareNodePropertyMaps(
  left: Map<string, NodePropEntry>,
  right: Map<string, NodePropEntry>,
): { added: NodePropEntry[]; removed: NodePropEntry[]; changed: NodePropChanged[] } {
  const { removed, changed } = findNodePropRemovedAndChanged(left, right);
  const added = findNodePropAdded(left, right);

  added.sort(compareNodePropRefs);
  removed.sort(compareNodePropRefs);
  changed.sort(compareNodePropRefs);

  return { added, removed, changed };
}

// ── Edge property map diffing ────────────────────────────────────────────────

type EdgePropEntry = { from: string; to: string; label: string; key: string; value: unknown };
type EdgePropChanged = { from: string; to: string; label: string; key: string; leftValue: unknown; rightValue: unknown };

/**
 * Finds removed and changed entries by iterating the left edge property map against the right.
 */
export function findEdgePropRemovedAndChanged(
  left: Map<string, EdgePropEntry>,
  right: Map<string, EdgePropEntry>,
): { removed: EdgePropEntry[]; changed: EdgePropChanged[] } {
  const removed: EdgePropEntry[] = [];
  const changed: EdgePropChanged[] = [];
  for (const [key, leftEntry] of left.entries()) {
    const rightEntry = right.get(key);
    if (rightEntry === undefined) {
      removed.push(leftEntry);
      continue;
    }
    if (valueKey(leftEntry.value) !== valueKey(rightEntry.value)) {
      changed.push({
        from: leftEntry.from,
        to: leftEntry.to,
        label: leftEntry.label,
        key: leftEntry.key,
        leftValue: leftEntry.value,
        rightValue: rightEntry.value,
      });
    }
  }
  return { removed, changed };
}

/**
 * Finds edge property entries present in right but absent from left.
 */
export function findEdgePropAdded(
  left: Map<string, EdgePropEntry>,
  right: Map<string, EdgePropEntry>,
): EdgePropEntry[] {
  const added: EdgePropEntry[] = [];
  for (const [key, rightEntry] of right.entries()) {
    if (!left.has(key)) {
      added.push(rightEntry);
    }
  }
  return added;
}

/**
 * Computes added, removed, and changed deltas between two edge property maps.
 */
export function compareEdgePropertyMaps(
  left: Map<string, EdgePropEntry>,
  right: Map<string, EdgePropEntry>,
): { added: EdgePropEntry[]; removed: EdgePropEntry[]; changed: EdgePropChanged[] } {
  const { removed, changed } = findEdgePropRemovedAndChanged(left, right);
  const added = findEdgePropAdded(left, right);

  added.sort(compareEdgePropRefs);
  removed.sort(compareEdgePropRefs);
  changed.sort(compareEdgePropRefs);

  return { added, removed, changed };
}

// ── Per-node-view property diffing ───────────────────────────────────────────

type ViewPropAdded = { key: string; value: unknown };
type ViewPropRemoved = { key: string; value: unknown };
type ViewPropChanged = { key: string; leftValue: unknown; rightValue: unknown };

type ViewPropertyDelta = {
  added: ViewPropAdded[];
  removed: ViewPropRemoved[];
  changed: ViewPropChanged[];
};

/**
 * Computes the ownership status of a key in left and right property records.
 */
export function keyOwnership(
  key: string,
  left: Record<string, unknown>, // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  right: Record<string, unknown>, // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
): { leftHas: boolean; rightHas: boolean } {
  return {
    leftHas: Object.prototype.hasOwnProperty.call(left, key),
    rightHas: Object.prototype.hasOwnProperty.call(right, key),
  };
}

/**
 * Classifies a property key that exists in both sides as changed or unchanged.
 */
export function classifySharedPropertyKey(
  key: string,
  props: { left: Record<string, unknown>; right: Record<string, unknown> }, // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  changed: ViewPropChanged[],
): void {
  if (valueKey(props.left[key]) !== valueKey(props.right[key])) {
    changed.push({ key, leftValue: props.left[key], rightValue: props.right[key] });
  }
}

/**
 * Classifies a single property key into added, removed, or changed.
 */
export function classifyPropertyKey(
  key: string,
  props: { left: Record<string, unknown>; right: Record<string, unknown> }, // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  delta: ViewPropertyDelta,
): void {
  const { leftHas, rightHas } = keyOwnership(key, props.left, props.right);
  if (leftHas && !rightHas) {
    delta.removed.push({ key, value: props.left[key] });
    return;
  }
  if (!leftHas && rightHas) {
    delta.added.push({ key, value: props.right[key] });
    return;
  }
  classifySharedPropertyKey(key, props, delta.changed);
}

/**
 * Compares property records from two node views and returns the delta.
 */
export function compareNodeViewProperties(
  leftProps: Record<string, unknown>, // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  rightProps: Record<string, unknown>, // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
): ViewPropertyDelta {
  const propertyKeys = [
    ...new Set([...Object.keys(leftProps), ...Object.keys(rightProps)]),
  ].sort(compareStrings);
  const propertyDelta: ViewPropertyDelta = { added: [], removed: [], changed: [] };
  const props = { left: leftProps, right: rightProps };

  for (const key of propertyKeys) {
    classifyPropertyKey(key, props, propertyDelta);
  }

  return propertyDelta;
}
