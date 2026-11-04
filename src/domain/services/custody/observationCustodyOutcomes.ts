import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';
import CustodyRefused from './CustodyRefused.ts';
import type CustodyInspection from './CustodyInspection.ts';
import type { ObservationSupportOutcome } from '../../../ports/ObservationSupportPort.ts';
import type { CustodyIndeterminateOrRefused } from './observationCustodyVariants.ts';
import type ObservationAttempt from './ObservationAttempt.ts';
import ObservationIndeterminate, { type ObservationCustodyStep } from './ObservationIndeterminate.ts';
import ObservationKnownUnpublished from './ObservationKnownUnpublished.ts';
import ObservationPrepared from './ObservationPrepared.ts';
import type ObservationPublicationEvidence from './ObservationPublicationEvidence.ts';
import ObservationReconcileOnly from './ObservationReconcileOnly.ts';
import ObservationRefused, { type ObservationRefusalReason } from './ObservationRefused.ts';
import ObservationSupportCancelled from './ObservationSupportCancelled.ts';
import type ObservationSupportFault from './ObservationSupportFault.ts';
import ObservationSupportRefused from './ObservationSupportRefused.ts';
import type ObservationSupportRetained from './ObservationSupportRetained.ts';
import type { ObservationUnavailableReason } from './ObservationUnavailable.ts';
import ObservationUnretained from './ObservationUnretained.ts';

export function failureOf(outcome: CustodyIndeterminateOrRefused, step: ObservationCustodyStep): ObservationRefused | ObservationIndeterminate {
  return outcome instanceof CustodyRefused ? new ObservationRefused(outcome.reason) : new ObservationIndeterminate(step, outcome.cause);
}

/** A publication was reported that custody never permitted. That must surface, never read as a plain state. */
function contradicted(publication: ObservationPublicationEvidence, reason: string): ObservationIndeterminate {
  return new ObservationIndeterminate('settlement', new ObservationCustodyError(
    `A publication was reported for an attempt ${reason}`,
    { code: 'E_OBSERVATION_CUSTODY_CONTRADICTED', context: { commit: publication.commit } },
  ));
}

/** A won cancellation means no effect can occur, so a reported publication contradicts it. */
export function cancelledOutcome(
  attempt: ObservationAttempt,
  publication: ObservationPublicationEvidence | null,
): ObservationKnownUnpublished | ObservationIndeterminate {
  return publication === null ? new ObservationKnownUnpublished(attempt) : contradicted(publication, 'whose cancellation won');
}

/** With a publication in hand the write is admitted, so a failure to retain it is never a plain refusal. */
export function settlementFailure(
  attempt: ObservationAttempt,
  publication: ObservationPublicationEvidence | null,
  outcome: CustodyIndeterminateOrRefused,
): ObservationKnownUnpublished | ObservationUnretained | ObservationRefused | ObservationIndeterminate {
  if (outcome instanceof CustodyRefused && outcome.reason === 'cancelled') {
    return cancelledOutcome(attempt, publication);
  }
  if (publication === null) {
    return failureOf(outcome, 'settlement');
  }
  return new ObservationUnretained(attempt, outcome instanceof CustodyRefused ? 'settlement-refused' : 'settlement-unacknowledged');
}

/** Arming needs preparation this service verified, so recovery cannot step around that check. */
export function assertArmable(prepared: ObservationPrepared): void {
  if (!(prepared instanceof ObservationPrepared)) {
    throw misuse('Arming needs the preparation that prepare returned');
  }
  if (prepared.attempt.preparation.bindings.writePremise === null) {
    throw misuse('A read attempt has no publication to authorize');
  }
}

/** A write only settles with a publication, and an unarmed attempt was never permitted one. */
export function unarmedWrite(publication: ObservationPublicationEvidence | null, inspected: CustodyInspection): ObservationIndeterminate | null {
  const unarmed = inspected.phase === 'reserved' || inspected.phase === 'prepared';
  return publication !== null && unarmed ? contradicted(publication, 'that was never armed') : null;
}

/** A refused arm is never a retry: any effect that may exist stays reconcile-only. */
export function armRefusal(
  attempt: ObservationAttempt,
  refusal: CustodyRefused,
): ObservationReconcileOnly | ObservationKnownUnpublished | ObservationRefused {
  if (refusal.reason === 'cancelled') {
    return new ObservationKnownUnpublished(attempt);
  }
  const armedBefore = refusal.reason === 'already-armed' || refusal.reason === 'already-settled';
  return armedBefore ? new ObservationReconcileOnly(attempt) : new ObservationRefused(refusal.reason);
}

export function cancelRefusal(
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
export function mapSupport(outcome: ObservationSupportOutcome): ObservationSupportRetained | ObservationRefused {
  if (outcome instanceof ObservationSupportCancelled) {
    return new ObservationRefused('cancelled');
  }
  return outcome instanceof ObservationSupportRefused ? new ObservationRefused(outcome.reason) : outcome;
}

export function assertPublicationMatches(attempt: ObservationAttempt, publication: ObservationPublicationEvidence | null): void {
  const premise = attempt.preparation.bindings.writePremise;
  if (premise === null ? publication !== null : publication?.writerId !== premise.writerId) {
    throw misuse('A write settles with its selected writer\'s publication, and a read with none');
  }
}

export function misuse(message: string): ObservationCustodyError {
  return new ObservationCustodyError(message, { code: 'E_OBSERVATION_CUSTODY_MISUSE' });
}

/** Settled evidence that does not resolve: the settlement landed, and no Coordinate can be issued for it. */
export function unverified(reason: ObservationUnavailableReason): ObservationIndeterminate {
  return new ObservationIndeterminate('settlement', new ObservationCustodyError(
    `Settled observation does not resolve: ${reason}`,
    { code: 'E_OBSERVATION_CUSTODY_UNVERIFIED', context: { reason } },
  ));
}

export function preArmReason(fault: ObservationSupportFault): ObservationRefusalReason {
  return fault.reason === 'work-limit' || fault.reason === 'support-limit' ? fault.reason : 'support-unverified';
}

export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}
