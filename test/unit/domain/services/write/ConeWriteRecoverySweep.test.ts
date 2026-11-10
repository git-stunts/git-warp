import { describe, expect, it, vi } from 'vitest';
import IndeterminateWriteReceipt from '../../../../../src/domain/api/IndeterminateWriteReceipt.ts';
import UnpublishedWriteReceipt from '../../../../../src/domain/api/UnpublishedWriteReceipt.ts';
import CustodyAcknowledged from '../../../../../src/domain/services/custody/CustodyAcknowledged.ts';
import type { CustodyTransition } from '../../../../../src/domain/services/custody/CustodyOutcome.ts';
import CustodyRefused from '../../../../../src/domain/services/custody/CustodyRefused.ts';
import ObservationAttemptId from '../../../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationBindings from '../../../../../src/domain/services/custody/ObservationBindings.ts';
import ObservationBudget from '../../../../../src/domain/services/custody/ObservationBudget.ts';
import type ObservationCustodyIdentity from '../../../../../src/domain/services/custody/ObservationCustodyIdentity.ts';
import ObservationCustodyService from '../../../../../src/domain/services/custody/ObservationCustodyService.ts';
import ObservationDependencyClaim from '../../../../../src/domain/services/custody/ObservationDependencyClaim.ts';
import ObservationDigest from '../../../../../src/domain/services/custody/ObservationDigest.ts';
import ObservationPreparation from '../../../../../src/domain/services/custody/ObservationPreparation.ts';
import ObservationQuestion from '../../../../../src/domain/services/custody/ObservationQuestion.ts';
import ObservationWritePremise from '../../../../../src/domain/services/custody/ObservationWritePremise.ts';
import ConeWriteRecovery, { SWEEP_READ_BUDGET, UNARMED_ATTEMPT_GRACE_MS } from '../../../../../src/domain/services/write/ConeWriteRecovery.ts';
import ConeWriteSettlement from '../../../../../src/domain/services/write/ConeWriteSettlement.ts';
import WriteAttemptListing from '../../../../../src/domain/services/write/WriteAttemptListing.ts';
import WriteAttemptRecord from '../../../../../src/domain/services/write/WriteAttemptRecord.ts';
import WritePublicationProbe, {
  PUBLICATION_PROBE_READS,
  type WritePublicationHistory,
} from '../../../../../src/domain/services/write/WritePublicationProbe.ts';
import AssetHandle from '../../../../../src/domain/storage/AssetHandle.ts';
import NodeCryptoAdapter from '../../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import ObservationCustodyCborCodec from '../../../../../src/infrastructure/adapters/ObservationCustodyCborCodec.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import codec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import type { NodeInfo } from '../../../../../src/ports/CommitPort.ts';
import { createGitCasPatchStorage } from '../../../../../src/ports/CommitMessageCodecPort.ts';
import WriteAttemptJournalPort from '../../../../../src/ports/WriteAttemptJournalPort.ts';
import { ScriptedCustody, ScriptedSupport } from '../../../../helpers/ScriptedObservationPorts.ts';

const TIP = 'c'.repeat(40);
/** A real patch commit message by `alice` that names an attempt no record here has. */
const ANOTHER_PATCH = DEFAULT_COMMIT_MESSAGE_CODEC.encodePatch({
  kind: 'patch', graph: 'g', writer: 'alice', lamport: 1, schema: 2, patchHandle: new AssetHandle('asset:another-patch'),
  storage: createGitCasPatchStorage({ encrypted: false }), publicationAttempt: 'f'.repeat(32),
});
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
    admission: 'derived', races: [], occurrences: [], savedAt: 1,
  });
}

/** A writer chain so deep that every listing reaches its limit before any predecessor. */
class EndlessChain implements WritePublicationHistory {
  listed = 0;

  readRef(): Promise<string | null> {
    return Promise.resolve(TIP);
  }

  getNodeInfo(sha: string): Promise<NodeInfo> {
    return Promise.resolve({ sha, message: ANOTHER_PATCH, author: 'a', date: 'd', parents: [TIP] });
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

  override list(limit: number): Promise<WriteAttemptListing> {
    return Promise.resolve(new WriteAttemptListing({ records: [...this.records.values()].slice(0, limit), unsupportedRefs: [] }));
  }
}

const LOST_PREDECESSOR = 'e'.repeat(40);

/** A chain whose tip directly follows `LOST_PREDECESSOR`, in a patch that names another attempt. */
class ShortChain extends EndlessChain {
  override getNodeInfo(sha: string): Promise<NodeInfo> {
    return Promise.resolve({ sha, message: ANOTHER_PATCH, author: 'a', date: 'd', parents: [LOST_PREDECESSOR] });
  }

  override firstParentsSince(): Promise<readonly string[]> {
    return Promise.resolve([TIP]);
  }
}

/** A scripted ledger that counts the transitions a recovery asks of it. */
class CountedCustody extends ScriptedCustody {
  reserves = 0;
  cancels = 0;

  override async reserve(identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    this.reserves += 1;
    return await super.reserve(identity);
  }

  override async cancel(identity: ObservationCustodyIdentity): Promise<CustodyTransition> {
    this.cancels += 1;
    return await super.cancel(identity);
  }
}

/** Every record here is saved at host time 1, so this clock reads just past an unarmed attempt's grace. */
const PAST_GRACE = 1 + UNARMED_ATTEMPT_GRACE_MS;

/** A ledger that holds every attempt armed with no settlement, as a crash after arming leaves it. */
function armedLedger(): CountedCustody {
  const ledger = new CountedCustody();
  ledger.reserved = new CustodyAcknowledged('recovered', 'armed');
  ledger.evidence.settlement = new CustodyRefused('not-settled');
  return ledger;
}

/** A ledger that holds every attempt reserved and never armed, and lets it be cancelled. */
function unarmedLedger(): CountedCustody {
  const ledger = new CountedCustody();
  ledger.reserved = new CustodyAcknowledged('recovered', 'reserved');
  return ledger;
}

/** Real recovery, custody service and settlement over the given ledger, which defaults to an armed one. */
function recoveryOver(journal: MemoryJournal, chain: EndlessChain, ledger: CountedCustody = armedLedger()): {
  readonly recovery: ConeWriteRecovery;
  readonly ledger: CountedCustody;
} {
  const custody = new ObservationCustodyService({
    custody: ledger, support: new ScriptedSupport(), codec: new ObservationCustodyCborCodec(codec), crypto: new NodeCryptoAdapter(),
    attempts: { next: () => new ObservationAttemptId('9'.repeat(32)) },
  });
  const recovery = new ConeWriteRecovery({
    graph: 'g', clock: () => PAST_GRACE, journal, custody,
    probe: new WritePublicationProbe({ graph: 'g', history: chain, messages: DEFAULT_COMMIT_MESSAGE_CODEC }),
    settlement: new ConeWriteSettlement({ graph: 'g', custody, journal }),
  });
  return { recovery, ledger };
}

describe('ConeWriteRecovery sweep budget (#1075)', () => {
  it('reads for an out-of-reach publication once: later opens keep its record and do not read for it again', async () => {
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
    const { recovery, ledger } = recoveryOver(journal, chain);

    await recovery.sweep();

    expect(ledger.reserves).toBe(OUT_OF_REACH_PER_SWEEP);
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

describe('ConeWriteRecovery of an unarmed attempt past its grace (#1075)', () => {
  it('keeps an attempt whose predecessor is out of reach, since the chain may hold its commit', async () => {
    const record = recordOf(1, 'd'.repeat(40));
    const journal = new MemoryJournal([record]);
    const { recovery, ledger } = recoveryOver(journal, new EndlessChain(), unarmedLedger());

    const answer = await recovery.reconcile('alice', record.attemptId.value);

    expect(answer).toBeInstanceOf(IndeterminateWriteReceipt);
    expect(answer instanceof IndeterminateWriteReceipt ? answer.requirement : '').toBe('publication-walk-exhausted');
    expect(journal.records.has(record.attemptId.value)).toBe(true);
    expect(ledger.cancels).toBe(0);
  });

  it('reads for it in one sweep only, and no sweep abandons it', async () => {
    const record = recordOf(1, 'd'.repeat(40));
    const journal = new MemoryJournal([record]);
    const chain = new EndlessChain();
    const { recovery, ledger } = recoveryOver(journal, chain, unarmedLedger());

    await recovery.sweep();
    await recovery.sweep();

    expect(chain.listed).toBe(PUBLICATION_PROBE_READS);
    expect(journal.records.get(record.attemptId.value)?.reported).toBe(true);
    expect(ledger.cancels).toBe(0);
  });

  it('still cancels an attempt whose writer chain has not moved past its predecessor', async () => {
    const record = recordOf(1, TIP);
    const journal = new MemoryJournal([record]);
    const { recovery, ledger } = recoveryOver(journal, new EndlessChain(), unarmedLedger());

    const answer = await recovery.reconcile('alice', record.attemptId.value);

    expect(answer).toBeInstanceOf(UnpublishedWriteReceipt);
    expect(answer instanceof UnpublishedWriteReceipt ? answer.cause : '').toBe('attempt-cancelled');
    expect(journal.records.has(record.attemptId.value)).toBe(false);
    expect(ledger.cancels).toBe(1);
  });
});
