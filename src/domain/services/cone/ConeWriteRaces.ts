import ConcurrentValue from '../../api/ConcurrentValue.ts';
import LifecyclePlurality from '../../api/LifecyclePlurality.ts';
import type { Plurality } from '../../api/Plurality.ts';
import RegisterPlurality from '../../api/RegisterPlurality.ts';
import type ObservedWriteFrontier from '../../types/ObservedWriteFrontier.ts';
import NodePropSet from '../../types/ops/NodePropSet.ts';
import type { PatchOp } from '../../types/ops/unions.ts';
import { isPropValue, type PropValue } from '../../types/PropValue.ts';
import { compareStrings } from '../../utils/StringComparison.ts';
import type ConeConcurrentSet from './ConeConcurrentSet.ts';
import type ConeConcurrentValue from './ConeConcurrentValue.ts';
import type { ConeEvictedMember } from './ConeEvictedMember.ts';
import ConeLifecycleEvent from './ConeLifecycleEvent.ts';
import type ConeNodeRecord from './ConeNodeRecord.ts';
import ConeObservation from './ConeObservation.ts';

/**
 * A patch the write races: a retained or evicted event it did not observe,
 * named by its actual patch identity.
 */
export type ConeRacedPatch = Readonly<{ writer: string; coordinate: string }>;

/** What a lowered write is checked against: its register owners' records and its recorded observation. */
export type ConeWriteRaceInput = Readonly<{
  owners: ReadonlyMap<string, ConeNodeRecord>;
  observation: ObservedWriteFrontier;
  writer: string;
  lamport: number;
  ops: readonly PatchOp[];
}>;

/**
 * The concurrent values a write leaves standing beside its own (#1039).
 *
 * A write records the basis it observed; any retained write to a register it
 * sets, or retained remove of a node it edits, outside that basis raced it.
 * Folding the write keeps those events as siblings instead of hiding them,
 * so the write is admitted as plural and its receipt names them.
 */
export default class ConeWriteRaces {
  readonly plurality: readonly Plurality[];
  readonly patches: readonly ConeRacedPatch[];

  private constructor(plurality: readonly Plurality[], patches: readonly ConeRacedPatch[]) {
    this.plurality = Object.freeze([...plurality]);
    this.patches = Object.freeze([...patches]);
    Object.freeze(this);
  }

  static none(): ConeWriteRaces {
    return new ConeWriteRaces([], []);
  }

  /** The races of a lowered write's node property sets on its register owners. */
  static of(input: ConeWriteRaceInput): ConeWriteRaces {
    const observation = ConeObservation.ofWrite(input.observation, input.writer, input.lamport);
    const plurality: Plurality[] = [];
    const raced = new Map<string, ConeRacedPatch>();
    for (const [nodeId, writes] of propertyWrites(input)) {
      const owner = input.owners.get(nodeId);
      if (owner !== undefined) {
        const found = ownerRaces({ owner, writes, writer: input.writer, observation });
        plurality.push(...found.plurality);
        for (const patch of found.patches) {
          raced.set(`${patch.writer}|${patch.coordinate}`, patch);
        }
      }
    }
    return new ConeWriteRaces(plurality, [...raced.values()].sort((left, right) => compareStrings(left.coordinate, right.coordinate)));
  }

  isEmpty(): boolean {
    return this.plurality.length === 0;
  }
}

type OwnerRaces = { readonly plurality: Plurality[]; readonly patches: ConeRacedPatch[] };

function ownerRaces(fields: {
  readonly owner: ConeNodeRecord;
  readonly writes: ReadonlyMap<string, PropValue>;
  readonly writer: string;
  readonly observation: ConeObservation;
}): OwnerRaces {
  const { owner, writer, observation } = fields;
  const races: OwnerRaces = { plurality: [], patches: [] };
  for (const [key, value] of fields.writes) {
    const set = owner.concurrency.register(key);
    const unseen = set.unobservedBy(observation);
    const evicted = set.unobservedEvictions(observation);
    if (unseen.length + evicted.length > 0) {
      races.plurality.push(registerRace({ owner, key, winner: new ConcurrentValue({ writer, value }), unseen, evicted }));
      races.patches.push(...unseen.map(racedPatch), ...evicted.map(racedPatch));
    }
  }
  const lifecycle = lifecycleRaces(owner, writer, observation);
  races.plurality.push(...lifecycle.plurality);
  races.patches.push(...lifecycle.patches);
  return races;
}

function lifecycleRaces(owner: ConeNodeRecord, writer: string, observation: ConeObservation): OwnerRaces {
  const { lifecycle } = owner.concurrency;
  const evictedRemoves = lifecycle.unobservedEvictions(observation).filter(isRemove);
  const removes = [...unobservedRemoves(lifecycle, observation), ...evictedRemoves];
  if (removes.length === 0) {
    return { plurality: [], patches: [] };
  }
  return {
    plurality: [new LifecyclePlurality({
      element: { kind: 'node', subject: owner.nodeId },
      removedBy: [...new Set(removes.map((remove) => remove.event.writerId))].sort(compareStrings),
      editedBy: [writer],
      overflow: evictedRemoves.length,
      causality: removes.every((remove) => remove.causal) ? 'observed' : 'underdetermined',
    })],
    patches: removes.map(racedPatch),
  };
}

function registerRace(fields: {
  readonly owner: ConeNodeRecord;
  readonly key: string;
  readonly winner: ConcurrentValue;
  readonly unseen: readonly ConeConcurrentValue[];
  readonly evicted: readonly ConeEvictedMember[];
}): RegisterPlurality {
  return new RegisterPlurality({
    subject: fields.owner.nodeId,
    key: fields.key,
    winner: fields.winner,
    siblings: fields.unseen.map((member) => new ConcurrentValue({ writer: member.event.writerId, value: member.value })),
    overflow: fields.evicted.length,
    causality: [...fields.unseen, ...fields.evicted].every((member) => member.causal) ? 'observed' : 'underdetermined',
  });
}

function unobservedRemoves(set: ConeConcurrentSet<ConeLifecycleEvent>, observation: ConeObservation): ConeLifecycleEvent[] {
  return set.unobservedBy(observation).filter(isRemove);
}

function isRemove(member: ConeEvictedMember): member is ConeLifecycleEvent {
  return member instanceof ConeLifecycleEvent && member.role === 'remove';
}

function racedPatch(member: ConeConcurrentValue | ConeEvictedMember): ConeRacedPatch {
  return Object.freeze({ writer: member.event.writerId, coordinate: member.event.patchSha });
}

/** Per node, the last value each lowered node property set writes. */
function propertyWrites(input: ConeWriteRaceInput): Map<string, Map<string, PropValue>> {
  const writes = new Map<string, Map<string, PropValue>>();
  for (const op of input.ops) {
    if (op instanceof NodePropSet && isPropValue(op.value)) {
      const node = writes.get(op.node) ?? new Map<string, PropValue>();
      node.set(op.key, op.value);
      writes.set(op.node, node);
    }
  }
  return writes;
}
