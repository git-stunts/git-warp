import { describe, expect, it, vi } from 'vitest';
import IndeterminateWriteReceipt from '../../../../../src/domain/api/IndeterminateWriteReceipt.ts';
import UnpublishedWriteReceipt from '../../../../../src/domain/api/UnpublishedWriteReceipt.ts';
import MessageCodecError from '../../../../../src/domain/errors/MessageCodecError.ts';
import type ObservationAttempt from '../../../../../src/domain/services/custody/ObservationAttempt.ts';
import ObservationAdmitted from '../../../../../src/domain/services/custody/ObservationAdmitted.ts';
import ObservationAttemptId from '../../../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationBindings from '../../../../../src/domain/services/custody/ObservationBindings.ts';
import ObservationBudget from '../../../../../src/domain/services/custody/ObservationBudget.ts';
import type ObservationCustodyService from '../../../../../src/domain/services/custody/ObservationCustodyService.ts';
import ObservationDependencyClaim from '../../../../../src/domain/services/custody/ObservationDependencyClaim.ts';
import ObservationDigest from '../../../../../src/domain/services/custody/ObservationDigest.ts';
import ObservationPreparation from '../../../../../src/domain/services/custody/ObservationPreparation.ts';
import ObservationQuestion from '../../../../../src/domain/services/custody/ObservationQuestion.ts';
import ObservationRefused from '../../../../../src/domain/services/custody/ObservationRefused.ts';
import ObservationWritePremise from '../../../../../src/domain/services/custody/ObservationWritePremise.ts';
import ConeWriteRecovery, { SWEEP_READ_BUDGET } from '../../../../../src/domain/services/write/ConeWriteRecovery.ts';
import type ConeWriteSettlement from '../../../../../src/domain/services/write/ConeWriteSettlement.ts';
import WriteAttemptRecord from '../../../../../src/domain/services/write/WriteAttemptRecord.ts';
import WritePublicationProbe, {
  PUBLICATION_PROBE_READS,
  type WritePublicationHistory,
} from '../../../../../src/domain/services/write/WritePublicationProbe.ts';
import type { NodeInfo } from '../../../../../src/ports/CommitPort.ts';
import type CommitMessageCodecPort from '../../../../../src/ports/CommitMessageCodecPort.ts';
import WriteAttemptJournalPort from '../../../../../src/ports/WriteAttemptJournalPort.ts';

const TIP = 'c'.repeat(40);
const ATTEMPT_ARMED = { identity: {} } as ObservationAttempt;
/** Probes one sweep can afford when each finds its predecessor out of reach. */
const OUT_OF_REACH_PER_SWEEP = Math.floor(SWEEP_READ_BUDGET / PUBLICATION_PROBE_READS);

function recordOf(index: number, predecessor: string): WriteAttemptRecord {
  const writePremise = new ObservationWritePremise({ intents: new ObservationDigest('b'.repeat(64)), writerId: 'alice', predecessor });
  return new WriteAttemptRecord({
    preparation: new ObservationPreparation(new ObservationAttemptId(index.toString(16).padStart(32, '0')), new ObservationBindings({
      basis: TIP, observer: 'writer:alice', question: new ObservationQuestion('q', 1), purpose: 'p',
      budget: new ObservationBudget({ records: 1, bytes: 1, work: 1 }), evidence: [],
      dependencies: ObservationDependencyClaim.NONE, writePremise,
    })),
    admission: 'derived', occurrences: [], savedAt: 1,
  });
}

/** A writer chain so deep that every listing reaches its limit before any predecessor. */
class EndlessChain implements WritePublicationHistory {
  listed = 0;

  readRef(): Promise<string | null> {
    return Promise.resolve(TIP);
  }

  getNodeInfo(sha: string): Promise<NodeInfo> {
    return Promise.resolve({ sha, message: '', author: 'a', date: 'd', parents: [TIP] });
  }

  firstParentsSince(range: { readonly limit: number }): Promise<readonly string[]> {
    this.listed += range.limit;
    return Promise.resolve(Array.from({ length: range.limit }, () => TIP));
  }
}

/** Records kept the way a Git journal keeps them: one per attempt, replaced by a save. */
class MemoryJournal extends WriteAttemptJournalPort {
  readonly records = new Map<string, WriteAttemptRecord>();
  failSaves = false;

  constructor(records: readonly WriteAttemptRecord[]) {
    super();
    for (const record of records) {
      this.records.set(record.attemptId.value, record);
    }
  }

  override save(record: WriteAttemptRecord): Promise<void> {
    if (this.failSaves) {
      return Promise.reject(new Error('disk full'));
    }
    this.records.set(record.attemptId.value, record);
    return Promise.resolve();
  }

  override read(attemptId: ObservationAttemptId): Promise<WriteAttemptRecord | null> {
    return Promise.resolve(this.records.get(attemptId.value) ?? null);
  }

  override remove(attemptId: ObservationAttemptId): Promise<void> {
    this.records.delete(attemptId.value);
    return Promise.resolve();
  }

  override list(limit: number): Promise<readonly WriteAttemptRecord[]> {
    return Promise.resolve([...this.records.values()].slice(0, limit));
  }
}

const LOST_PREDECESSOR = 'e'.repeat(40);

/** A chain whose tip directly follows `LOST_PREDECESSOR`, in a message that names no attempt. */
class ShortChain extends EndlessChain {
  override getNodeInfo(sha: string): Promise<NodeInfo> {
    return Promise.resolve({ sha, message: '', author: 'a', date: 'd', parents: [LOST_PREDECESSOR] });
  }

  override firstParentsSince(): Promise<readonly string[]> {
    return Promise.resolve([TIP]);
  }
}

const UNNAMED_MESSAGES = { decodePatch: () => { throw new MessageCodecError('not a patch'); } } as unknown as CommitMessageCodecPort;

function recoveryOver(journal: MemoryJournal, chain: EndlessChain): { readonly recovery: ConeWriteRecovery; readonly resume: ReturnType<typeof vi.fn> } {
  const resume = vi.fn(() => Promise.resolve(new ObservationAdmitted(ATTEMPT_ARMED, 'armed')));
  const recovery = new ConeWriteRecovery({
    graph: 'g', clock: () => 1, journal,
    custody: { resume, recoverCoordinate: () => Promise.resolve(new ObservationRefused('not-settled')) } as unknown as ObservationCustodyService,
    probe: new WritePublicationProbe({ graph: 'g', history: chain, messages: UNNAMED_MESSAGES }),
    settlement: {} as ConeWriteSettlement,
  });
  return { recovery, resume };
}

describe('ConeWriteRecovery sweep budget (#1075)', () => {
  it('reads for an out-of-reach publication once: later opens leave its record to reconcile', async () => {
    const journal = new MemoryJournal([recordOf(1, 'd'.repeat(40))]);
    const chain = new EndlessChain();
    const { recovery } = recoveryOver(journal, chain);

    await recovery.sweep();
    expect(chain.listed).toBe(PUBLICATION_PROBE_READS);
    expect([...journal.records.values()].map((record) => record.reported)).toEqual([true]);

    await recovery.sweep();
    await recovery.sweep();
    expect(chain.listed).toBe(PUBLICATION_PROBE_READS);
  });

  it('stops a sweep once it cannot afford another full probe, leaving the rest for later opens', async () => {
    const journal = new MemoryJournal(Array.from({ length: OUT_OF_REACH_PER_SWEEP + 2 }, (_, index) => recordOf(index, 'd'.repeat(40))));
    const chain = new EndlessChain();
    const { recovery, resume } = recoveryOver(journal, chain);

    await recovery.sweep();

    expect(resume).toHaveBeenCalledTimes(OUT_OF_REACH_PER_SWEEP);
    expect(chain.listed).toBeLessThanOrEqual(SWEEP_READ_BUDGET);
    expect([...journal.records.values()].filter((record) => record.reported)).toHaveLength(OUT_OF_REACH_PER_SWEEP);
  });

  it('answers a reconcile with a distinct requirement, and keeps it even when the record cannot be saved', async () => {
    const record = recordOf(1, 'd'.repeat(40));
    const journal = new MemoryJournal([record]);
    journal.failSaves = true;
    const { recovery } = recoveryOver(journal, new EndlessChain());

    const answer = await recovery.reconcile('alice', record.attemptId.value);

    expect(answer).toBeInstanceOf(IndeterminateWriteReceipt);
    expect(answer instanceof IndeterminateWriteReceipt ? answer.requirement : '').toBe('publication-walk-exhausted');
    expect(journal.records.get(record.attemptId.value)?.reported).toBe(false);
  });

  it('does not save again a record a receipt already reported', async () => {
    const record = recordOf(1, 'd'.repeat(40)).asReported(null);
    const journal = new MemoryJournal([record]);
    const save = vi.spyOn(journal, 'save');
    const { recovery } = recoveryOver(journal, new EndlessChain());

    await recovery.reconcile('alice', record.attemptId.value);

    expect(save).not.toHaveBeenCalled();
  });

  it('keeps every finding within reach as it was: another patch finishes it, nothing yet leaves it unresolved', async () => {
    const lost = recordOf(1, LOST_PREDECESSOR);
    const pending = recordOf(2, TIP);
    const journal = new MemoryJournal([lost, pending]);
    const { recovery } = recoveryOver(journal, new ShortChain());

    await expect(recovery.reconcile('alice', lost.attemptId.value)).resolves.toMatchObject({ cause: 'stale-predecessor' });
    expect(journal.records.has(lost.attemptId.value)).toBe(false);
    const unresolved = await recovery.reconcile('alice', pending.attemptId.value);
    expect(unresolved instanceof IndeterminateWriteReceipt ? unresolved.requirement : '').toBe('publication-unresolved');
    expect(unresolved).not.toBeInstanceOf(UnpublishedWriteReceipt);
  });
});
