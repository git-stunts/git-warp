import { LWWRegister } from '../../crdt/LWW.ts';
import ConcurrentValue from '../../api/ConcurrentValue.ts';
import LifecyclePlurality, { type LifecycleElement } from '../../api/LifecyclePlurality.ts';
import type { PluralityCausality } from '../../api/PluralityCausality.ts';
import RegisterPlurality from '../../api/RegisterPlurality.ts';
import type { PropValue } from '../../types/PropValue.ts';
import { compareEventIds } from '../../utils/EventId.ts';
import { compareStrings } from '../../utils/StringComparison.ts';
import type ConeConcurrentSet from './ConeConcurrentSet.ts';
import type ConeConcurrentValue from './ConeConcurrentValue.ts';
import type ConeEdgeRecord from './ConeEdgeRecord.ts';
import type ConeLifecycleEvent from './ConeLifecycleEvent.ts';
import type ConeNodeRecord from './ConeNodeRecord.ts';
import { hydrateConeState } from './ConeStateHydration.ts';

/**
 * What a cone record's retained concurrency means to a Reading (#1039).
 *
 * A visible register reports plurality when writes it hides raced its LWW
 * winner: retained members other than the winner that the node's latest
 * clear has not made stale, plus any counted overflow. An element reports a
 * lifecycle plurality when its retained lifecycle effects hold both a remove
 * and an add or edit, which then raced each other.
 */
export default class ConePluralityReader {
  /** The plurality of the visible register `key` of a live node, or null. */
  static register(record: ConeNodeRecord, key: string): RegisterPlurality | null {
    const set = record.concurrency.register(key);
    const winner = racingWinner(record, set, key);
    const siblings = winner === null ? [] : visibleSiblings(record, set, winner.eventId);
    if (winner === null || siblings.length + set.overflow === 0) {
      return null;
    }
    return new RegisterPlurality({
      subject: record.nodeId,
      key,
      winner: new ConcurrentValue({ writer: winner.eventId.writerId, value: winner.value }),
      siblings: siblings.map((member) => new ConcurrentValue({ writer: member.event.writerId, value: member.value })),
      overflow: set.overflow,
      causality: causality(set),
    });
  }

  /** The delete-versus-edit plurality of a node, or null. */
  static node(record: ConeNodeRecord): LifecyclePlurality | null {
    return lifecycle({ kind: 'node', subject: record.nodeId }, record.concurrency.lifecycle);
  }

  /** The delete-versus-edit plurality of an edge, or null. */
  static edge(record: ConeEdgeRecord): LifecyclePlurality | null {
    return lifecycle({ kind: 'edge', from: record.from, to: record.to, label: record.label }, record.concurrency.lifecycle);
  }
}

/** The members other than the winner that the node's latest clear has not made stale. */
function visibleSiblings(
  record: ConeNodeRecord,
  set: ConeConcurrentSet<ConeConcurrentValue>,
  winner: LWWRegister<PropValue>['eventId'],
): ConeConcurrentValue[] {
  const state = hydrateConeState([record], []);
  return set.members.filter((member) => compareEventIds(member.event, winner) !== 0
    && !state.isStaleNodeRegister(record.nodeId, new LWWRegister<PropValue>(member.event, member.value)));
}

/** The visible register's LWW value when its set can hide anything (a second member or a counted eviction), else null. */
function racingWinner(record: ConeNodeRecord, set: ConeConcurrentSet<ConeConcurrentValue>, key: string): LWWRegister<PropValue> | null {
  const winner = record.props.get(key);
  const holdsRace = set.members.length > 1 || set.overflow > 0;
  return winner !== undefined && holdsRace && record.isAlive() ? winner : null;
}

function lifecycle(element: LifecycleElement, set: ConeConcurrentSet<ConeLifecycleEvent>): LifecyclePlurality | null {
  const removedBy = writersOf(set, 'remove');
  const editedBy = writersOf(set, 'edit');
  if (removedBy.length === 0 || editedBy.length === 0) {
    return null;
  }
  return new LifecyclePlurality({ element, removedBy, editedBy, overflow: set.overflow, causality: causality(set) });
}

function writersOf(set: ConeConcurrentSet<ConeLifecycleEvent>, role: ConeLifecycleEvent['role']): string[] {
  return [...new Set(set.members.filter((member) => member.role === role).map((member) => member.event.writerId))]
    .sort(compareStrings);
}

function causality<T extends ConeConcurrentValue | ConeLifecycleEvent>(set: ConeConcurrentSet<T>): PluralityCausality {
  return set.isUnderdetermined() ? 'underdetermined' : 'observed';
}
