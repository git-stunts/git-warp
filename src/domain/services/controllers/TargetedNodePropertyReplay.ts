import type PatchCollector from '../../capabilities/PatchCollector.ts';
import type { PatchWithSha } from '../../capabilities/PatchCollector.ts';
import { LWWRegister } from '../../crdt/LWW.ts';
import PatchError from '../../errors/PatchError.ts';
import type MaterializationCoordinate from '../../materialization/MaterializationCoordinate.ts';
import NodeAdd from '../../types/ops/NodeAdd.ts';
import NodePropSet from '../../types/ops/NodePropSet.ts';
import NodeRemove from '../../types/ops/NodeRemove.ts';
import {
  emptyNodeLifecycle,
  isStaleNodeRegisterIn,
  recordNodeAdd,
  recordNodeRemove,
  type NodeLifecycleEvents,
} from '../state/NodeLifecycle.ts';
import {
  copyPropValue,
  isPropValue,
  type PropValue,
} from '../../types/PropValue.ts';
import { EventId } from '../../utils/EventId.ts';
import { compareStrings } from '../../utils/StringComparison.ts';
import { normalizeRawOp } from '../OpNormalizer.ts';

type PropertyRegisters = Map<string, LWWRegister<PropValue>>;

type TargetedNodeReplay = NodeLifecycleEvents & {
  readonly registers: PropertyRegisters;
};

/**
 * Replays only one live node's property registers at an exact materialization
 * coordinate.
 *
 * This reducer never constructs WarpState, adjacency, receipts, diffs, or
 * provenance. Its own resident state is proportional to the requested node's
 * winning property bag plus its node lifecycle records, which hide registers
 * written before a remove that precedes the node's latest add.
 * PatchCollector may still buffer one writer chain while producing the
 * coordinate stream.
 */
export async function replayTargetedNodeProperties(options: {
  readonly coordinate: MaterializationCoordinate;
  readonly nodeId: string;
  readonly patches: PatchCollector;
}): Promise<Readonly<Record<string, PropValue>>> {
  const replay: TargetedNodeReplay = {
    registers: new Map(),
    ...emptyNodeLifecycle(),
  };
  const entries = options.patches.streamForFrontier(
    options.coordinate.frontier(),
    options.coordinate.ceiling,
  );
  for await (const entry of entries) {
    applyTargetedPatchEntry(replay, entry, options.nodeId);
  }
  return freezePropertyBag(replay, options.nodeId);
}

function applyTargetedPatchEntry(
  replay: TargetedNodeReplay,
  entry: PatchWithSha,
  nodeId: string,
): void {
  for (let opIndex = 0; opIndex < entry.patch.ops.length; opIndex += 1) {
    const rawOp = entry.patch.ops[opIndex];
    if (rawOp !== undefined) {
      applyTargetedOp(replay, normalizeRawOp(rawOp), {
        eventId: new EventId(entry.patch.lamport, entry.patch.writer, entry.sha, opIndex),
        nodeId,
      });
    }
  }
}

function applyTargetedOp(
  replay: TargetedNodeReplay,
  rawOp: ReturnType<typeof normalizeRawOp>,
  target: { readonly eventId: EventId; readonly nodeId: string },
): void {
  const op = targetedNodeOp(rawOp, target.nodeId);
  if (op instanceof NodeAdd) {
    recordNodeAdd(replay, op.node, target.eventId);
  } else if (op instanceof NodeRemove) {
    recordRemoval(replay, op, target.eventId);
  } else if (op instanceof NodePropSet) {
    replay.registers.set(
      op.key,
      LWWRegister.max(replay.registers.get(op.key), new LWWRegister(target.eventId, requirePropValue(op))),
    );
  }
}

/** Returns the op when it adds, removes or sets a property on the target node. */
function targetedNodeOp(
  op: ReturnType<typeof normalizeRawOp>,
  nodeId: string,
): NodeAdd | NodeRemove | NodePropSet | null {
  if (op instanceof NodeAdd || op instanceof NodeRemove || op instanceof NodePropSet) {
    return op.node === nodeId ? op : null;
  }
  return null;
}

/** A removal that observed no dots removed nothing and hides nothing. */
function recordRemoval(replay: TargetedNodeReplay, op: NodeRemove, eventId: EventId): void {
  if (op.observedDots.length > 0) {
    recordNodeRemove(replay, op.node, eventId);
  }
}

function requirePropValue(op: NodePropSet): PropValue {
  if (!isPropValue(op.value)) {
    throw new PatchError(
      'Targeted node-property replay encountered an invalid property value',
      { context: { nodeId: op.node, propertyKey: op.key } },
    );
  }
  return copyPropValue(op.value);
}

function freezePropertyBag(
  replay: TargetedNodeReplay,
  nodeId: string,
): Readonly<Record<string, PropValue>> {
  const entries = [...replay.registers.entries()]
    .filter(([, register]) => !isStaleNodeRegisterIn(replay, nodeId, register.eventId))
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([key, register]) => [key, register.value] as const);
  return Object.freeze(Object.fromEntries(entries));
}
