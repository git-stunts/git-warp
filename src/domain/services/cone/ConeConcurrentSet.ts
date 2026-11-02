import ConeRecordError from '../../errors/ConeRecordError.ts';
import { propValuesEqual } from '../../types/PropValue.ts';
import { compareEventIds } from '../../utils/EventId.ts';
import ConeConcurrentValue from './ConeConcurrentValue.ts';
import ConeLifecycleEvent from './ConeLifecycleEvent.ts';
import type ConeObservation from './ConeObservation.ts';
import { requireCount, requireIdentity } from './ConeRecordValidation.ts';

/** Retained concurrent members one set keeps with their values; more are evicted and only counted. */
export const CONE_CONCURRENT_SET_CAP = 16;

/** A member of a concurrent set: a register write or a lifecycle effect. */
export type ConeConcurrentMember = ConeConcurrentValue | ConeLifecycleEvent;

type SetFields<T extends ConeConcurrentMember> = {
  readonly members: readonly T[];
  readonly observed: ReadonlyMap<string, number>;
  readonly evicted: ReadonlyMap<string, number>;
};

/**
 * The events of one register or one element lifecycle that no other event of
 * it observed: its maximal antichain under happens-before (#1039).
 *
 * Folding an event drops every member it observed and keeps it unless an
 * earlier-folded event observed it, which `observed` (per chain, the highest
 * clock any folded event observed) answers without keeping those events.
 * Every member is maximal whatever order events fold in, so two clones with
 * the same patches hold the same members. A chain's events are ordered, so
 * at most one member comes from each writer chain. Past
 * {@link CONE_CONCURRENT_SET_CAP} members the oldest are evicted: `evicted`
 * keeps each such chain's clock, so an event that later observes them still
 * retires them, and readers report how many concurrent values were not kept.
 */
export default class ConeConcurrentSet<T extends ConeConcurrentMember> {
  /** Maximal events, newest first. */
  readonly members: readonly T[];
  readonly observed: ReadonlyMap<string, number>;
  readonly evicted: ReadonlyMap<string, number>;

  constructor(fields: SetFields<T>) {
    this.members = requireMembers(fields.members);
    this.observed = requireClocks(fields.observed, 'observed');
    this.evicted = requireClocks(fields.evicted, 'evicted');
    Object.freeze(this);
  }

  static empty<T extends ConeConcurrentMember>(): ConeConcurrentSet<T> {
    return new ConeConcurrentSet<T>({ members: [], observed: new Map(), evicted: new Map() });
  }

  /** How many maximal events were evicted past the cap and are only counted. */
  get overflow(): number {
    return this.evicted.size;
  }

  /** This set after folding `member`, whose patch observed `observation`. */
  with(member: T, observation: ConeObservation): ConeConcurrentSet<T> {
    const kept = this.members.filter((existing) => !observation.observes(existing.event));
    const evicted = new Map([...this.evicted].filter(([writerId, lamport]) => !observation.observesClock(writerId, lamport)));
    const known = (this.observed.get(member.event.writerId) ?? -1) >= member.event.lamport;
    const members = (known ? kept : [...kept, member]).sort((left, right) => compareEventIds(right.event, left.event));
    for (const spilled of members.splice(CONE_CONCURRENT_SET_CAP)) {
      evicted.set(spilled.event.writerId, Math.max(evicted.get(spilled.event.writerId) ?? 0, spilled.event.lamport));
    }
    return new ConeConcurrentSet<T>({ members, observed: observation.joined(this.observed), evicted });
  }

  /** The members `observation` did not observe: the events a write recording it would race. */
  unobservedBy(observation: ConeObservation): readonly T[] {
    return this.members.filter((member) => !observation.observes(member.event));
  }

  /** The evicted events `observation` did not observe, as chain and clock: races a write recording it has, uncounted by value. */
  unobservedEvictions(observation: ConeObservation): ReadonlyArray<readonly [string, number]> {
    return [...this.evicted].filter(([writerId, lamport]) => !observation.observesClock(writerId, lamport));
  }

  /** Whether some member or evicted event came from a patch without causal evidence. */
  isUnderdetermined(): boolean {
    return this.members.some((member) => !member.causal);
  }

  isEmpty(): boolean {
    return this.members.length === 0 && this.observed.size === 0 && this.evicted.size === 0;
  }

  equals(other: ConeConcurrentSet<T>): boolean {
    return sameClocks(other.observed, this.observed) && sameClocks(other.evicted, this.evicted)
      && other.members.length === this.members.length
      && other.members.every((member, index) => sameMember(member, this.members[index]));
  }
}

function sameMember(left: ConeConcurrentMember, right: ConeConcurrentMember | undefined): boolean {
  return right !== undefined && compareEventIds(left.event, right.event) === 0 && left.causal === right.causal
    && samePayload(left, right);
}

function samePayload(left: ConeConcurrentMember, right: ConeConcurrentMember): boolean {
  if (left instanceof ConeConcurrentValue) {
    return right instanceof ConeConcurrentValue && propValuesEqual(left.value, right.value);
  }
  return right instanceof ConeLifecycleEvent && right.role === left.role;
}

function sameClocks(left: ReadonlyMap<string, number>, right: ReadonlyMap<string, number>): boolean {
  return left.size === right.size && [...left].every(([writerId, lamport]) => right.get(writerId) === lamport);
}

function requireMembers<T extends ConeConcurrentMember>(members: readonly T[]): readonly T[] {
  const copied: T[] = Array.from(members);
  if (copied.length > CONE_CONCURRENT_SET_CAP) {
    throw new ConeRecordError(`Cone concurrent set holds at most ${CONE_CONCURRENT_SET_CAP} members`);
  }
  if (!copied.every(isMember)) {
    throw new ConeRecordError('Cone concurrent set members must be concurrent values or lifecycle events');
  }
  return Object.freeze(copied);
}

function isMember(member: ConeConcurrentMember): boolean {
  return member instanceof ConeConcurrentValue || member instanceof ConeLifecycleEvent;
}

function requireClocks(clocks: ReadonlyMap<string, number>, field: string): ReadonlyMap<string, number> {
  if (!(clocks instanceof Map)) {
    throw new ConeRecordError(`Cone concurrent set ${field} must be a Map`);
  }
  for (const [writerId, lamport] of clocks) {
    requireIdentity(writerId, field);
    requireCount(lamport, field);
  }
  return Object.freeze(new Map(clocks));
}
