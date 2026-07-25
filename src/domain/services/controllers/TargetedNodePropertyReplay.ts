import type PatchCollector from '../../capabilities/PatchCollector.ts';
import type { PatchWithSha } from '../../capabilities/PatchCollector.ts';
import { LWWRegister } from '../../crdt/LWW.ts';
import PatchError from '../../errors/PatchError.ts';
import type MaterializationCoordinate from '../../materialization/MaterializationCoordinate.ts';
import NodePropSet from '../../types/ops/NodePropSet.ts';
import {
  copyPropValue,
  isPropValue,
  type PropValue,
} from '../../types/PropValue.ts';
import { EventId } from '../../utils/EventId.ts';
import { compareStrings } from '../../utils/StringComparison.ts';
import { normalizeRawOp } from '../OpNormalizer.ts';

type PropertyRegisters = Map<string, LWWRegister<PropValue>>;

/**
 * Replays only one live node's property registers at an exact materialization
 * coordinate.
 *
 * This reducer never constructs WarpState, adjacency, receipts, diffs, or
 * provenance. Its own resident state is proportional to the requested node's
 * winning property bag. PatchCollector may still buffer one writer chain while
 * producing the coordinate stream.
 */
export async function replayTargetedNodeProperties(options: {
  readonly coordinate: MaterializationCoordinate;
  readonly nodeId: string;
  readonly patches: PatchCollector;
}): Promise<Readonly<Record<string, PropValue>>> {
  const registers: PropertyRegisters = new Map();
  const entries = options.patches.streamForFrontier(
    options.coordinate.frontier(),
    options.coordinate.ceiling,
  );
  for await (const entry of entries) {
    applyTargetedPatchEntry(registers, entry, options.nodeId);
  }
  return freezePropertyBag(registers);
}

function applyTargetedPatchEntry(
  registers: PropertyRegisters,
  entry: PatchWithSha,
  nodeId: string,
): void {
  for (let opIndex = 0; opIndex < entry.patch.ops.length; opIndex += 1) {
    const rawOp = entry.patch.ops[opIndex];
    if (rawOp === undefined) {
      continue;
    }
    const op = normalizeRawOp(rawOp);
    if (!(op instanceof NodePropSet) || op.node !== nodeId) {
      continue;
    }
    registers.set(
      op.key,
      LWWRegister.max(
        registers.get(op.key),
        new LWWRegister(
          new EventId(entry.patch.lamport, entry.patch.writer, entry.sha, opIndex),
          requirePropValue(op),
        ),
      ),
    );
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
  registers: ReadonlyMap<string, LWWRegister<PropValue>>,
): Readonly<Record<string, PropValue>> {
  const entries = [...registers.entries()]
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([key, register]) => [key, register.value] as const);
  return Object.freeze(Object.fromEntries(entries));
}
