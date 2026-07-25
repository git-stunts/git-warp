import type PatchCollector from '../../capabilities/PatchCollector.ts';
import type { PatchWithSha } from '../../capabilities/PatchCollector.ts';
import { LWWRegister } from '../../crdt/LWW.ts';
import PatchError from '../../errors/PatchError.ts';
import type MaterializationCoordinate from '../../materialization/MaterializationCoordinate.ts';
import EdgeAdd from '../../types/ops/EdgeAdd.ts';
import EdgePropSet from '../../types/ops/EdgePropSet.ts';
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
  readonly registers: PropertyRegisters;
};

/**
 * Replays one live edge's birth and property registers at an exact
 * materialization coordinate.
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
  const op = normalizeRawOp(rawOp);
  if (op instanceof EdgeAdd && targetsEdge(op, edge)) {
    recordBirthEvent(replay, eventIdFor(entry, opIndex));
  } else if (op instanceof EdgePropSet && targetsEdge(op, edge)) {
    recordProperty(replay.registers, op, eventIdFor(entry, opIndex));
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

function recordBirthEvent(replay: TargetedEdgeReplay, eventId: EventId): void {
  if (
    replay.birthEvent === undefined
    || compareEventIds(eventId, replay.birthEvent) > 0
  ) {
    replay.birthEvent = eventId;
  }
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
  op: EdgeAdd | EdgePropSet,
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
    .filter(([, register]) => isVisibleAfterBirth(register, replay.birthEvent))
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([key, register]) => [key, register.value] as const);
  return Object.freeze(Object.fromEntries(entries));
}

function isVisibleAfterBirth(
  register: LWWRegister<PropValue>,
  birthEvent: EventId | undefined,
): boolean {
  return birthEvent === undefined
    || register.eventId === null
    || compareEventIds(register.eventId, birthEvent) >= 0;
}
