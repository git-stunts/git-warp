import type CryptoPort from '../../../ports/CryptoPort.ts';
import type ObservationAttemptSourcePort from '../../../ports/ObservationAttemptSourcePort.ts';
import type ObservationCustodyCodecPort from '../../../ports/ObservationCustodyCodecPort.ts';
import type ObservationCustodyPort from '../../../ports/ObservationCustodyPort.ts';
import type ObservationSupportPort from '../../../ports/ObservationSupportPort.ts';
import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';
import CustodyAcknowledged from './CustodyAcknowledged.ts';
import CustodyEvidence from './CustodyEvidence.ts';
import CustodyInspection from './CustodyInspection.ts';
import CustodyRefused from './CustodyRefused.ts';
import type { CustodyPhase } from './CustodyVocabulary.ts';
import {
  armRefusal, assertArmable, assertPermitted, assertPublicationMatches, bytesEqual, cancelRefusal, cancelledOutcome, failureOf, mapSupport,
  preArmReason, settlementFailure, unarmedWrite, unverified,
} from './observationCustodyOutcomes.ts';
import type { CustodyIndeterminateOrRefused } from './observationCustodyVariants.ts';
import { digestOf } from './observationDigestOf.ts';
import ObservationAdmitted from './ObservationAdmitted.ts';
import ObservationAttempt from './ObservationAttempt.ts';
import type ObservationAttemptId from './ObservationAttemptId.ts';
import type ObservationBindings from './ObservationBindings.ts';
import type ObservationCoordinate from './ObservationCoordinate.ts';
import ObservationCustodyIdentity from './ObservationCustodyIdentity.ts';
import ObservationCustodyPage from './ObservationCustodyPage.ts';
import ObservationCustodyRecovery, { coordinateOf } from './ObservationCustodyRecovery.ts';
import ObservationCustodyResolver from './ObservationCustodyResolver.ts';
import ObservationCustodyRoots from './ObservationCustodyRoots.ts';
import ObservationDecodeFailure from './ObservationDecodeFailure.ts';
import ObservationIndeterminate from './ObservationIndeterminate.ts';
import ObservationKnownUnpublished from './ObservationKnownUnpublished.ts';
import ObservationPreparation from './ObservationPreparation.ts';
import ObservationPrepared from './ObservationPrepared.ts';
import ObservationPreparedPage from './ObservationPreparedPage.ts';
import type ObservationPublicationEvidence from './ObservationPublicationEvidence.ts';
import ObservationPublicationFailed from './ObservationPublicationFailed.ts';
import ObservationPublicationPermission from './ObservationPublicationPermission.ts';
import type ObservationReceiptCore from './ObservationReceiptCore.ts';
import ObservationReconciled from './ObservationReconciled.ts';
import ObservationReconcileOnly from './ObservationReconcileOnly.ts';
import ObservationRecord from './ObservationRecord.ts';
import ObservationRefused from './ObservationRefused.ts';
import ObservationSettlementPage from './ObservationSettlementPage.ts';
import type { ObservationSupportRequest, ObservationSupportSources } from './ObservationSupportRequest.ts';
import ObservationSupportRetained from './ObservationSupportRetained.ts';
import ObservationUnretained from './ObservationUnretained.ts';
import ResolvedObservation from './ResolvedObservation.ts';
import RetainedObservation from './RetainedObservation.ts';

/** An attempt's owned builder: awaited by cancellation, and told to stop between steps. */
type OwnedBuild = {
  readonly stop: { requested: boolean };
  readonly work: Promise<ObservationSupportRetained | ObservationRefused | ObservationIndeterminate>;
};

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
  readonly #recovery: ObservationCustodyRecovery;
  readonly #builds = new Map<string, OwnedBuild>();

  constructor(options: ObservationCustodyServiceOptions) {
    this.#custody = options.custody;
    this.#support = options.support;
    this.#codec = options.codec;
    this.#crypto = options.crypto;
    this.#attempts = options.attempts;
    this.#resolver = new ObservationCustodyResolver(options);
    this.#recovery = new ObservationCustodyRecovery({ ...options, resolver: this.#resolver });
  }

  /**
   * Reserves capacity for a new attempt with an id minted here. The caller learns
   * that id only from the result, so a producer that must recover from a lost
   * acknowledgement saves its own id first and calls `resume` instead.
   */
  async begin(bindings: ObservationBindings): Promise<ObservationAdmitted | ObservationRefused | ObservationIndeterminate> {
    return await this.resume(this.#attempts.next(), bindings);
  }

  /** Recovers an existing attempt with its original id and bindings; different bindings refuse. */
  async resume(
    attemptId: ObservationAttemptId,
    bindings: ObservationBindings,
  ): Promise<ObservationAdmitted | ObservationRefused | ObservationIndeterminate> {
    const attempt = await this.#attemptOf(attemptId, bindings);
    if (this.#codec.decodePreparation(attempt.bytes()) instanceof ObservationDecodeFailure) {
      return new ObservationRefused('preparation-unencodable');
    }
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
      : await this.#recoverPrepared(attempt, inspected.phase);
  }

  /** Competes for the one publication permission of a prepared write attempt. */
  async authorizePublication(
    prepared: ObservationPrepared,
  ): Promise<ObservationPublicationPermission | ObservationReconcileOnly | ObservationKnownUnpublished
    | ObservationRefused | ObservationIndeterminate> {
    assertArmable(prepared);
    const { attempt } = prepared;
    const armed = await this.#custody.arm(attempt.identity);
    if (armed instanceof CustodyAcknowledged) {
      return armed.status === 'armed' ? new ObservationPublicationPermission(attempt) : new ObservationReconcileOnly(attempt);
    }
    return armed instanceof CustodyRefused ? armRefusal(attempt, armed) : failureOf(armed, 'arm');
  }

  /** Retains the exact final outcome, and issues its Coordinate once that resolves. */
  async settle(
    attempt: ObservationAttempt,
    outcome: { readonly core: ObservationReceiptCore; readonly publication: ObservationPublicationEvidence | null },
  ): Promise<RetainedObservation | ObservationUnretained | ObservationKnownUnpublished | ObservationRefused | ObservationIndeterminate> {
    assertPublicationMatches(attempt, outcome.publication);
    return await this.#settled(attempt, outcome);
  }

  /**
   * Records that the one attempt this permission allowed definitely did not publish,
   * such as a lost predecessor race, so the attempt ends rather than staying open.
   * Requiring the permission keeps this from anyone who could not know that. An
   * uncertain outcome must stay uncertain: call nothing, and report it indeterminate.
   */
  async settleFailedPublication(
    permission: ObservationPublicationPermission,
    core: ObservationReceiptCore,
  ): Promise<ObservationPublicationFailed | ObservationUnretained | ObservationKnownUnpublished | ObservationRefused | ObservationIndeterminate> {
    assertPermitted(permission);
    const { attempt } = permission;
    const inspected = await this.#custody.inspect(attempt.identity);
    if (!(inspected instanceof CustodyInspection)) {
      return failureOf(inspected, 'settlement');
    }
    if (inspected.phase === 'reserved' || inspected.phase === 'prepared') {
      return new ObservationRefused('not-armed');
    }
    const settled = await this.#settled(attempt, { core, publication: null });
    return settled instanceof RetainedObservation ? new ObservationPublicationFailed(attempt.identity) : settled;
  }

  async #settled(
    attempt: ObservationAttempt,
    outcome: { readonly core: ObservationReceiptCore; readonly publication: ObservationPublicationEvidence | null },
  ): Promise<RetainedObservation | ObservationUnretained | ObservationKnownUnpublished | ObservationRefused | ObservationIndeterminate> {
    const blocked = await this.#settlementPermitted(attempt, outcome.publication);
    if (blocked !== null) {
      return blocked;
    }
    const prepared = await this.#custody.readEvidence(attempt.identity, 'preparation');
    if (!(prepared instanceof CustodyEvidence)) {
      return settlementFailure(attempt, outcome.publication, prepared);
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
    await this.#quiesce(attempt.identity);
    const cancelled = await this.#custody.cancel(attempt.identity);
    if (cancelled instanceof CustodyAcknowledged) {
      await this.#releaseConstruction(attempt.identity);
      return new ObservationKnownUnpublished(attempt);
    }
    return cancelled instanceof CustodyRefused ? cancelRefusal(attempt, cancelled) : failureOf(cancelled, 'cancellation');
  }

  /** Completes storage transitions only. It never arms, retries or executes anything. */
  async reconcile(attempt: ObservationAttempt): Promise<ObservationReconciled | ObservationRefused | ObservationIndeterminate> {
    await this.#quiesce(attempt.identity);
    const reconciled = await this.#custody.reconcile(attempt.identity);
    if (!(reconciled instanceof CustodyAcknowledged)) {
      return failureOf(reconciled, 'reconciliation');
    }
    if (reconciled.phase !== 'reserved') {
      await this.#releaseConstruction(attempt.identity);
    }
    return new ObservationReconciled(reconciled.phase);
  }

  /**
   * The outcome of a settled attempt, rebuilt from retained evidence and its identity.
   * This is how a producer that lost an acknowledgement, or its process, gets a token
   * back. It completes storage first, so settlement evidence pinned just before a
   * crash is found. Unverified evidence may be a transient read failure, so may be retried.
   */
  async recoverCoordinate(identity: ObservationCustodyIdentity): Promise<RetainedObservation | ObservationPublicationFailed | ObservationRefused | ObservationIndeterminate> {
    return await this.#recovery.recoverCoordinate(identity);
  }

  /**
   * Attempts in one phase, as the ledger last recorded them, one bounded page at a time.
   * Diagnostic only: it finds what a crash stranded and never decides admission.
   */
  attempts(phase: CustodyPhase): AsyncGenerator<ObservationCustodyIdentity | ObservationIndeterminate> {
    return this.#recovery.attempts(phase);
  }

  /**
   * Frees an unarmed attempt known only by identity, such as a reservation whose
   * producer crashed before saving it. Nothing can prove a producer is gone, but this
   * is safe against a live one: it loses its work and its later arm refuses as
   * cancelled. An armed attempt refuses, because its charge stays.
   */
  async abandon(identity: ObservationCustodyIdentity): Promise<ObservationReconciled | ObservationRefused | ObservationIndeterminate> {
    await this.#quiesce(identity);
    const cancelled = await this.#custody.cancel(identity);
    if (!(cancelled instanceof CustodyAcknowledged)) {
      return failureOf(cancelled, 'cancellation');
    }
    await this.#releaseConstruction(identity);
    return new ObservationReconciled('cancelled');
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
    return await this.#writePreparation(attempt, built);
  }

  /** Builds support, then verifies it, as one piece of work a cancellation awaits. */
  async #verifiedBuild(
    attempt: ObservationAttempt,
    request: ObservationSupportRequest,
  ): Promise<ObservationSupportRetained | ObservationRefused | ObservationIndeterminate> {
    const built = mapSupport(await this.#support.retain(request));
    if (built instanceof ObservationRefused) {
      return built;
    }
    return await this.#unverifiedSupport(attempt, built) ?? built;
  }

  /**
   * Verifies retained support as resolve will, before anything can be armed. With
   * the page check in `#decodesBound`, support that passes here passes there under
   * unchanged limits and intact objects. Limits lowered later report as limits.
   */
  async #unverifiedSupport(
    attempt: ObservationAttempt,
    built: ObservationSupportRetained,
  ): Promise<ObservationRefused | ObservationIndeterminate | null> {
    try {
      const fault = await this.#support.verify(attempt.identity, {
        basis: attempt.preparation.bindings.basis, roots: built.roots, summary: built.summary,
      });
      return fault === null ? null : new ObservationRefused(preArmReason(fault));
    } catch (cause) {
      return new ObservationIndeterminate('preparation', cause instanceof Error ? cause : new ObservationCustodyError('Observation support failed'));
    }
  }

  async #writePreparation(
    attempt: ObservationAttempt,
    built: ObservationSupportRetained,
  ): Promise<ObservationPrepared | ObservationKnownUnpublished | ObservationRefused | ObservationIndeterminate> {
    const page = new ObservationPreparedPage(attempt.bytes(), built.summary);
    const bytes = this.#codec.encodePreparedPage(page);
    if (bytes.length > MAX_PAGE_BYTES) {
      return new ObservationRefused('evidence-too-large');
    }
    if (!this.#decodesBound(attempt, bytes)) {
      return new ObservationRefused('support-unverified');
    }
    const prepared = await this.#custody.prepare(attempt.identity, new ObservationCustodyPage(bytes, built.roots));
    return prepared instanceof CustodyAcknowledged
      ? await this.#acknowledgePrepared(attempt, built.roots)
      : await this.#preparationFailure(attempt, prepared);
  }

  /** The rest of what resolve will check of this page: that it decodes, and that it holds what was claimed. */
  #decodesBound(attempt: ObservationAttempt, bytes: Uint8Array): boolean {
    const page = this.#codec.decodePreparedPage(bytes);
    return !(page instanceof ObservationDecodeFailure) && page.summary.claim().equals(attempt.preparation.bindings.dependencies);
  }

  /**
   * A durable cancel means no effect can occur. A mismatch means custody already holds
   * another build of this attempt. Either way nothing else would release this construction.
   */
  async #preparationFailure(
    attempt: ObservationAttempt,
    outcome: CustodyIndeterminateOrRefused,
  ): Promise<ObservationKnownUnpublished | ObservationRefused | ObservationIndeterminate> {
    if (!(outcome instanceof CustodyRefused)) {
      return failureOf(outcome, 'preparation');
    }
    if (outcome.reason === 'cancelled' || outcome.reason === 'preparation-mismatch') {
      await this.#releaseConstruction(attempt.identity);
    }
    return outcome.reason === 'cancelled' ? new ObservationKnownUnpublished(attempt) : new ObservationRefused(outcome.reason);
  }

  async #acknowledgePrepared(attempt: ObservationAttempt, roots: ObservationCustodyRoots): Promise<ObservationPrepared> {
    await this.#releaseConstruction(attempt.identity);
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
    const stop = { requested: false };
    const work = this.#verifiedBuild(attempt, {
      ...sources,
      identity: attempt.identity,
      basis: attempt.preparation.bindings.basis,
      claim: attempt.preparation.bindings.dependencies,
      isCancelled: () => stop.requested,
    });
    this.#builds.set(key, { stop, work });
    try {
      return await work;
    } catch (cause) {
      return new ObservationIndeterminate('preparation', cause instanceof Error ? cause : new ObservationCustodyError('Observation support failed'));
    } finally {
      this.#builds.delete(key);
    }
  }

  /**
   * Exact recovery of a past preparation: original evidence is read, never rebuilt.
   * While still unarmed it must also pass verification under the current limits,
   * since arming it next would otherwise risk an effect that cannot be issued.
   */
  async #recoverPrepared(
    attempt: ObservationAttempt,
    phase: CustodyPhase,
  ): Promise<ObservationPrepared | ObservationRefused | ObservationIndeterminate> {
    const evidence = await this.#custody.readEvidence(attempt.identity, 'preparation');
    if (!(evidence instanceof CustodyEvidence)) {
      return failureOf(evidence, 'preparation');
    }
    const page = this.#codec.decodePreparedPage(evidence.page.record());
    if (page instanceof ObservationDecodeFailure || !bytesEqual(page.preparation(), attempt.bytes())) {
      return new ObservationRefused('preparation-mismatch');
    }
    const retained = new ObservationSupportRetained(evidence.page.roots, page.summary);
    return await this.#recoveredSupport(attempt, phase, retained);
  }

  async #recoveredSupport(
    attempt: ObservationAttempt,
    phase: CustodyPhase,
    retained: ObservationSupportRetained,
  ): Promise<ObservationPrepared | ObservationRefused | ObservationIndeterminate> {
    const failed = phase === 'prepared' ? await this.#unverifiedSupport(attempt, retained) : null;
    return failed ?? await this.#acknowledgePrepared(attempt, retained.roots);
  }

  async #settlementPermitted(
    attempt: ObservationAttempt,
    publication: ObservationPublicationEvidence | null,
  ): Promise<ObservationKnownUnpublished | ObservationUnretained | ObservationRefused | ObservationIndeterminate | null> {
    const inspected = await this.#custody.inspect(attempt.identity);
    if (!(inspected instanceof CustodyInspection)) {
      return settlementFailure(attempt, publication, inspected);
    }
    return inspected.phase === 'cancelled' ? cancelledOutcome(attempt, publication) : unarmedWrite(publication, inspected);
  }

  async #settleRecord(
    attempt: ObservationAttempt,
    record: ObservationRecord,
    coreBytes: Uint8Array,
  ): Promise<RetainedObservation | ObservationUnretained | ObservationKnownUnpublished | ObservationRefused | ObservationIndeterminate> {
    const recordBytes = this.#codec.encodeRecord(record);
    const page = this.#codec.encodeSettlementPage(new ObservationSettlementPage(recordBytes, coreBytes));
    const unretainable = this.#unretainable(page, coreBytes);
    if (unretainable !== null) {
      return record.publication === null ? new ObservationRefused(unretainable) : new ObservationUnretained(attempt, unretainable);
    }
    const parents = record.publication === null ? [] : [record.publication.commit];
    const settled = await this.#custody.settle(attempt.identity, new ObservationCustodyPage(page, new ObservationCustodyRoots([], parents)));
    return settled instanceof CustodyAcknowledged
      ? await this.#issued(attempt, record, { recordBytes, coreBytes })
      : settlementFailure(attempt, record.publication, settled);
  }

  async #issued(
    attempt: ObservationAttempt,
    record: ObservationRecord,
    bytes: { readonly recordBytes: Uint8Array; readonly coreBytes: Uint8Array },
  ): Promise<RetainedObservation | ObservationUnretained | ObservationIndeterminate> {
    const issued = await this.#issue(await coordinateOf(this.#crypto, attempt.identity, bytes.recordBytes), bytes.coreBytes);
    return issued instanceof ObservationIndeterminate && record.publication !== null ? new ObservationUnretained(attempt, 'settlement-unverified') : issued;
  }

  /** Why a settlement page could never resolve, checked before it can be retained. */
  #unretainable(page: Uint8Array, coreBytes: Uint8Array): 'evidence-too-large' | 'evidence-undecodable' | null {
    if (page.length > MAX_PAGE_BYTES) {
      return 'evidence-too-large';
    }
    return this.#codec.decodeCore(coreBytes) instanceof ObservationDecodeFailure ? 'evidence-undecodable' : null;
  }

  /** Issues a Coordinate only for evidence that resolves back to the exact core. */
  async #issue(coordinate: ObservationCoordinate, coreBytes: Uint8Array): Promise<RetainedObservation | ObservationIndeterminate> {
    const resolved = await this.#resolver.resolve(coordinate);
    if (!(resolved instanceof ResolvedObservation)) {
      return unverified(resolved.reason);
    }
    return new RetainedObservation(coordinate, coreBytes);
  }

  async #quiesce(identity: ObservationCustodyIdentity): Promise<void> {
    const build = this.#builds.get(identity.attemptId.value);
    if (build !== undefined) {
      build.stop.requested = true;
      await build.work.catch(() => null);
    }
  }

  /** Construction state is disposable once custody holds it; residue only costs a ref until reconciled. */
  async #releaseConstruction(identity: ObservationCustodyIdentity): Promise<void> {
    await this.#support.release(identity).catch(() => undefined);
  }
}
