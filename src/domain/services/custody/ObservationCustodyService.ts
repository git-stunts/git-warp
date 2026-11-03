import type CryptoPort from '../../../ports/CryptoPort.ts';
import type ObservationAttemptSourcePort from '../../../ports/ObservationAttemptSourcePort.ts';
import type ObservationCustodyCodecPort from '../../../ports/ObservationCustodyCodecPort.ts';
import type ObservationCustodyPort from '../../../ports/ObservationCustodyPort.ts';
import type ObservationSupportPort from '../../../ports/ObservationSupportPort.ts';
import type { ObservationSupportOutcome } from '../../../ports/ObservationSupportPort.ts';
import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';
import CustodyAcknowledged from './CustodyAcknowledged.ts';
import CustodyEvidence from './CustodyEvidence.ts';
import CustodyInspection from './CustodyInspection.ts';
import CustodyRefused from './CustodyRefused.ts';
import type { CustodyIndeterminateOrRefused } from './observationCustodyVariants.ts';
import { digestOf } from './observationDigestOf.ts';
import ObservationAdmitted from './ObservationAdmitted.ts';
import ObservationAttempt from './ObservationAttempt.ts';
import type ObservationAttemptId from './ObservationAttemptId.ts';
import type ObservationBindings from './ObservationBindings.ts';
import ObservationCoordinate from './ObservationCoordinate.ts';
import ObservationCustodyIdentity from './ObservationCustodyIdentity.ts';
import ObservationCustodyPage from './ObservationCustodyPage.ts';
import ObservationCustodyResolver from './ObservationCustodyResolver.ts';
import ObservationCustodyRoots from './ObservationCustodyRoots.ts';
import ObservationDecodeFailure from './ObservationDecodeFailure.ts';
import ObservationIndeterminate, { type ObservationCustodyStep } from './ObservationIndeterminate.ts';
import ObservationKnownUnpublished from './ObservationKnownUnpublished.ts';
import ObservationPreparation from './ObservationPreparation.ts';
import ObservationPrepared from './ObservationPrepared.ts';
import ObservationPreparedPage from './ObservationPreparedPage.ts';
import type ObservationPublicationEvidence from './ObservationPublicationEvidence.ts';
import ObservationPublicationPermission from './ObservationPublicationPermission.ts';
import type ObservationReceiptCore from './ObservationReceiptCore.ts';
import ObservationReconciled from './ObservationReconciled.ts';
import ObservationReconcileOnly from './ObservationReconcileOnly.ts';
import ObservationRecord from './ObservationRecord.ts';
import ObservationRefused from './ObservationRefused.ts';
import ObservationSettlementPage from './ObservationSettlementPage.ts';
import ObservationSupportCancelled from './ObservationSupportCancelled.ts';
import ObservationSupportRefused from './ObservationSupportRefused.ts';
import type { ObservationSupportSources } from './ObservationSupportRequest.ts';
import type ObservationSupportRetained from './ObservationSupportRetained.ts';
import ResolvedObservation from './ResolvedObservation.ts';
import RetainedObservation from './RetainedObservation.ts';

/** An attempt's owned builder: awaited by cancellation, and told to stop between steps. */
type OwnedBuild = { stopRequested: boolean; work: Promise<ObservationSupportOutcome> };

export type ObservationCustodyServiceOptions = {
  readonly custody: ObservationCustodyPort;
  readonly support: ObservationSupportPort;
  readonly codec: ObservationCustodyCodecPort;
  readonly crypto: CryptoPort;
  readonly attempts: ObservationAttemptSourcePort;
};

/**
 * Largest custody page this service writes. Storage accepts more, but a page
 * must also decode again: exceeding the decoder's bound would settle evidence
 * that could never resolve.
 */
const MAX_PAGE_BYTES = 4 * 1024 * 1024;

/**
 * Producer-facing state transitions of shared observation custody (#1067).
 *
 * git-cas owns capacity and custody; this service owns what the retained
 * evidence means. Only a fresh `armed` acknowledgement yields permission. A
 * Coordinate is issued only after settlement is acknowledged and its evidence
 * re-verified. No failure ever becomes permission to retry an intent.
 */
export default class ObservationCustodyService {
  readonly #custody: ObservationCustodyPort;
  readonly #support: ObservationSupportPort;
  readonly #codec: ObservationCustodyCodecPort;
  readonly #crypto: CryptoPort;
  readonly #attempts: ObservationAttemptSourcePort;
  readonly #resolver: ObservationCustodyResolver;
  readonly #builds = new Map<string, OwnedBuild>();

  constructor(options: ObservationCustodyServiceOptions) {
    this.#custody = options.custody;
    this.#support = options.support;
    this.#codec = options.codec;
    this.#crypto = options.crypto;
    this.#attempts = options.attempts;
    this.#resolver = new ObservationCustodyResolver(options);
  }

  /** Reserves capacity for a new attempt before anything can be published. */
  async begin(bindings: ObservationBindings): Promise<ObservationAdmitted | ObservationRefused | ObservationIndeterminate> {
    return await this.resume(this.#attempts.next(), bindings);
  }

  /** Recovers an existing attempt with its original id and bindings; different bindings refuse. */
  async resume(
    attemptId: ObservationAttemptId,
    bindings: ObservationBindings,
  ): Promise<ObservationAdmitted | ObservationRefused | ObservationIndeterminate> {
    const attempt = await this.#attemptOf(attemptId, bindings);
    const reserved = await this.#custody.reserve(attempt.identity);
    return reserved instanceof CustodyAcknowledged
      ? new ObservationAdmitted(attempt, reserved.phase)
      : failureOf(reserved, 'reservation');
  }

  /** Retains the attempt's original support and acknowledges preparation. */
  async prepare(
    attempt: ObservationAttempt,
    sources: ObservationSupportSources,
  ): Promise<ObservationPrepared | ObservationKnownUnpublished | ObservationRefused | ObservationIndeterminate> {
    const inspected = await this.#custody.inspect(attempt.identity);
    if (!(inspected instanceof CustodyInspection)) {
      return failureOf(inspected, 'preparation');
    }
    if (inspected.phase === 'cancelled') {
      return new ObservationKnownUnpublished(attempt);
    }
    return inspected.phase === 'reserved'
      ? await this.#buildAndPrepare(attempt, sources)
      : await this.#recoverPrepared(attempt);
  }

  /** Competes for the one publication permission of a prepared write attempt. */
  async authorizePublication(
    attempt: ObservationAttempt,
  ): Promise<ObservationPublicationPermission | ObservationReconcileOnly | ObservationKnownUnpublished
    | ObservationRefused | ObservationIndeterminate> {
    if (attempt.preparation.bindings.writePremise === null) {
      throw misuse('A read attempt has no publication to authorize');
    }
    const armed = await this.#custody.arm(attempt.identity);
    if (armed instanceof CustodyAcknowledged) {
      return armed.status === 'armed' ? new ObservationPublicationPermission(attempt) : new ObservationReconcileOnly(attempt);
    }
    return armed instanceof CustodyRefused ? armRefusal(attempt, armed) : failureOf(armed, 'arm');
  }

  /** Retains the exact final outcome. A Coordinate exists only when this returns it. */
  async settle(
    attempt: ObservationAttempt,
    outcome: { readonly core: ObservationReceiptCore; readonly publication: ObservationPublicationEvidence | null },
  ): Promise<RetainedObservation | ObservationKnownUnpublished | ObservationRefused | ObservationIndeterminate> {
    assertPublicationMatches(attempt, outcome.publication);
    const blocked = await this.#settlementPermitted(attempt, outcome.publication);
    if (blocked !== null) {
      return blocked;
    }
    const prepared = await this.#custody.readEvidence(attempt.identity, 'preparation');
    if (!(prepared instanceof CustodyEvidence)) {
      return failureOf(prepared, 'settlement');
    }
    const coreBytes = this.#codec.encodeCore(outcome.core);
    const record = new ObservationRecord({
      preparation: attempt.identity.binding,
      support: await digestOf(this.#crypto, prepared.page.record()),
      core: await digestOf(this.#crypto, coreBytes),
      publication: outcome.publication,
    });
    return await this.#settleRecord(attempt, record, coreBytes);
  }

  /** Stops and awaits owned work, then cancels if the attempt is still unarmed. */
  async cancel(
    attempt: ObservationAttempt,
  ): Promise<ObservationKnownUnpublished | ObservationReconcileOnly | ObservationRefused | ObservationIndeterminate> {
    await this.#quiesce(attempt);
    const cancelled = await this.#custody.cancel(attempt.identity);
    if (cancelled instanceof CustodyAcknowledged) {
      await this.#releaseConstruction(attempt);
      return new ObservationKnownUnpublished(attempt);
    }
    return cancelled instanceof CustodyRefused ? cancelRefusal(attempt, cancelled) : failureOf(cancelled, 'cancellation');
  }

  /** Completes storage transitions only. It never arms, retries or executes anything. */
  async reconcile(attempt: ObservationAttempt): Promise<ObservationReconciled | ObservationRefused | ObservationIndeterminate> {
    const reconciled = await this.#custody.reconcile(attempt.identity);
    if (!(reconciled instanceof CustodyAcknowledged)) {
      return failureOf(reconciled, 'reconciliation');
    }
    if (reconciled.phase !== 'reserved') {
      await this.#releaseConstruction(attempt);
    }
    return new ObservationReconciled(reconciled.phase);
  }

  /** The exact original evidence of a Coordinate, or a typed unavailable outcome. */
  async resolve(coordinate: ObservationCoordinate): ReturnType<ObservationCustodyResolver['resolve']> {
    return await this.#resolver.resolve(coordinate);
  }

  async #attemptOf(attemptId: ObservationAttemptId, bindings: ObservationBindings): Promise<ObservationAttempt> {
    const preparation = new ObservationPreparation(attemptId, bindings);
    const bytes = this.#codec.encodePreparation(preparation);
    const identity = new ObservationCustodyIdentity(attemptId, await digestOf(this.#crypto, bytes));
    return new ObservationAttempt({ preparation, identity, bytes });
  }

  async #buildAndPrepare(
    attempt: ObservationAttempt,
    sources: ObservationSupportSources,
  ): Promise<ObservationPrepared | ObservationKnownUnpublished | ObservationRefused | ObservationIndeterminate> {
    const built = await this.#ownedBuild(attempt, sources);
    if (built instanceof ObservationIndeterminate || built instanceof ObservationRefused) {
      return built;
    }
    const page = new ObservationPreparedPage(attempt.bytes(), built.summary);
    const bytes = this.#codec.encodePreparedPage(page);
    if (bytes.length > MAX_PAGE_BYTES) {
      return new ObservationRefused('evidence-too-large');
    }
    const prepared = await this.#custody.prepare(attempt.identity, new ObservationCustodyPage(bytes, built.roots));
    return prepared instanceof CustodyAcknowledged
      ? await this.#acknowledgePrepared(attempt, built.roots)
      : failureOf(prepared, 'preparation');
  }

  async #acknowledgePrepared(attempt: ObservationAttempt, roots: ObservationCustodyRoots): Promise<ObservationPrepared> {
    await this.#releaseConstruction(attempt);
    return new ObservationPrepared(attempt, roots);
  }

  /** Runs the builder as owned work; a stop request and any failure each become a variant. */
  async #ownedBuild(
    attempt: ObservationAttempt,
    sources: ObservationSupportSources,
  ): Promise<ObservationSupportRetained | ObservationRefused | ObservationIndeterminate> {
    const key = attempt.identity.attemptId.value;
    if (this.#builds.has(key)) {
      return new ObservationRefused('construction-contended');
    }
    const build: OwnedBuild = { stopRequested: false, work: Promise.resolve(new ObservationSupportCancelled()) };
    build.work = this.#support.retain({
      ...sources,
      identity: attempt.identity,
      basis: attempt.preparation.bindings.basis,
      claim: attempt.preparation.bindings.dependencies,
      isCancelled: () => build.stopRequested,
    });
    this.#builds.set(key, build);
    try {
      return mapSupport(await build.work);
    } catch (cause) {
      return new ObservationIndeterminate('preparation', cause instanceof Error ? cause : new ObservationCustodyError('Observation support failed'));
    } finally {
      this.#builds.delete(key);
    }
  }

  /** Exact recovery of a past preparation: original evidence is read, never rebuilt. */
  async #recoverPrepared(attempt: ObservationAttempt): Promise<ObservationPrepared | ObservationRefused | ObservationIndeterminate> {
    const evidence = await this.#custody.readEvidence(attempt.identity, 'preparation');
    if (!(evidence instanceof CustodyEvidence)) {
      return failureOf(evidence, 'preparation');
    }
    const page = this.#codec.decodePreparedPage(evidence.page.record());
    if (page instanceof ObservationDecodeFailure || !bytesEqual(page.preparation(), attempt.bytes())) {
      return new ObservationRefused('preparation-mismatch');
    }
    await this.#releaseConstruction(attempt);
    return new ObservationPrepared(attempt, evidence.page.roots);
  }

  /** A write settles only once armed: it has no effect to report otherwise. */
  async #settlementPermitted(
    attempt: ObservationAttempt,
    publication: ObservationPublicationEvidence | null,
  ): Promise<ObservationKnownUnpublished | ObservationRefused | ObservationIndeterminate | null> {
    const inspected = await this.#custody.inspect(attempt.identity);
    if (!(inspected instanceof CustodyInspection)) {
      return failureOf(inspected, 'settlement');
    }
    return inspected.phase === 'cancelled' ? cancelledOutcome(attempt, publication) : unarmedWrite(attempt, inspected);
  }

  async #settleRecord(
    attempt: ObservationAttempt,
    record: ObservationRecord,
    coreBytes: Uint8Array,
  ): Promise<RetainedObservation | ObservationKnownUnpublished | ObservationRefused | ObservationIndeterminate> {
    const recordBytes = this.#codec.encodeRecord(record);
    const page = this.#codec.encodeSettlementPage(new ObservationSettlementPage(recordBytes, coreBytes));
    if (page.length > MAX_PAGE_BYTES) {
      return new ObservationRefused('evidence-too-large');
    }
    const parents = record.publication === null ? [] : [record.publication.commit];
    const settled = await this.#custody.settle(attempt.identity, new ObservationCustodyPage(page, new ObservationCustodyRoots([], parents)));
    if (!(settled instanceof CustodyAcknowledged)) {
      return settlementFailure(attempt, record, settled);
    }
    const coordinate = new ObservationCoordinate({
      attemptId: attempt.identity.attemptId,
      binding: attempt.identity.binding,
      record: await digestOf(this.#crypto, recordBytes),
    });
    return await this.#issue(coordinate, coreBytes);
  }

  /** Issues a Coordinate only for evidence that resolves back to the exact core. */
  async #issue(coordinate: ObservationCoordinate, coreBytes: Uint8Array): Promise<RetainedObservation | ObservationIndeterminate> {
    const resolved = await this.#resolver.resolve(coordinate);
    if (!(resolved instanceof ResolvedObservation)) {
      return new ObservationIndeterminate('settlement', new ObservationCustodyError(
        `Settled observation does not resolve: ${resolved.reason}`,
        { code: 'E_OBSERVATION_CUSTODY_UNVERIFIED', context: { reason: resolved.reason } },
      ));
    }
    return new RetainedObservation(coordinate, coreBytes);
  }

  async #quiesce(attempt: ObservationAttempt): Promise<void> {
    const build = this.#builds.get(attempt.identity.attemptId.value);
    if (build !== undefined) {
      build.stopRequested = true;
      await build.work.catch(() => null);
    }
  }

  /** Construction state is disposable once custody holds it; residue only costs a ref until reconciled. */
  async #releaseConstruction(attempt: ObservationAttempt): Promise<void> {
    await this.#support.release(attempt.identity).catch(() => undefined);
  }
}

function failureOf(outcome: CustodyIndeterminateOrRefused, step: ObservationCustodyStep): ObservationRefused | ObservationIndeterminate {
  return outcome instanceof CustodyRefused ? new ObservationRefused(outcome.reason) : new ObservationIndeterminate(step, outcome.cause);
}

/**
 * A won cancellation means no effect can occur, so a reported publication
 * contradicts it. That must surface, never read as known-unpublished.
 */
function cancelledOutcome(
  attempt: ObservationAttempt,
  publication: ObservationPublicationEvidence | null,
): ObservationKnownUnpublished | ObservationIndeterminate {
  if (publication === null) {
    return new ObservationKnownUnpublished(attempt);
  }
  return new ObservationIndeterminate('settlement', new ObservationCustodyError(
    'A publication was reported for an attempt whose cancellation won',
    { code: 'E_OBSERVATION_CUSTODY_CONTRADICTED', context: { commit: publication.commit } },
  ));
}

function settlementFailure(
  attempt: ObservationAttempt,
  record: ObservationRecord,
  outcome: CustodyIndeterminateOrRefused,
): ObservationKnownUnpublished | ObservationRefused | ObservationIndeterminate {
  return outcome instanceof CustodyRefused && outcome.reason === 'cancelled'
    ? cancelledOutcome(attempt, record.publication)
    : failureOf(outcome, 'settlement');
}

function unarmedWrite(attempt: ObservationAttempt, inspected: CustodyInspection): ObservationRefused | null {
  const isWrite = attempt.preparation.bindings.writePremise !== null;
  const unarmed = inspected.phase === 'reserved' || inspected.phase === 'prepared';
  return isWrite && unarmed ? new ObservationRefused('not-armed') : null;
}

/** A refused arm is never a retry: any effect that may exist stays reconcile-only. */
function armRefusal(
  attempt: ObservationAttempt,
  refusal: CustodyRefused,
): ObservationReconcileOnly | ObservationKnownUnpublished | ObservationRefused {
  if (refusal.reason === 'cancelled') {
    return new ObservationKnownUnpublished(attempt);
  }
  const armedBefore = refusal.reason === 'already-armed' || refusal.reason === 'already-settled';
  return armedBefore ? new ObservationReconcileOnly(attempt) : new ObservationRefused(refusal.reason);
}

function cancelRefusal(
  attempt: ObservationAttempt,
  refusal: CustodyRefused,
): ObservationKnownUnpublished | ObservationReconcileOnly | ObservationRefused {
  if (refusal.reason === 'cancelled') {
    return new ObservationKnownUnpublished(attempt);
  }
  return isIrreversible(refusal) ? new ObservationReconcileOnly(attempt) : new ObservationRefused(refusal.reason);
}

function isIrreversible(refusal: CustodyRefused): boolean {
  return refusal.reason === 'irreversible' || refusal.reason === 'already-armed' || refusal.reason === 'already-settled';
}

/** A stopped builder is only a refusal: "known unpublished" needs an acknowledged cancel. */
function mapSupport(outcome: ObservationSupportOutcome): ObservationSupportRetained | ObservationRefused {
  if (outcome instanceof ObservationSupportCancelled) {
    return new ObservationRefused('cancelled');
  }
  return outcome instanceof ObservationSupportRefused ? new ObservationRefused(outcome.reason) : outcome;
}

function assertPublicationMatches(attempt: ObservationAttempt, publication: ObservationPublicationEvidence | null): void {
  const premise = attempt.preparation.bindings.writePremise;
  if (premise === null ? publication !== null : publication?.writerId !== premise.writerId) {
    throw misuse('A write settles with its selected writer\'s publication, and a read with none');
  }
}

function misuse(message: string): ObservationCustodyError {
  return new ObservationCustodyError(message, { code: 'E_OBSERVATION_CUSTODY_MISUSE' });
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}
