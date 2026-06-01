import { Dot } from "../crdt/Dot.ts";
import { LWWRegister } from "../crdt/LWW.ts";
import VersionVector from "../crdt/VersionVector.ts";
import PatchError from "../errors/PatchError.ts";
import StateSession from "../orset/session/StateSession.ts";
import { createTickReceipt, type OpOutcome, type TickReceipt } from "../types/TickReceipt.ts";
import BlobValue from "../types/ops/BlobValue.ts";
import EdgeAdd from "../types/ops/EdgeAdd.ts";
import EdgePropSet from "../types/ops/EdgePropSet.ts";
import EdgeRemove from "../types/ops/EdgeRemove.ts";
import NodeAdd from "../types/ops/NodeAdd.ts";
import NodePropSet from "../types/ops/NodePropSet.ts";
import NodeRemove from "../types/ops/NodeRemove.ts";
import Op from "../types/ops/Op.ts";
import type OpOutcomeResult from "../types/ops/OpOutcomeResult.ts";
import OpApplied from "../types/ops/OpApplied.ts";
import OpRedundant from "../types/ops/OpRedundant.ts";
import OpSuperseded from "../types/ops/OpSuperseded.ts";
import PropSet from "../types/ops/PropSet.ts";
import { createEmptyDiff, mergeDiffs, type PatchDiff } from "../types/PatchDiff.ts";
import { compareEventIds, EventId } from "../utils/EventId.ts";
import {
  encodeEdgeKey,
  encodeEdgePropKey,
  encodePropKey,
  normalizeRawOp,
  type PatchLike, // nosemgrep: ts-no-like-types -- 0025C
} from "./JoinReducer.ts";

type ReducerPropValue =
  | string
  | number
  | boolean
  | null
  | Uint8Array
  | ReducerPropValue[]
  | { [key: string]: ReducerPropValue };

type ReducerPropInput = PropSet["value"];

type ReplayDiffSnapshot =
  | { readonly kind: "node-add"; readonly target: string; readonly aliveBefore: boolean }
  | { readonly kind: "node-remove"; readonly target: string; readonly aliveBefore: boolean }
  | { readonly kind: "edge-add"; readonly target: string; readonly edge: { readonly from: string; readonly to: string; readonly label: string }; readonly aliveBefore: boolean }
  | { readonly kind: "edge-remove"; readonly target: string; readonly edge: { readonly from: string; readonly to: string; readonly label: string }; readonly aliveBefore: boolean }
  | { readonly kind: "prop"; readonly nodeId: string; readonly key: string; readonly storageKey: string; readonly prevValue?: ReducerPropValue }
  | { readonly kind: "none" };

type ReplayMode = "fast" | "diff" | "receipt";

export class ReducerSessionFrame {
  readonly session: StateSession;
  readonly prop: Map<string, LWWRegister<ReducerPropValue>>;
  readonly observedFrontier: VersionVector;
  readonly edgeBirthEvent: Map<string, EventId>;

  constructor(fields: {
    readonly session: StateSession;
    readonly prop: Map<string, LWWRegister<ReducerPropValue>>;
    readonly observedFrontier: VersionVector;
    readonly edgeBirthEvent: Map<string, EventId>;
  }) {
    if (!(fields.session instanceof StateSession)) {
      throw new PatchError("ReducerSessionFrame requires a StateSession");
    }
    if (!(fields.prop instanceof Map)) {
      throw new PatchError("ReducerSessionFrame requires a prop Map");
    }
    if (!(fields.observedFrontier instanceof VersionVector)) {
      throw new PatchError("ReducerSessionFrame requires a VersionVector");
    }
    if (!(fields.edgeBirthEvent instanceof Map)) {
      throw new PatchError("ReducerSessionFrame requires an edgeBirthEvent Map");
    }
    this.session = fields.session;
    this.prop = fields.prop;
    this.observedFrontier = fields.observedFrontier;
    this.edgeBirthEvent = fields.edgeBirthEvent;
    Object.freeze(this);
  }

  propSize(): number {
    return this.prop.size;
  }

  hasProp(encodedKey: string): boolean {
    return this.prop.has(encodedKey);
  }

  getEncodedProp(encodedKey: string): LWWRegister<ReducerPropValue> | undefined {
    return this.prop.get(encodedKey);
  }
}

export async function applyFastInSession(
  frame: ReducerSessionFrame,
  patch: PatchLike, // nosemgrep: ts-no-like-types -- 0025C
  patchSha: string,
): Promise<void> {
  await applyPatchInSession(frame, patch, patchSha, "fast");
}

export async function applyWithDiffInSession(
  frame: ReducerSessionFrame,
  patch: PatchLike, // nosemgrep: ts-no-like-types -- 0025C
  patchSha: string,
): Promise<PatchDiff> {
  const result = await applyPatchInSession(frame, patch, patchSha, "diff");
  return result.diff;
}

export async function applyWithReceiptInSession(
  frame: ReducerSessionFrame,
  patch: PatchLike, // nosemgrep: ts-no-like-types -- 0025C
  patchSha: string,
): Promise<TickReceipt> {
  const result = await applyPatchInSession(frame, patch, patchSha, "receipt");
  return result.receipt;
}

export function reduceV5InSession(
  patches: ReadonlyArray<{ readonly patch: PatchLike; readonly sha: string }>, // nosemgrep: ts-no-like-types -- 0025C
  frame: ReducerSessionFrame,
): Promise<ReducerSessionFrame>;
export function reduceV5InSession(
  patches: ReadonlyArray<{ readonly patch: PatchLike; readonly sha: string }>, // nosemgrep: ts-no-like-types -- 0025C
  frame: ReducerSessionFrame,
  options: { readonly receipts: true },
): Promise<{ frame: ReducerSessionFrame; receipts: TickReceipt[] }>;
export function reduceV5InSession(
  patches: ReadonlyArray<{ readonly patch: PatchLike; readonly sha: string }>, // nosemgrep: ts-no-like-types -- 0025C
  frame: ReducerSessionFrame,
  options: { readonly trackDiff: true },
): Promise<{ frame: ReducerSessionFrame; diff: PatchDiff }>;
export async function reduceV5InSession(
  patches: ReadonlyArray<{ readonly patch: PatchLike; readonly sha: string }>, // nosemgrep: ts-no-like-types -- 0025C
  frame: ReducerSessionFrame,
  options?: { readonly receipts?: boolean; readonly trackDiff?: boolean },
): Promise<
  ReducerSessionFrame | { frame: ReducerSessionFrame; receipts: TickReceipt[] } | { frame: ReducerSessionFrame; diff: PatchDiff }
> {
  if (options?.receipts === true) {
    const receipts: TickReceipt[] = [];
    for (const { patch, sha } of patches) {
      receipts.push(await applyWithReceiptInSession(frame, patch, sha));
    }
    return { frame, receipts };
  }

  if (options?.trackDiff === true) {
    let merged = createEmptyDiff();
    for (const { patch, sha } of patches) {
      merged = mergeDiffs(merged, await applyWithDiffInSession(frame, patch, sha));
    }
    return { frame, diff: merged };
  }

  for (const { patch, sha } of patches) {
    await applyFastInSession(frame, patch, sha);
  }
  return frame;
}

export async function joinFrames(
  left: ReducerSessionFrame,
  right: ReducerSessionFrame,
): Promise<ReducerSessionFrame> {
  await mergeLiveNodesInto(left.session, right.session);
  await mergeLiveEdgesInto(left.session, right.session);
  return new ReducerSessionFrame({
    session: left.session,
    prop: mergePropMaps(left.prop, right.prop),
    observedFrontier: left.observedFrontier.merge(right.observedFrontier),
    edgeBirthEvent: mergeEdgeBirthEvents(left.edgeBirthEvent, right.edgeBirthEvent),
  });
}

async function applyPatchInSession(
  frame: ReducerSessionFrame,
  patch: PatchLike, // nosemgrep: ts-no-like-types -- 0025C
  patchSha: string,
  mode: ReplayMode,
): Promise<{ readonly diff: PatchDiff; readonly receipt: TickReceipt }> {
  const diff = createEmptyDiff();
  const receiptOps: OpOutcome[] = [];

  for (let i = 0; i < patch.ops.length; i += 1) {
    const rawOp = patch.ops[i];
    if (rawOp === undefined) {
      continue;
    }
    const canonOp = normalizeRawOp(rawOp);
    if (!(canonOp instanceof Op)) {
      continue;
    }
    canonOp.validate();
    const eventId = new EventId(patch.lamport, patch.writer, patchSha, i);
    if (mode === "receipt") {
      const outcome = await computeOutcome(frame, canonOp, eventId);
      receiptOps.push(toReceiptOutcome(canonOp.receiptName, outcome));
    }
    const before = mode === "diff"
      ? await snapshotForDiff(frame, canonOp)
      : { kind: "none" } satisfies ReplayDiffSnapshot;
    await mutateInSession(frame, canonOp, eventId);
    if (mode === "diff") {
      await accumulateDiff(diff, frame, before);
    }
  }

  foldPatchIntoFrame(frame, patch);

  return {
    diff,
    receipt: createTickReceipt({
      patchSha,
      writer: patch.writer,
      lamport: patch.lamport,
      ops: receiptOps,
    }),
  };
}

async function computeOutcome(
  frame: ReducerSessionFrame,
  op: Op,
  eventId: EventId,
): Promise<OpOutcomeResult> {
  if (op instanceof NodeAdd) {
    const dots = await frame.session.nodeDots(op.node);
    return dots.has(Dot.encode(op.dot))
      ? new OpRedundant(op.node)
      : new OpApplied(op.node);
  }
  if (op instanceof NodeRemove) {
    const dots = await frame.session.nodeDots(op.node);
    return hasEffectiveRemoval(dots, op.observedDots)
      ? new OpApplied(op.node)
      : new OpRedundant(op.node);
  }
  if (op instanceof EdgeAdd) {
    const edgeKey = encodeEdgeKey(op.from, op.to, op.label);
    const dots = await frame.session.edgeDots(edgeKey);
    return dots.has(Dot.encode(op.dot))
      ? new OpRedundant(edgeKey)
      : new OpApplied(edgeKey);
  }
  if (op instanceof EdgeRemove) {
    const edgeKey = encodeEdgeKey(op.from, op.to, op.label);
    const dots = await frame.session.edgeDots(edgeKey);
    return hasEffectiveRemoval(dots, op.observedDots)
      ? new OpApplied(edgeKey)
      : new OpRedundant(edgeKey);
  }
  if (op instanceof PropSet) {
    return propertyOutcome(frame.prop, encodePropKey(op.node, op.key), eventId);
  }
  if (op instanceof NodePropSet) {
    return propertyOutcome(frame.prop, encodePropKey(op.node, op.key), eventId);
  }
  if (op instanceof EdgePropSet) {
    return propertyOutcome(
      frame.prop,
      encodeEdgePropKey(op.from, op.to, op.label, op.key),
      eventId,
    );
  }
  if (op instanceof BlobValue) {
    return new OpApplied(op.oid);
  }
  throw new PatchError(`Unsupported canonical op for session replay: ${op.type}`);
}

async function snapshotForDiff(
  frame: ReducerSessionFrame,
  op: Op,
): Promise<ReplayDiffSnapshot> {
  if (op instanceof NodeAdd) {
    return {
      kind: "node-add",
      target: op.node,
      aliveBefore: await frame.session.nodeContains(op.node),
    };
  }
  if (op instanceof NodeRemove) {
    return {
      kind: "node-remove",
      target: op.node,
      aliveBefore: await frame.session.nodeContains(op.node),
    };
  }
  if (op instanceof EdgeAdd) {
    const target = encodeEdgeKey(op.from, op.to, op.label);
    return {
      kind: "edge-add",
      target,
      edge: { from: op.from, to: op.to, label: op.label },
      aliveBefore: await frame.session.edgeContains(target),
    };
  }
  if (op instanceof EdgeRemove) {
    const target = encodeEdgeKey(op.from, op.to, op.label);
    return {
      kind: "edge-remove",
      target,
      edge: { from: op.from, to: op.to, label: op.label },
      aliveBefore: await frame.session.edgeContains(target),
    };
  }
  if (op instanceof PropSet) {
    return propertySnapshot(frame.prop, op.node, op.key, encodePropKey(op.node, op.key));
  }
  if (op instanceof NodePropSet) {
    return propertySnapshot(frame.prop, op.node, op.key, encodePropKey(op.node, op.key));
  }
  if (op instanceof EdgePropSet) {
    return propertySnapshot(
      frame.prop,
      encodeEdgeKey(op.from, op.to, op.label),
      op.key,
      encodeEdgePropKey(op.from, op.to, op.label, op.key),
    );
  }
  return { kind: "none" };
}

async function mutateInSession(
  frame: ReducerSessionFrame,
  op: Op,
  eventId: EventId,
): Promise<void> {
  if (op instanceof NodeAdd) {
    await frame.session.addNode(op.node, op.dot);
    return;
  }
  if (op instanceof NodeRemove) {
    await frame.session.removeNodes(new Set(op.observedDots));
    return;
  }
  if (op instanceof EdgeAdd) {
    const edgeKey = encodeEdgeKey(op.from, op.to, op.label);
    await frame.session.addEdge(edgeKey, op.dot);
    const previous = frame.edgeBirthEvent.get(edgeKey);
    if (previous === undefined || compareEventIds(eventId, previous) > 0) {
      frame.edgeBirthEvent.set(edgeKey, eventId);
    }
    return;
  }
  if (op instanceof EdgeRemove) {
    await frame.session.removeEdges(new Set(op.observedDots));
    return;
  }
  if (op instanceof PropSet) {
    setProperty(frame.prop, encodePropKey(op.node, op.key), eventId, op.value);
    return;
  }
  if (op instanceof NodePropSet) {
    setProperty(frame.prop, encodePropKey(op.node, op.key), eventId, op.value);
    return;
  }
  if (op instanceof EdgePropSet) {
    setProperty(
      frame.prop,
      encodeEdgePropKey(op.from, op.to, op.label, op.key),
      eventId,
      op.value,
    );
    return;
  }
  if (op instanceof BlobValue) {
    return;
  }
  throw new PatchError(`Unsupported canonical op for session replay: ${op.type}`);
}

async function accumulateDiff(
  diff: PatchDiff,
  frame: ReducerSessionFrame,
  before: ReplayDiffSnapshot,
): Promise<void> {
  if (before.kind === "node-add") {
    if (!before.aliveBefore && await frame.session.nodeContains(before.target)) {
      diff.nodesAdded.push(before.target);
    }
    return;
  }
  if (before.kind === "node-remove") {
    if (before.aliveBefore && !(await frame.session.nodeContains(before.target))) {
      diff.nodesRemoved.push(before.target);
    }
    return;
  }
  if (before.kind === "edge-add") {
    if (!before.aliveBefore && await frame.session.edgeContains(before.target)) {
      diff.edgesAdded.push(before.edge);
    }
    return;
  }
  if (before.kind === "edge-remove") {
    if (before.aliveBefore && !(await frame.session.edgeContains(before.target))) {
      diff.edgesRemoved.push(before.edge);
    }
    return;
  }
  if (before.kind === "prop") {
    const nextValue = frame.prop.get(before.storageKey)?.value;
    if (nextValue !== before.prevValue) {
      diff.propsChanged.push({
        nodeId: before.nodeId,
        key: before.key,
        value: nextValue,
        prevValue: before.prevValue,
      });
    }
  }
}

function foldPatchIntoFrame(frame: ReducerSessionFrame, patch: PatchLike): void { // nosemgrep: ts-no-like-types -- 0025C
  const {context} = patch;
  const contextVV = context instanceof VersionVector
    ? context.clone()
    : VersionVector.from(context instanceof Map ? context : context ?? {});
  const merged = frame.observedFrontier.merge(contextVV);
  for (const [writerId, counter] of merged) {
    frame.observedFrontier.set(writerId, counter);
  }
  const current = frame.observedFrontier.get(patch.writer) ?? 0;
  if (patch.lamport > current) {
    frame.observedFrontier.set(patch.writer, patch.lamport);
  }
}

function propertySnapshot(
  prop: ReadonlyMap<string, LWWRegister<ReducerPropValue>>,
  nodeId: string,
  key: string,
  storageKey: string,
): ReplayDiffSnapshot {
  const reg = prop.get(storageKey);
  if (reg === undefined) {
    return {
      kind: "prop",
      nodeId,
      key,
      storageKey,
    };
  }
  return {
    kind: "prop",
    nodeId,
    key,
    storageKey,
    prevValue: reg.value,
  };
}

function setProperty(
  prop: Map<string, LWWRegister<ReducerPropValue>>,
  storageKey: string,
  eventId: EventId,
  value: ReducerPropInput,
): void {
  const current = prop.get(storageKey);
  const next = LWWRegister.max(current, LWWRegister.set(eventId, normalizePropValue(value)));
  if (next !== null) {
    prop.set(storageKey, next);
  }
}

function propertyOutcome(
  prop: ReadonlyMap<string, LWWRegister<ReducerPropValue>>,
  storageKey: string,
  eventId: EventId,
): OpOutcomeResult {
  const current = prop.get(storageKey);
  if (current === undefined) {
    return new OpApplied(storageKey);
  }
  const comparison = compareEventIds(eventId, current.eventId);
  if (comparison > 0) {
    return new OpApplied(storageKey);
  }
  if (comparison < 0) {
    return new OpSuperseded(storageKey, current.eventId);
  }
  return new OpRedundant(storageKey);
}

function mergePropMaps(
  left: ReadonlyMap<string, LWWRegister<ReducerPropValue>>,
  right: ReadonlyMap<string, LWWRegister<ReducerPropValue>>,
): Map<string, LWWRegister<ReducerPropValue>> {
  const merged = new Map(left);
  for (const [key, rightValue] of right) {
    const winner = LWWRegister.max(merged.get(key), rightValue);
    if (winner !== null) {
      merged.set(key, winner);
    }
  }
  return merged;
}

function mergeEdgeBirthEvents(
  left: ReadonlyMap<string, EventId>,
  right: ReadonlyMap<string, EventId>,
): Map<string, EventId> {
  const merged = new Map(left);
  for (const [key, rightValue] of right) {
    const current = merged.get(key);
    if (current === undefined || compareEventIds(rightValue, current) > 0) {
      merged.set(key, rightValue);
    }
  }
  return merged;
}

async function mergeLiveNodesInto(
  target: StateSession,
  source: StateSession,
): Promise<void> {
  for await (const nodeState of source.scanNodeElementStates()) {
    for (const encodedDot of nodeState.dots) {
      await target.addNode(nodeState.element, Dot.decode(encodedDot));
    }
    for (const encodedDot of nodeState.tombstonedDots) {
      await target.addNode(nodeState.element, Dot.decode(encodedDot));
    }
    if (nodeState.tombstonedDots.size > 0) {
      await target.removeNodes(nodeState.tombstonedDots);
    }
  }
}

async function mergeLiveEdgesInto(
  target: StateSession,
  source: StateSession,
): Promise<void> {
  for await (const edgeState of source.scanEdgeElementStates()) {
    for (const encodedDot of edgeState.dots) {
      await target.addEdge(edgeState.element, Dot.decode(encodedDot));
    }
    for (const encodedDot of edgeState.tombstonedDots) {
      await target.addEdge(edgeState.element, Dot.decode(encodedDot));
    }
    if (edgeState.tombstonedDots.size > 0) {
      await target.removeEdges(edgeState.tombstonedDots);
    }
  }
}

function hasEffectiveRemoval(
  currentDots: ReadonlySet<string>,
  observedDots: readonly string[],
): boolean {
  for (const dot of observedDots) {
    if (currentDots.has(dot)) {
      return true;
    }
  }
  return false;
}

function toReceiptOutcome(receiptName: string, outcome: OpOutcomeResult): OpOutcome {
  const entry: OpOutcome = {
    op: receiptName,
    target: outcome.target,
    result: outcome.result,
  };
  if (outcome instanceof OpSuperseded && outcome.reason.length > 0) {
    entry.reason = outcome.reason;
  }
  return entry;
}

function normalizePropValue(value: ReducerPropInput): ReducerPropValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizePropValue(entry));
  }
  if (value !== undefined && typeof value === "object") {
    const normalized: { [key: string]: ReducerPropValue } = {};
    for (const [key, entry] of Object.entries(value)) {
      normalized[key] = normalizePropValue(entry);
    }
    return normalized;
  }
  throw new PatchError("Reducer session prop value is not a valid PropValue");
}
