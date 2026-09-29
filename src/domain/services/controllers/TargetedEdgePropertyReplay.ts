import type PatchCollector from '../../capabilities/PatchCollector.ts';
import type { PatchWithSha } from '../../capabilities/PatchCollector.ts';
import { LWWRegister } from '../../crdt/LWW.ts';
import PatchError from '../../errors/PatchError.ts';
import type MaterializationCoordinate from '../../materialization/MaterializationCoordinate.ts';
import EdgeAdd from '../../types/ops/EdgeAdd.ts';
import EdgePropSet from '../../types/ops/EdgePropSet.ts';
import EdgeRemove from '../../types/ops/EdgeRemove.ts';
import { predatesLifecycle } from '../state/ElementLifecycle.ts';
import {
  copyPropValue,
  isPropValue,
  type PropValue,
} from '../../types/PropValue.ts';
import {
  compareEventIds,
  EventId,
} from '../../utils/EventId.ts';
import { compareStrings } from '../../utils/StringComparison.ts';
import { normalizeRawOp } from '../OpNormalizer.ts';
import type { MaterializationEdgeTarget } from '../../../ports/MaterializationReadPort.ts';

type PropertyRegisters = Map<string, LWWRegister<PropValue>>;

type TargetedEdgeReplay = {
  birthEvent: EventId | undefined;
  removeEvent: EventId | undefined;
  readonly registers: PropertyRegisters;
};

/**
 * Replays one live edge's birth, latest removal and property registers at an
 * exact materialization coordinate.
 *
 * The retained roots prove edge and endpoint liveness before this reducer
 * runs. Its own resident state is proportional to one edge's property bag.
 * PatchCollector may still buffer one writer chain while producing the stream.
 */
export async function replayTargetedEdgeProperties(options: {
  readonly coordinate: MaterializationCoordinate;
  readonly edge: MaterializationEdgeTarget;
  readonly patches: PatchCollector;
}): Promise<Readonly<Record<string, PropValue>>> {
  const replay: TargetedEdgeReplay = {
    birthEvent: undefined,
    removeEvent: undefined,
    registers: new Map(),
  };
  const entries = options.patches.streamForFrontier(
    options.coordinate.frontier(),
    options.coordinate.ceiling,
  );
  for await (const entry of entries) {
    applyTargetedPatchEntry(replay, entry, options.edge);
  }
  return freezeVisiblePropertyBag(replay);
}

function applyTargetedPatchEntry(
  replay: TargetedEdgeReplay,
  entry: PatchWithSha,
  edge: MaterializationEdgeTarget,
): void {
  for (let opIndex = 0; opIndex < entry.patch.ops.length; opIndex += 1) {
    const rawOp = entry.patch.ops[opIndex];
    if (rawOp !== undefined) {
      applyTargetedRawOp({
        edge,
        entry,
        opIndex,
        rawOp,
        replay,
      });
    }
  }
}

function applyTargetedRawOp(options: {
  readonly edge: MaterializationEdgeTarget;
  readonly entry: PatchWithSha;
  readonly opIndex: number;
  readonly rawOp: PatchWithSha['patch']['ops'][number];
  readonly replay: TargetedEdgeReplay;
}): void {
  const { edge, entry, opIndex, rawOp, replay } = options;
  const op = targetedEdgeOp(normalizeRawOp(rawOp), edge);
  if (op instanceof EdgeAdd) {
    replay.birthEvent = laterEvent(replay.birthEvent, eventIdFor(entry, opIndex));
  } else if (op instanceof EdgeRemove) {
    recordRemoval(replay, op, eventIdFor(entry, opIndex));
  } else if (op instanceof EdgePropSet) {
    recordProperty(replay.registers, op, eventIdFor(entry, opIndex));
  }
}

/** Returns the op when it adds, removes or sets a property on the target edge. */
function targetedEdgeOp(
  op: ReturnType<typeof normalizeRawOp>,
  edge: MaterializationEdgeTarget,
): EdgeAdd | EdgeRemove | EdgePropSet | null {
  if (op instanceof EdgeAdd || op instanceof EdgeRemove || op instanceof EdgePropSet) {
    return targetsEdge(op, edge) ? op : null;
  }
  return null;
}

/** A removal that observed no dots removed nothing and hides nothing. */
function recordRemoval(replay: TargetedEdgeReplay, op: EdgeRemove, eventId: EventId): void {
  if (op.observedDots.length > 0) {
    replay.removeEvent = laterEvent(replay.removeEvent, eventId);
  }
}

function eventIdFor(entry: PatchWithSha, opIndex: number): EventId {
  return new EventId(
    entry.patch.lamport,
    entry.patch.writer,
    entry.sha,
    opIndex,
  );
}

function laterEvent(current: EventId | undefined, eventId: EventId): EventId {
  if (current === undefined || compareEventIds(eventId, current) > 0) {
    return eventId;
  }
  return current;
}

function recordProperty(
  registers: PropertyRegisters,
  op: EdgePropSet,
  eventId: EventId,
): void {
  registers.set(
    op.key,
    LWWRegister.max(
      registers.get(op.key),
      new LWWRegister(eventId, requirePropValue(op)),
    ),
  );
}

function targetsEdge(
  op: EdgeAdd | EdgeRemove | EdgePropSet,
  edge: MaterializationEdgeTarget,
): boolean {
  return op.from === edge.from
    && op.to === edge.to
    && op.label === edge.label;
}

function requirePropValue(op: EdgePropSet): PropValue {
  if (!isPropValue(op.value)) {
    throw new PatchError(
      'Targeted edge-property replay encountered an invalid property value',
      {
        context: {
          from: op.from,
          to: op.to,
          label: op.label,
          propertyKey: op.key,
        },
      },
    );
  }
  return copyPropValue(op.value);
}

function freezeVisiblePropertyBag(
  replay: TargetedEdgeReplay,
): Readonly<Record<string, PropValue>> {
  const entries = [...replay.registers.entries()]
    .filter(([, register]) => !predatesLifecycle(register.eventId, replay.birthEvent, replay.removeEvent))
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([key, register]) => [key, register.value] as const);
  return Object.freeze(Object.fromEntries(entries));
}
