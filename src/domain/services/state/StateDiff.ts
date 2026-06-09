/**
 * StateDiff - Deterministic state diff engine for PULSE subscriptions.
 *
 * Computes what changed between two materialized WarpState states.
 * Used by the subscription system to notify handlers of graph changes.
 *
 * @module domain/services/state/StateDiff
 * @see ROADMAP.md PL/DIFF/1
 */

import { lwwValue, type LWWRegister } from '../../crdt/LWW.ts';
import { decodeEdgeKey, decodePropKey, isEdgePropKey } from '../KeyCodec.ts';
import type { WarpState } from '../JoinReducer.ts';
import type { PropValue } from '../../types/PropValue.ts';
import WarpStateClass from './WarpState.ts';
import { compareEdgeChanges, comparePropChanges } from './StateDiffOrdering.ts';
import { stateDiffValuesEqual } from './StateDiffValueEquality.ts';

export interface EdgeChange {
  from: string;
  to: string;
  label: string;
}

export interface PropSet {
  key: string;
  nodeId: string;
  propKey: string;
  oldValue: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  newValue: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
}

export interface PropRemoved {
  key: string;
  nodeId: string;
  propKey: string;
  oldValue: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
}

type StateDiffResultFields = {
  readonly nodes: { readonly added: string[]; readonly removed: string[] };
  readonly edges: { readonly added: EdgeChange[]; readonly removed: EdgeChange[] };
  readonly props: { readonly set: PropSet[]; readonly removed: PropRemoved[] };
};

function freezeStringArray(values: readonly string[]): readonly string[] {
  return Object.freeze([...values]);
}

function freezeObjectArray<T extends object>(values: readonly T[]): readonly Readonly<T>[] {
  return Object.freeze(values.map((value) => Object.freeze({ ...value })));
}

export class StateDiffResult {
  readonly nodes: { readonly added: readonly string[]; readonly removed: readonly string[] };
  readonly edges: { readonly added: readonly Readonly<EdgeChange>[]; readonly removed: readonly Readonly<EdgeChange>[] };
  readonly props: { readonly set: readonly Readonly<PropSet>[]; readonly removed: readonly Readonly<PropRemoved>[] };

  constructor({ nodes, edges, props }: StateDiffResultFields) {
    this.nodes = Object.freeze({
      added: freezeStringArray(nodes.added),
      removed: freezeStringArray(nodes.removed),
    });
    this.edges = Object.freeze({
      added: freezeObjectArray(edges.added),
      removed: freezeObjectArray(edges.removed),
    });
    this.props = Object.freeze({
      set: freezeObjectArray(props.set),
      removed: freezeObjectArray(props.removed),
    });
    Object.freeze(this);
  }
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
  const beforeProps = before
    ? new Map<string, LWWRegister<PropValue>>(WarpStateClass.allPropEntriesFromState(before))
    : new Map<string, LWWRegister<PropValue>>();
  const afterProps = new Map<string, LWWRegister<PropValue>>(WarpStateClass.allPropEntriesFromState(after));
  const allPropKeys = new Set([...beforeProps.keys(), ...afterProps.keys()]);

  for (const key of allPropKeys) {
    if (isEdgePropKey(key)) { continue; }
    accumulatePropChange(key, { beforeProps, afterProps, propsSet, propsRemoved });
  }

  return { propsSet, propsRemoved };
}

interface PropAccumCtx {
  beforeProps: Map<string, LWWRegister<PropValue>>;
  afterProps: Map<string, LWWRegister<PropValue>>;
  propsSet: PropSet[];
  propsRemoved: PropRemoved[];
}

function accumulatePropChange(key: string, ctx: PropAccumCtx): void {
  const change = classifyPropChange(key, ctx.beforeProps, ctx.afterProps);
  if (change === undefined) { return; }
  if ('newValue' in change) {
    ctx.propsSet.push(change);
  } else {
    ctx.propsRemoved.push(change);
  }
}

function classifyPropChange(
  key: string,
  beforeProps: Map<string, LWWRegister<PropValue>>,
  afterProps: Map<string, LWWRegister<PropValue>>,
): PropSet | PropRemoved | undefined {
  const beforeReg = beforeProps.get(key);
  const afterReg = afterProps.get(key);
  const { nodeId, propKey } = decodePropKey(key);
  const addition = classifyPropAddition({ key, nodeId, propKey, beforeReg, afterReg });
  if (addition !== undefined) { return addition; }
  const removal = classifyPropRemoval({ key, nodeId, propKey, beforeReg, afterReg });
  if (removal !== undefined) { return removal; }
  return classifyPropUpdateIfComplete({ key, nodeId, propKey, beforeReg, afterReg });
}

function classifyPropAddition(opts: {
  key: string;
  nodeId: string;
  propKey: string;
  beforeReg: LWWRegister<PropValue> | undefined;
  afterReg: LWWRegister<PropValue> | undefined;
}): PropSet | undefined {
  const { key, nodeId, propKey, beforeReg, afterReg } = opts;
  if (afterReg !== undefined && beforeReg === undefined) {
    return { key, nodeId, propKey, oldValue: undefined, newValue: lwwValue(afterReg) };
  }
  return undefined;
}

function classifyPropRemoval(opts: {
  key: string;
  nodeId: string;
  propKey: string;
  beforeReg: LWWRegister<PropValue> | undefined;
  afterReg: LWWRegister<PropValue> | undefined;
}): PropRemoved | undefined {
  const { key, nodeId, propKey, beforeReg, afterReg } = opts;
  if (afterReg === undefined && beforeReg !== undefined) {
    return { key, nodeId, propKey, oldValue: lwwValue(beforeReg) };
  }
  return undefined;
}

function classifyPropUpdateIfComplete(opts: {
  key: string;
  nodeId: string;
  propKey: string;
  beforeReg: LWWRegister<PropValue> | undefined;
  afterReg: LWWRegister<PropValue> | undefined;
}): PropSet | undefined {
  const { key, nodeId, propKey, beforeReg, afterReg } = opts;
  if (beforeReg === undefined || afterReg === undefined) {
    return undefined;
  }
  return classifyPropUpdate({ key, nodeId, propKey, beforeReg, afterReg });
}

function classifyPropUpdate(opts: {
  key: string;
  nodeId: string;
  propKey: string;
  beforeReg: LWWRegister<PropValue>;
  afterReg: LWWRegister<PropValue>;
}): PropSet | undefined {
  const { key, nodeId, propKey, beforeReg, afterReg } = opts;
  const beforeValue = lwwValue(beforeReg);
  const afterValue = lwwValue(afterReg);
  if (!stateDiffValuesEqual(beforeValue, afterValue)) {
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
  edgesAdded.sort(compareEdgeChanges);
  edgesRemoved.sort(compareEdgeChanges);
  propsSet.sort(comparePropChanges);
  propsRemoved.sort(comparePropChanges);

  return new StateDiffResult({
    nodes: { added: nodesAdded, removed: nodesRemoved },
    edges: { added: edgesAdded, removed: edgesRemoved },
    props: { set: propsSet, removed: propsRemoved },
  });
}

/**
 * Returns true if the diff represents no changes.
 */
export function isEmptyDiff(diff: StateDiffResult): boolean {
  return isEmptyPair(diff.nodes) && isEmptyPair(diff.edges) && isEmptySetRemoved(diff.props);
}

function isEmptyPair(pair: { readonly added: readonly unknown[]; readonly removed: readonly unknown[] }): boolean { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return pair.added.length === 0 && pair.removed.length === 0;
}

function isEmptySetRemoved(pair: { readonly set: readonly unknown[]; readonly removed: readonly unknown[] }): boolean { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return pair.set.length === 0 && pair.removed.length === 0;
}

/**
 * Creates an empty diff result.
 */
export function createEmptyDiff(): StateDiffResult {
  return new StateDiffResult({
    nodes: { added: [], removed: [] },
    edges: { added: [], removed: [] },
    props: { set: [], removed: [] },
  });
}
