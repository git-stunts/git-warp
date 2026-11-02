import type PatchEntry from '../../artifacts/PatchEntry.ts';
import { compareEventIds } from '../../utils/EventId.ts';
import ConeConcurrency from './ConeConcurrency.ts';
import ConeConcurrencyFold from './ConeConcurrencyFold.ts';
import ConeConcurrentSet, { CONE_CONCURRENT_SET_CAP, type ConeConcurrentMember } from './ConeConcurrentSet.ts';
import ConeConcurrentValue from './ConeConcurrentValue.ts';
import type ConeEdgeRecord from './ConeEdgeRecord.ts';
import type { ConeEvictedMember } from './ConeEvictedMember.ts';
import ConeEvictedValue from './ConeEvictedValue.ts';
import type ConeFoldSession from './ConeFoldSession.ts';
import ConeLifecycleEvent from './ConeLifecycleEvent.ts';
import type ConeNodeRecord from './ConeNodeRecord.ts';
import ConeRecoveryObstruction from './ConeRecoveryObstruction.ts';

type Candidate = ConeConcurrentMember | ConeEvictedMember;
type Owner = ConeNodeRecord | ConeEdgeRecord;

/** Restores the newest maximal events before any prepared record is staged. */
export default class ConeConcurrencyRecovery {
  static async of(record: Owner, session: ConeFoldSession): Promise<ConeConcurrency | ConeRecoveryObstruction> {
    const registers = new Map<string, ConeConcurrentSet<ConeConcurrentValue>>();
    for (const [key, set] of record.concurrency.registers) {
      const recovered = await recoverRegister(set, { record, key, session });
      if (recovered instanceof ConeRecoveryObstruction) {
        return recovered;
      }
      registers.set(key, recovered);
    }
    return new ConeConcurrency({ registers, lifecycle: recoverLifecycle(record.concurrency.lifecycle) });
  }
}

async function recoverRegister(
  set: ConeConcurrentSet<ConeConcurrentValue>,
  context: { readonly record: Owner; readonly key: string; readonly session: ConeFoldSession },
): Promise<ConeConcurrentSet<ConeConcurrentValue> | ConeRecoveryObstruction> {
  if (set.overflow === 0) {
    return set;
  }
  const candidates = ranked(set);
  const members: ConeConcurrentValue[] = [];
  for (const candidate of candidates.slice(0, CONE_CONCURRENT_SET_CAP)) {
    const member = candidate instanceof ConeConcurrentValue ? candidate : await recoverValue(candidate, context);
    if (member instanceof ConeRecoveryObstruction) {
      return member;
    }
    members.push(member);
  }
  return new ConeConcurrentSet({ members, observed: set.observed, evicted: overflow(candidates) });
}

async function recoverValue(
  evidence: ConeEvictedMember,
  { record, key, session }: { readonly record: Owner; readonly key: string; readonly session: ConeFoldSession },
): Promise<ConeConcurrentValue | ConeRecoveryObstruction> {
  const entry = await session.patchAt(evidence.event);
  if (entry instanceof ConeRecoveryObstruction) {
    return entry;
  }
  if (!matchesEvent(entry, evidence)) {
    return new ConeRecoveryObstruction(evidence.event, 'inconsistent');
  }
  const value = ConeConcurrencyFold.of(entry, new Map()).value(record, key);
  if (value === null || compareEventIds(value.event, evidence.event) !== 0) {
    return new ConeRecoveryObstruction(evidence.event, 'inconsistent');
  }
  // Recovery preserves the original causal qualification, including implicit strand evidence.
  return new ConeConcurrentValue({ event: evidence.event, causal: evidence.causal, value: value.value });
}

function matchesEvent(entry: PatchEntry, evidence: ConeEvictedMember): boolean {
  return entry.sha === evidence.event.patchSha && entry.patch.writer === evidence.event.writerId
    && entry.patch.lamport === evidence.event.lamport;
}

function recoverLifecycle(set: ConeConcurrentSet<ConeLifecycleEvent>): ConeConcurrentSet<ConeLifecycleEvent> {
  if (set.overflow === 0) {
    return set;
  }
  // ConeConcurrency admits only lifecycle events here; their complete roles need no payload I/O.
  const candidates = ranked(set).filter((member): member is ConeLifecycleEvent => member instanceof ConeLifecycleEvent);
  return new ConeConcurrentSet({ members: candidates.slice(0, CONE_CONCURRENT_SET_CAP), observed: set.observed, evicted: overflow(candidates) });
}

function ranked<T extends ConeConcurrentMember>(set: ConeConcurrentSet<T>): Candidate[] {
  return [...set.members, ...set.evicted.values()].sort((left, right) => compareEventIds(right.event, left.event));
}

function overflow(candidates: readonly Candidate[]): ReadonlyMap<string, ConeEvictedMember> {
  return new Map(candidates.slice(CONE_CONCURRENT_SET_CAP).map((member) => [member.event.writerId,
    member instanceof ConeConcurrentValue ? new ConeEvictedValue(member) : member]));
}
