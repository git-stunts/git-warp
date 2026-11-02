import ConeRecordError from '../../errors/ConeRecordError.ts';
import { propValuesEqual } from '../../types/PropValue.ts';
import { compareEventIds } from '../../utils/EventId.ts';
import ConeConcurrentValue from './ConeConcurrentValue.ts';
import type { ConeEvictedMember } from './ConeEvictedMember.ts';
import ConeEvictedValue from './ConeEvictedValue.ts';
import ConeLifecycleEvent from './ConeLifecycleEvent.ts';
import type ConeObservation from './ConeObservation.ts';
import { requireCount, requireIdentity } from './ConeRecordValidation.ts';

/** Retained concurrent members one set keeps with their values; overflow keeps event evidence. */
export const CONE_CONCURRENT_SET_CAP = 16;

/** A member of a concurrent set: a register write or a lifecycle effect. */
export type ConeConcurrentMember = ConeConcurrentValue | ConeLifecycleEvent;

type SetFields<T extends ConeConcurrentMember> = {
  readonly members: readonly T[];
  readonly observed: ReadonlyMap<string, number>;
  readonly evicted: ReadonlyMap<string, ConeEvictedMember>;
};

/**
 * The events of one register or one element lifecycle that no other event of
 * it observed: its maximal antichain under happens-before (#1039).
 *
 * Folding an event drops every member it observed and keeps it unless an
 * earlier-folded event observed it, which `observed` (per chain, the highest
 * clock any folded event observed) answers without keeping those events.
 * Every retained member is maximal. A chain's events are ordered, so at most
 * one member comes from each writer chain. Past
 * {@link CONE_CONCURRENT_SET_CAP} members the oldest are evicted: `evicted`
 * keeps each event's identity and causal evidence, and its lifecycle role
 * when applicable. Observing an evicted event retires it; readers can report
 * conflict evidence without retaining discarded property payloads.
 * Partial retirement can leave the member cache underfilled. Before staging,
 * ConeConcurrencyRecovery restores the newest maximal members from this
 * evidence and directly addressed source patches, or returns an obstruction.
 */
export default class ConeConcurrentSet<T extends ConeConcurrentMember> {
  /** Maximal events, newest first. */
  readonly members: readonly T[];
  readonly #observed: ReadonlyMap<string, number>;
  readonly #evicted: ReadonlyMap<string, ConeEvictedMember>;

  /** A detached snapshot of the clocks observed by folded events. */
  get observed(): ReadonlyMap<string, number> {
    return new Map(this.#observed);
  }

  /** A detached snapshot of evicted event evidence. */
  get evicted(): ReadonlyMap<string, ConeEvictedMember> {
    return new Map(this.#evicted);
  }

  constructor(fields: SetFields<T>) {
    this.members = requireMembers(fields.members);
    this.#observed = requireClocks(fields.observed, 'observed');
    this.#evicted = requireEvictions(fields.evicted);
    Object.freeze(this);
  }

  static empty<T extends ConeConcurrentMember>(): ConeConcurrentSet<T> {
    return new ConeConcurrentSet<T>({ members: [], observed: new Map(), evicted: new Map() });
  }

  /** How many maximal events were evicted past the member cap. */
  get overflow(): number {
    return this.#evicted.size;
  }

  /** This set after folding `member`, whose patch observed `observation`. */
  with(member: T, observation: ConeObservation): ConeConcurrentSet<T> {
    const kept = this.members.filter((existing) => !observation.observes(existing.event));
    const evicted = new Map([...this.#evicted].filter(([, evidence]) => !observation.observes(evidence.event)));
    const known = (this.#observed.get(member.event.writerId) ?? -1) >= member.event.lamport;
    const members = (known ? kept : [...kept, member]).sort((left, right) => compareEventIds(right.event, left.event));
    for (const spilled of members.splice(CONE_CONCURRENT_SET_CAP)) {
      evicted.set(spilled.event.writerId, spilled instanceof ConeConcurrentValue ? new ConeEvictedValue(spilled) : spilled);
    }
    return new ConeConcurrentSet<T>({ members, observed: observation.joined(this.#observed), evicted });
  }

  /** The members `observation` did not observe: the events a write recording it would race. */
  unobservedBy(observation: ConeObservation): readonly T[] {
    return this.members.filter((member) => !observation.observes(member.event));
  }

  /** Evicted events a write recording `observation` would race, without their property payloads. */
  unobservedEvictions(observation: ConeObservation): readonly ConeEvictedMember[] {
    return [...this.#evicted.values()].filter((evidence) => !observation.observes(evidence.event));
  }

  /** Whether some member or evicted event came from a patch without causal evidence. */
  isUnderdetermined(): boolean {
    return this.members.some((member) => !member.causal) || [...this.#evicted.values()].some((evidence) => !evidence.causal);
  }

  isEmpty(): boolean {
    return this.members.length === 0 && this.#observed.size === 0 && this.#evicted.size === 0;
  }

  equals(other: ConeConcurrentSet<T>): boolean {
    return sameClocks(other.#observed, this.#observed) && sameEvictions(other.#evicted, this.#evicted)
      && other.members.length === this.members.length
      && other.members.every((member, index) => sameMember(member, this.members[index]));
  }
}

function sameMember(left: ConeConcurrentMember | ConeEvictedMember, right: ConeConcurrentMember | ConeEvictedMember | undefined): boolean {
  return right !== undefined && compareEventIds(left.event, right.event) === 0 && left.causal === right.causal
    && samePayload(left, right);
}

function samePayload(left: ConeConcurrentMember | ConeEvictedMember, right: ConeConcurrentMember | ConeEvictedMember): boolean {
  if (left instanceof ConeEvictedValue) {
    return right instanceof ConeEvictedValue;
  }
  if (left instanceof ConeConcurrentValue) {
    return right instanceof ConeConcurrentValue && propValuesEqual(left.value, right.value);
  }
  return right instanceof ConeLifecycleEvent && right.role === left.role;
}

function sameClocks(left: ReadonlyMap<string, number>, right: ReadonlyMap<string, number>): boolean {
  return left.size === right.size && [...left].every(([writerId, lamport]) => right.get(writerId) === lamport);
}

function sameEvictions(left: ReadonlyMap<string, ConeEvictedMember>, right: ReadonlyMap<string, ConeEvictedMember>): boolean {
  return left.size === right.size && [...left].every(([writer, evidence]) => sameMember(evidence, right.get(writer)));
}

function requireEvictions(evicted: ReadonlyMap<string, ConeEvictedMember>): ReadonlyMap<string, ConeEvictedMember> {
  requireEvictionMap(evicted);
  for (const [writer, evidence] of evicted) {
    if (!(evidence instanceof ConeEvictedValue || evidence instanceof ConeLifecycleEvent) || writer !== evidence.event.writerId) {
      throw new ConeRecordError('Cone evictions must hold event evidence keyed by its writer');
    }
  }
  return new Map(evicted);
}

function requireEvictionMap(evicted: ReadonlyMap<string, ConeEvictedMember>): void {
  if (!(evicted instanceof Map)) {
    throw new ConeRecordError('Cone concurrent set evicted must be a Map');
  }
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
  return new Map(clocks);
}
