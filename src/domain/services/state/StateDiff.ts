/**
 * StateDiff - Deterministic state diff engine for PULSE subscriptions.
 *
 * Computes what changed between two materialized WarpState states.
 * Used by the subscription system to notify handlers of graph changes.
 *
 * @module domain/services/state/StateDiff
 * @see ROADMAP.md PL/DIFF/1
 */

import { lwwValue } from '../../crdt/LWW.ts';
import { decodeEdgeKey, decodePropKey, isEdgePropKey } from '../KeyCodec.ts';
import type { WarpState } from '../JoinReducer.ts';
import type { LWWRegister } from '../../crdt/LWW.ts';

export interface EdgeChange {
  from: string;
  to: string;
  label: string;
}

export interface PropSet {
  key: string;
  nodeId: string;
  propKey: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface PropRemoved {
  key: string;
  nodeId: string;
  propKey: string;
  oldValue: unknown;
}

export interface StateDiffResult {
  nodes: { added: string[]; removed: string[] };
  edges: { added: EdgeChange[]; removed: EdgeChange[] };
  props: { set: PropSet[]; removed: PropRemoved[] };
}

function compareEdges(a: EdgeChange, b: EdgeChange): number {
  return compareField(a.from, b.from) || compareField(a.to, b.to) || compareField(a.label, b.label);
}

function compareField(x: string, y: string): number {
  if (x < y) { return -1; }
  if (x > y) { return 1; }
  return 0;
}

function compareProps(a: { key: string }, b: { key: string }): number {
  if (a.key < b.key) { return -1; }
  if (a.key > b.key) { return 1; }
  return 0;
}

function arraysEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) { return false; }
  for (let i = 0; i < a.length; i++) {
    if (!deepEqual(a[i], b[i])) { return false; }
  }
  return true;
}

function objectsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) { return false; }
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) { return false; }
    if (!deepEqual(a[key], b[key])) { return false; }
  }
  return true;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) { return true; }
  if (!isNonNullObject(a) || !isNonNullObject(b)) { return false; }
  return deepEqualObjects(a as object, b as object);
}

function deepEqualObjects(a: object, b: object): boolean {
  if (Array.isArray(a)) {
    return Array.isArray(b) && arraysEqual(a, b);
  }
  if (Array.isArray(b)) { return false; }
  return objectsEqual(
    a as Record<string, unknown>,
    b as Record<string, unknown>,
  );
}

function isNonNullObject(value: unknown): boolean {
  return value !== null && typeof value === 'object';
}

function setAdded(before: Set<string>, after: Set<string>): string[] {
  const result: string[] = [];
  for (const item of after) {
    if (!before.has(item)) { result.push(item); }
  }
  return result;
}

function diffNodesAndEdges(
  before: WarpState | null,
  after: WarpState,
): { nodesAdded: string[]; nodesRemoved: string[]; edgesAdded: EdgeChange[]; edgesRemoved: EdgeChange[] } {
  const beforeNodes = before ? new Set(before.nodeAlive.elements()) : new Set<string>();
  const afterNodes = new Set(after.nodeAlive.elements());

  const beforeEdges = before
    ? new Set(
        before.edgeAlive.elements().filter((edgeKey) => {
          const { from, to } = decodeEdgeKey(edgeKey);
          return beforeNodes.has(from) && beforeNodes.has(to);
        })
      )
    : new Set<string>();

  const afterEdges = new Set(
    after.edgeAlive.elements().filter((edgeKey) => {
      const { from, to } = decodeEdgeKey(edgeKey);
      return afterNodes.has(from) && afterNodes.has(to);
    })
  );

  const nodesAdded = setAdded(beforeNodes, afterNodes);
  const nodesRemoved = setAdded(afterNodes, beforeNodes);
  const edgesAdded = setAdded(beforeEdges, afterEdges).map(decodeEdgeKey);
  const edgesRemoved = setAdded(afterEdges, beforeEdges).map(decodeEdgeKey);

  return { nodesAdded, nodesRemoved, edgesAdded, edgesRemoved };
}

function diffProps(
  before: WarpState | null,
  after: WarpState,
): { propsSet: PropSet[]; propsRemoved: PropRemoved[] } {
  const propsSet: PropSet[] = [];
  const propsRemoved: PropRemoved[] = [];
  const beforeProps: Map<string, unknown> = before ? before.prop : new Map();
  const afterProps: Map<string, unknown> = after.prop;
  const allPropKeys = new Set([...beforeProps.keys(), ...afterProps.keys()]);

  for (const key of allPropKeys) {
    if (isEdgePropKey(key)) { continue; }
    accumulatePropChange(key, { beforeProps, afterProps, propsSet, propsRemoved });
  }

  return { propsSet, propsRemoved };
}

interface PropAccumCtx {
  beforeProps: Map<string, unknown>;
  afterProps: Map<string, unknown>;
  propsSet: PropSet[];
  propsRemoved: PropRemoved[];
}

function accumulatePropChange(key: string, ctx: PropAccumCtx): void {
  const change = classifyPropChange(key, ctx.beforeProps, ctx.afterProps);
  if (change === undefined) { return; }
  if ('newValue' in change) {
    ctx.propsSet.push(change as PropSet);
  } else {
    ctx.propsRemoved.push(change as PropRemoved);
  }
}

function classifyPropChange(
  key: string,
  beforeProps: Map<string, unknown>,
  afterProps: Map<string, unknown>,
): PropSet | PropRemoved | undefined {
  const beforeReg = beforeProps.get(key);
  const afterReg = afterProps.get(key);
  const { nodeId, propKey } = decodePropKey(key);

  if (afterReg !== undefined && beforeReg === undefined) {
    return { key, nodeId, propKey, oldValue: undefined, newValue: lwwValue(afterReg as LWWRegister<unknown>) };
  }
  if (afterReg === undefined && beforeReg !== undefined) {
    return { key, nodeId, propKey, oldValue: lwwValue(beforeReg as LWWRegister<unknown>) };
  }
  return classifyPropUpdate({ key, nodeId, propKey, beforeReg, afterReg });
}

function classifyPropUpdate(opts: {
  key: string;
  nodeId: string;
  propKey: string;
  beforeReg: unknown;
  afterReg: unknown;
}): PropSet | undefined {
  const { key, nodeId, propKey, beforeReg, afterReg } = opts;
  if (afterReg === undefined) { return undefined; }
  const beforeValue = lwwValue(beforeReg as LWWRegister<unknown>);
  const afterValue = lwwValue(afterReg as LWWRegister<unknown>);
  if (!deepEqual(beforeValue, afterValue)) {
    return { key, nodeId, propKey, oldValue: beforeValue, newValue: afterValue };
  }
  return undefined;
}

/**
 * Computes a deterministic diff between two materialized states.
 */
export function diffStates(before: WarpState | null, after: WarpState): StateDiffResult {
  const { nodesAdded, nodesRemoved, edgesAdded, edgesRemoved } = diffNodesAndEdges(before, after);
  const { propsSet, propsRemoved } = diffProps(before, after);

  nodesAdded.sort();
  nodesRemoved.sort();
  edgesAdded.sort(compareEdges);
  edgesRemoved.sort(compareEdges);
  propsSet.sort(compareProps);
  propsRemoved.sort(compareProps);

  return {
    nodes: { added: nodesAdded, removed: nodesRemoved },
    edges: { added: edgesAdded, removed: edgesRemoved },
    props: { set: propsSet, removed: propsRemoved },
  };
}

/**
 * Returns true if the diff represents no changes.
 */
export function isEmptyDiff(diff: StateDiffResult): boolean {
  return isEmptyPair(diff.nodes) && isEmptyPair(diff.edges) && isEmptySetRemoved(diff.props);
}

function isEmptyPair(pair: { added: unknown[]; removed: unknown[] }): boolean {
  return pair.added.length === 0 && pair.removed.length === 0;
}

function isEmptySetRemoved(pair: { set: unknown[]; removed: unknown[] }): boolean {
  return pair.set.length === 0 && pair.removed.length === 0;
}

/**
 * Creates an empty diff result.
 */
export function createEmptyDiff(): StateDiffResult {
  return {
    nodes: { added: [], removed: [] },
    edges: { added: [], removed: [] },
    props: { set: [], removed: [] },
  };
}
