import { describe, expect, it, vi } from 'vitest';
import IndeterminateWriteReceipt from '../../../../../src/domain/api/IndeterminateWriteReceipt.ts';
import UnpublishedWriteReceipt from '../../../../../src/domain/api/UnpublishedWriteReceipt.ts';
import WriterError from '../../../../../src/domain/errors/WriterError.ts';
import ObservationAdmitted from '../../../../../src/domain/services/custody/ObservationAdmitted.ts';
import type ObservationAttempt from '../../../../../src/domain/services/custody/ObservationAttempt.ts';
import ObservationAttemptId from '../../../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationBindings from '../../../../../src/domain/services/custody/ObservationBindings.ts';
import ObservationBudget from '../../../../../src/domain/services/custody/ObservationBudget.ts';
import type ObservationCustodyService from '../../../../../src/domain/services/custody/ObservationCustodyService.ts';
import ObservationDependencyClaim from '../../../../../src/domain/services/custody/ObservationDependencyClaim.ts';
import ObservationDigest from '../../../../../src/domain/services/custody/ObservationDigest.ts';
import ObservationKnownUnpublished from '../../../../../src/domain/services/custody/ObservationKnownUnpublished.ts';
import ObservationPrepared from '../../../../../src/domain/services/custody/ObservationPrepared.ts';
import ObservationPublicationPermission from '../../../../../src/domain/services/custody/ObservationPublicationPermission.ts';
import ObservationQuestion from '../../../../../src/domain/services/custody/ObservationQuestion.ts';
import ObservationRefused from '../../../../../src/domain/services/custody/ObservationRefused.ts';
import ObservationWritePremise from '../../../../../src/domain/services/custody/ObservationWritePremise.ts';
import ConeWritePublisher from '../../../../../src/domain/services/write/ConeWritePublisher.ts';
import type ConeWriteSettlement from '../../../../../src/domain/services/write/ConeWriteSettlement.ts';
import LoweredConeWrite from '../../../../../src/domain/services/write/LoweredConeWrite.ts';
import type PatchEntryFold from '../../../../../src/domain/services/write/PatchEntryFold.ts';
import type WritePublicationProbe from '../../../../../src/domain/services/write/WritePublicationProbe.ts';
import type { PatchBuilder } from '../../../../../src/domain/services/PatchBuilder.ts';
import type WriteAttemptJournalPort from '../../../../../src/ports/WriteAttemptJournalPort.ts';

const OID = 'c'.repeat(40);
const BINDINGS = new ObservationBindings({
  basis: OID, observer: 'writer:alice', question: new ObservationQuestion('q', 1), purpose: 'p',
  budget: new ObservationBudget({ records: 1, bytes: 1, work: 1 }), evidence: [],
  dependencies: ObservationDependencyClaim.NONE,
  writePremise: new ObservationWritePremise({ intents: new ObservationDigest('b'.repeat(64)), writerId: 'alice', predecessor: OID }),
});

type Stubs = {
  readonly custody?: Partial<Record<keyof ObservationCustodyService, () => Promise<object>>>;
  readonly commit?: () => Promise<object>;
  readonly probe?: Partial<Record<'proves' | 'locate', () => Promise<boolean | object>>>;
  readonly save?: () => Promise<void>;
};

function publisherOf(stubs: Stubs): { readonly publisher: ConeWritePublisher; readonly lowered: LoweredConeWrite; readonly remove: ReturnType<typeof vi.fn> } {
  const remove = vi.fn(() => Promise.resolve());
  const attempt = { identity: {} } as ObservationAttempt;
  const custody = {
    resume: () => Promise.resolve(new ObservationAdmitted(attempt, 'reserved')),
    prepare: () => Promise.resolve(Object.create(ObservationPrepared.prototype)),
    authorizePublication: () => Promise.resolve(Object.create(ObservationPublicationPermission.prototype)),
    cancel: () => Promise.resolve(new ObservationKnownUnpublished(attempt)),
    ...stubs.custody,
  } as unknown as ObservationCustodyService;
  return {
    remove,
    lowered: new LoweredConeWrite({
      writer: 'alice', bindings: BINDINGS, admission: 'derived', races: [], occurrences: [],
      builder: { commitWithEvidence: stubs.commit ?? (() => Promise.resolve({ sha: OID })) } as unknown as PatchBuilder,
      fold: { fold: () => Promise.resolve() } as unknown as PatchEntryFold,
    }),
    publisher: new ConeWritePublisher({
      graph: 'g', custody, clock: () => 1,
      journal: { save: stubs.save ?? (() => Promise.resolve()), remove } as unknown as WriteAttemptJournalPort,
      attempts: { next: () => new ObservationAttemptId('a'.repeat(32)) },
      probe: { proves: () => Promise.resolve(true), locate: () => Promise.resolve({ kind: 'none' }), ...stubs.probe } as unknown as WritePublicationProbe,
      settlement: { settle: () => Promise.reject(new Error('not reached')) } as unknown as ConeWriteSettlement,
    }),
  };
}

const NOT_REVOKED = (): Promise<null> => Promise.resolve(null);

describe('ConeWritePublisher before permission', () => {
  it('reports unpublished when the record cannot be saved, having reserved nothing', async () => {
    const resume = vi.fn(() => Promise.reject(new Error('not reached')));
    const { publisher, lowered } = publisherOf({ save: () => Promise.reject(new Error('disk full')), custody: { resume } });

    const receipt = await publisher.publish(lowered, NOT_REVOKED);

    expect(receipt).toBeInstanceOf(UnpublishedWriteReceipt);
    expect(receipt instanceof UnpublishedWriteReceipt ? receipt.cause : '').toBe('attempt-journal-unavailable');
    expect(resume).not.toHaveBeenCalled();
  });

  it('cancels and forgets an attempt whose preparation is refused', async () => {
    const cancel = vi.fn(() => Promise.resolve({}));
    const { publisher, lowered, remove } = publisherOf({ custody: { prepare: () => Promise.resolve(new ObservationRefused('writer-limit')), cancel } });

    const receipt = await publisher.publish(lowered, NOT_REVOKED);

    expect(receipt instanceof UnpublishedWriteReceipt ? receipt.cause : '').toBe('retention-refused-writer-limit');
    expect(cancel).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });

  it('repeats a preparation another builder holds', async () => {
    const prepare = vi.fn()
      .mockResolvedValueOnce(new ObservationRefused('construction-contended'))
      .mockResolvedValueOnce(new ObservationRefused('writer-limit'));
    const { publisher, lowered } = publisherOf({ custody: { prepare } });

    const receipt = await publisher.publish(lowered, NOT_REVOKED);

    expect(prepare).toHaveBeenCalledTimes(2);
    expect(receipt instanceof UnpublishedWriteReceipt ? receipt.cause : '').toBe('retention-refused-writer-limit');
  });

  it('forgets an attempt custody says was cancelled', async () => {
    const attempt = { identity: {} } as ObservationAttempt;
    const { publisher, lowered, remove } = publisherOf({ custody: { prepare: () => Promise.resolve(new ObservationKnownUnpublished(attempt)) } });

    const receipt = await publisher.publish(lowered, NOT_REVOKED);

    expect(receipt instanceof UnpublishedWriteReceipt ? receipt.cause : '').toBe('attempt-cancelled');
    expect(remove).toHaveBeenCalledOnce();
  });
});

describe('ConeWritePublisher after permission', () => {
  it('stays indeterminate when a commit it was handed does not prove out', async () => {
    const { publisher, lowered } = publisherOf({ probe: { proves: () => Promise.resolve(false) } });

    expect(await publisher.publish(lowered, NOT_REVOKED)).toBeInstanceOf(IndeterminateWriteReceipt);
  });

  it('stays indeterminate when the chain cannot be read after a failure', async () => {
    const { publisher, lowered } = publisherOf({
      commit: () => Promise.reject(new Error('disk')),
      probe: { locate: () => Promise.reject(new Error('still broken')) },
    });

    expect(await publisher.publish(lowered, NOT_REVOKED)).toBeInstanceOf(IndeterminateWriteReceipt);
  });

  it('reports a lost race unpublished however recording it goes, and keeps the record', async () => {
    const conflict = new WriterError('moved', { code: 'WRITER_CAS_CONFLICT' });
    conflict.actualSha = 'd'.repeat(40);
    const { publisher, lowered, remove } = publisherOf({
      commit: () => Promise.reject(conflict),
      custody: { settleFailedPublication: () => Promise.reject(new Error('store went away')) },
    });

    const receipt = await publisher.publish(lowered, NOT_REVOKED);

    expect(receipt instanceof UnpublishedWriteReceipt ? receipt.cause : '').toBe('stale-predecessor');
    expect(remove).not.toHaveBeenCalled();
  });

  it('does not call a conflict lost when the ref still reads as its predecessor', async () => {
    const conflict = new WriterError('moved', { code: 'WRITER_CAS_CONFLICT' });
    conflict.actualSha = OID;
    const { publisher, lowered } = publisherOf({ commit: () => Promise.reject(conflict) });

    expect(await publisher.publish(lowered, NOT_REVOKED)).toBeInstanceOf(IndeterminateWriteReceipt);
  });
});
