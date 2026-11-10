import type ObservationAttemptSourcePort from '../../../ports/ObservationAttemptSourcePort.ts';
import type WriteAttemptJournalPort from '../../../ports/WriteAttemptJournalPort.ts';
import type { AuthoredWriteReceipt } from '../../api/AuthoredWriteReceipt.ts';
import IndeterminateWriteReceipt from '../../api/IndeterminateWriteReceipt.ts';
import UnpublishedWriteReceipt from '../../api/UnpublishedWriteReceipt.ts';
import UnretainedWriteReceipt from '../../api/UnretainedWriteReceipt.ts';
import type { PatchCommitResult } from '../../types/PatchCommitResult.ts';
import ObservationAdmitted from '../custody/ObservationAdmitted.ts';
import type ObservationAttempt from '../custody/ObservationAttempt.ts';
import type ObservationCustodyService from '../custody/ObservationCustodyService.ts';
import ObservationKnownUnpublished from '../custody/ObservationKnownUnpublished.ts';
import ObservationPreparation from '../custody/ObservationPreparation.ts';
import ObservationPrepared from '../custody/ObservationPrepared.ts';
import ObservationPublicationFailed from '../custody/ObservationPublicationFailed.ts';
import ObservationPublicationPermission from '../custody/ObservationPublicationPermission.ts';
import ObservationRefused from '../custody/ObservationRefused.ts';
import ObservationUnretained from '../custody/ObservationUnretained.ts';
import type { default as ConeWriteSettlement, PublishedAttempt } from './ConeWriteSettlement.ts';
import type LoweredConeWrite from './LoweredConeWrite.ts';
import WriteAttemptRecord from './WriteAttemptRecord.ts';
import type WritePublicationProbe from './WritePublicationProbe.ts';
import { failedWriteCore } from './writeReceiptCore.ts';

const CONTENDED_STEP_ATTEMPTS = 4;
const STALE_PREDECESSOR = 'stale-predecessor';
const PUBLICATION_UNRESOLVED = 'publication-unresolved';
const NO_DEPENDENCIES = async function* noDependencies(): AsyncGenerator<never> { /* A write claims none. */ };
const CAPACITY_REPAIR = Object.freeze([Object.freeze({
  code: 'retention_capacity_exhausted',
  message: 'This graph has used every retention slot it was opened with, and the limit cannot be raised yet.',
})]);

/** How the one publication went: landed, definitely did not, or cannot be told. */
type PublicationFate =
  | { readonly kind: 'landed'; readonly commit: string; readonly result: PatchCommitResult | null }
  | { readonly kind: 'failed' }
  | { readonly kind: 'uncertain' };

const FAILED: PublicationFate = Object.freeze({ kind: 'failed' });
const UNCERTAIN: PublicationFate = Object.freeze({ kind: 'uncertain' });

/**
 * Carries a lowered write through custody's write protocol (#1051): save, reserve,
 * prepare, arm, publish once, settle. Only a fresh permission reaches the patch
 * journal, and nothing here ever retries an intent. Until the commit is attempted
 * this producer knows nothing published, since it alone would publish.
 */
export default class ConeWritePublisher {
  readonly #graph: string;
  readonly #custody: ObservationCustodyService;
  readonly #journal: WriteAttemptJournalPort;
  readonly #attempts: ObservationAttemptSourcePort;
  readonly #probe: WritePublicationProbe;
  readonly #settlement: ConeWriteSettlement;
  readonly #clock: () => number;

  constructor(fields: {
    readonly graph: string;
    readonly custody: ObservationCustodyService;
    readonly journal: WriteAttemptJournalPort;
    readonly attempts: ObservationAttemptSourcePort;
    readonly probe: WritePublicationProbe;
    readonly settlement: ConeWriteSettlement;
    readonly clock: () => number;
  }) {
    this.#graph = fields.graph;
    this.#custody = fields.custody;
    this.#journal = fields.journal;
    this.#attempts = fields.attempts;
    this.#probe = fields.probe;
    this.#settlement = fields.settlement;
    this.#clock = fields.clock;
    Object.freeze(this);
  }

  async publish(lowered: LoweredConeWrite, revocation: () => Promise<string | null>): Promise<AuthoredWriteReceipt> {
    const record = new WriteAttemptRecord({
      preparation: new ObservationPreparation(this.#attempts.next(), lowered.bindings),
      admission: lowered.admission,
      races: lowered.races,
      occurrences: lowered.occurrences,
      savedAt: this.#clock(),
    });
    const permission = await this.#permission(record, revocation);
    return permission instanceof ObservationPublicationPermission
      ? await this.#publishPermitted({ lowered, record, permission })
      : permission;
  }

  async #permission(record: WriteAttemptRecord, revocation: () => Promise<string | null>): Promise<ObservationPublicationPermission | UnpublishedWriteReceipt> {
    if (!await this.#saved(record)) {
      return this.#unpublished(record, 'attempt-journal-unavailable');
    }
    const admitted = await contended(async () => await this.#custody.resume(record.attemptId, record.bindings));
    if (!(admitted instanceof ObservationAdmitted)) {
      return await this.#notPermitted(record, { step: admitted, attempt: null });
    }
    return await this.#armed(record, admitted.attempt, revocation);
  }

  async #armed(record: WriteAttemptRecord, attempt: ObservationAttempt, revocation: () => Promise<string | null>): Promise<ObservationPublicationPermission | UnpublishedWriteReceipt> {
    const prepared = await contended(async () => await this.#custody.prepare(attempt, { dependencies: NO_DEPENDENCIES() }));
    if (!(prepared instanceof ObservationPrepared)) {
      return await this.#notPermitted(record, { step: prepared, attempt });
    }
    const revoked = await this.#revocationChecked({ record, attempt, revocation });
    if (revoked !== null) {
      return await this.#revoked(record, attempt, revoked);
    }
    const armed = await contended(async () => await this.#custody.authorizePublication(prepared));
    return armed instanceof ObservationPublicationPermission ? armed : await this.#notPermitted(record, { step: armed, attempt });
  }

  /** An access port that throws here stops the attempt, rather than leave it charged until a sweep. */
  async #revocationChecked(run: {
    readonly record: WriteAttemptRecord;
    readonly attempt: ObservationAttempt;
    readonly revocation: () => Promise<string | null>;
  }): Promise<string | null> {
    try {
      return await run.revocation();
    } catch (error) {
      await this.#stop(run.record, run.attempt);
      throw error;
    }
  }

  async #revoked(record: WriteAttemptRecord, attempt: ObservationAttempt, cause: string): Promise<UnpublishedWriteReceipt> {
    await this.#stop(record, attempt);
    return this.#unpublished(record, cause);
  }

  /** Forgets an attempt only once it holds no slot. One still charged keeps its record, so a sweep can end it. */
  async #stop(record: WriteAttemptRecord, attempt: ObservationAttempt | null): Promise<void> {
    const ended = attempt === null || await this.#custody.cancel(attempt) instanceof ObservationKnownUnpublished;
    if (ended) {
      await this.#forget(record);
    }
  }

  async #forget(record: WriteAttemptRecord): Promise<void> {
    try {
      await this.#journal.remove(record.attemptId);
    } catch {
      // The next sweep finds this attempt finished and removes the record.
    }
  }

  /** Nothing is reserved until the record is durable, so an attempt that fails here has no trace to recover. */
  async #saved(record: WriteAttemptRecord): Promise<boolean> {
    try {
      await this.#journal.save(record);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * No permission was held, so nothing published. A refused or cancelled attempt is
   * finished with. Any other uncertainty keeps its record for the sweep to resolve.
   */
  async #notPermitted(record: WriteAttemptRecord, failure: {
    readonly step: object;
    readonly attempt: ObservationAttempt | null;
  }): Promise<UnpublishedWriteReceipt> {
    const { step, attempt } = failure;
    if (step instanceof ObservationKnownUnpublished) {
      await this.#forget(record);
    }
    if (step instanceof ObservationRefused) {
      await this.#stop(record, attempt);
    }
    return this.#unpublished(record, refusalCause(step));
  }

  async #publishPermitted(run: {
    readonly lowered: LoweredConeWrite;
    readonly record: WriteAttemptRecord;
    readonly permission: ObservationPublicationPermission;
  }): Promise<AuthoredWriteReceipt> {
    const { lowered, record, permission } = run;
    const fate = await this.#publishOnce(lowered, record);
    if (fate.kind === 'landed') {
      if (fate.result !== null) {
        await lowered.fold.fold(fate.result);
      }
      return await this.#settledLanding({ attempt: permission.attempt, record, commit: fate.commit });
    }
    return fate.kind === 'failed' ? await this.#failed(record, permission) : await this.#indeterminate(record);
  }

  async #settledLanding(published: PublishedAttempt): Promise<AuthoredWriteReceipt> {
    const receipt = await this.#settlement.settle(published);
    if (receipt instanceof UnretainedWriteReceipt && receipt.attempt !== null) {
      await this.#markReported(published.record, published.commit);
    }
    return receipt;
  }

  async #publishOnce(lowered: LoweredConeWrite, record: WriteAttemptRecord): Promise<PublicationFate> {
    try {
      const result = await lowered.builder.commitWithEvidence(record.attemptId.value);
      return await this.#probe.proves(result.sha, record) ? { kind: 'landed', commit: result.sha, result } : UNCERTAIN;
    } catch {
      return await this.#fateAfterFailure(record);
    }
  }

  /**
   * A failed call proves nothing, and neither does a compare-and-swap error, which the
   * committer also raises for a commit that landed with its acknowledgement lost. Only the chain decides.
   */
  async #fateAfterFailure(record: WriteAttemptRecord): Promise<PublicationFate> {
    try {
      const found = await this.#probe.locate(record);
      if (found.kind === 'own') {
        return { kind: 'landed', commit: found.commit, result: null };
      }
      return found.kind === 'other' ? FAILED : UNCERTAIN;
    } catch {
      return UNCERTAIN;
    }
  }

  /**
   * The attempt ends and keeps its slot. Report unpublished however that records,
   * since it did not publish, unless custody holds another outcome for this attempt.
   */
  async #failed(record: WriteAttemptRecord, permission: ObservationPublicationPermission): Promise<AuthoredWriteReceipt> {
    try {
      const settled = await this.#custody.settleFailedPublication(permission, failedWriteCore(this.#graph, record, STALE_PREDECESSOR));
      if (settled instanceof ObservationPublicationFailed) {
        await this.#forget(record);
      }
      return isSettledOtherwise(settled) ? await this.#indeterminate(record) : this.#unpublished(record, STALE_PREDECESSOR);
    } catch {
      // The record stays: the chain still shows this attempt lost, so the next sweep finishes it.
      return this.#unpublished(record, STALE_PREDECESSOR);
    }
  }

  /** The caller now holds this attempt's name, so a sweep must leave its answer for `reconcile`. */
  async #indeterminate(record: WriteAttemptRecord): Promise<IndeterminateWriteReceipt> {
    await this.#markReported(record, null);
    return new IndeterminateWriteReceipt({
      graph: this.#graph, writer: record.premise.writerId, attempt: record.attemptId.value, requirement: PUBLICATION_UNRESOLVED,
    });
  }

  /** Only here does a caller hold the attempt's name. If this fails a sweep may answer first, and `reconcile` then reports null. */
  async #markReported(record: WriteAttemptRecord, commit: string | null): Promise<void> {
    try {
      await this.#journal.save(record.asReported(commit));
    } catch {
      // The receipt is still true, and the original record still recovers.
    }
  }

  #unpublished(record: WriteAttemptRecord, cause: string): UnpublishedWriteReceipt {
    return new UnpublishedWriteReceipt({
      graph: this.#graph, writer: record.premise.writerId, cause,
      ...(cause === 'retention-capacity-exhausted' ? { repairHints: CAPACITY_REPAIR } : {}),
    });
  }
}

function isSettledOtherwise(settled: object): boolean {
  return (settled instanceof ObservationRefused && settled.reason === 'settlement-mismatch')
    || (settled instanceof ObservationUnretained && settled.reason === 'settlement-conflict');
}

/** Repeats a step while it only reports another participant's contention, which is safe: none of these publish. */
async function contended<T extends object>(step: () => Promise<T>): Promise<T> {
  let result = await step();
  for (let attempt = 1; attempt < CONTENDED_STEP_ATTEMPTS && isContention(result); attempt += 1) {
    result = await step();
  }
  return result;
}

function isContention(result: object): boolean {
  return result instanceof ObservationRefused && (result.reason === 'contention' || result.reason === 'construction-contended');
}

function refusalCause(step: object): string {
  if (step instanceof ObservationRefused) {
    return step.reason === 'capacity-full' ? 'retention-capacity-exhausted' : `retention-refused-${step.reason}`;
  }
  return step instanceof ObservationKnownUnpublished ? 'attempt-cancelled' : 'retention-unavailable';
}
