import ContinuumEvidenceClaim from './ContinuumEvidenceClaim.ts';
import ContinuumFamilyId from './ContinuumFamilyId.ts';
import GitWarpReceiptSourceFacts from './GitWarpReceiptSourceFacts.ts';
import WarpError from '../errors/WarpError.ts';
import type ContinuumArtifactDescriptor from './ContinuumArtifactDescriptor.ts';
import type { DeliveryObservation } from '../types/DeliveryObservation.ts';
import type { OpOutcome, TickReceipt } from '../types/TickReceipt.ts';

const RECEIPT_FAMILY_ID = 'receipt-family';
const WITNESS_KIND_GIT_WARP_TICK_RECEIPT = 'git-warp-tick-receipt';

export type ContinuumReceiptFamilyProjectionFields = {
  readonly evidence: ContinuumEvidenceClaim;
  readonly sourceFacts: GitWarpReceiptSourceFacts;
};

export type ContinuumReceiptOpFact = {
  readonly op: string;
  readonly target: string;
  readonly result: OpOutcome['result'];
  readonly reason?: string;
};

export type ContinuumReceiptFact = {
  readonly patchSha: string;
  readonly writer: string;
  readonly lamport: number;
  readonly ops: readonly Readonly<ContinuumReceiptOpFact>[];
};

export type ContinuumReceiptWitnessFact = {
  readonly kind: typeof WITNESS_KIND_GIT_WARP_TICK_RECEIPT;
  readonly receiptPatchSha: string;
  readonly evidencePosture: string;
  readonly descriptorArtifactKind: string;
};

export type ContinuumDeliveryObservationFact = {
  readonly emissionId: string;
  readonly sinkId: string;
  readonly outcome: string;
  readonly timestamp: number;
  readonly reason?: string;
  readonly lens: {
    readonly mode: string;
    readonly suppressExternal: boolean;
  };
};

/**
 * Generated-family projection of local git-warp receipt facts.
 *
 * The arrays intentionally use the operation names from the generated
 * receipt-family fixture: `receipts`, `witnesses`, and `deliveryObservations`.
 */
export default class ContinuumReceiptFamilyProjection {
  readonly familyId: ContinuumFamilyId;
  readonly descriptor: ContinuumArtifactDescriptor;
  readonly evidence: ContinuumEvidenceClaim;
  readonly sourceFacts: GitWarpReceiptSourceFacts;
  readonly receipts: readonly Readonly<ContinuumReceiptFact>[];
  readonly witnesses: readonly Readonly<ContinuumReceiptWitnessFact>[];
  readonly deliveryObservations: readonly Readonly<ContinuumDeliveryObservationFact>[];

  /** Builds an immutable receipt-family projection from validated source facts. */
  constructor(fields: ContinuumReceiptFamilyProjectionFields) {
    const checkedFields = requireFields(fields);
    this.evidence = requireEvidence(checkedFields.evidence).requireTranslatedGitWarpEvidence();
    this.descriptor = requireReceiptFamilyDescriptor(this.evidence.descriptor);
    this.sourceFacts = requireSourceFacts(checkedFields.sourceFacts);
    this.familyId = this.descriptor.familyId;
    this.receipts = Object.freeze([projectReceipt(this.sourceFacts.tickReceipt)]);
    this.witnesses = Object.freeze([projectWitness(this.evidence, this.sourceFacts.tickReceipt)]);
    this.deliveryObservations = projectDeliveryObservations(this.sourceFacts.deliveryObservations);
    Object.freeze(this);
  }
}

/** Validates the projection constructor envelope. */
function requireFields(
  value: ContinuumReceiptFamilyProjectionFields | null | undefined,
): ContinuumReceiptFamilyProjectionFields {
  if (value === null || value === undefined) {
    throw new WarpError('ContinuumReceiptFamilyProjection fields must be provided', 'E_VALIDATION');
  }
  return value;
}

/** Validates a Continuum evidence claim carrier. */
function requireEvidence(value: ContinuumEvidenceClaim): ContinuumEvidenceClaim {
  if (!(value instanceof ContinuumEvidenceClaim)) {
    throw new WarpError('evidence must be a ContinuumEvidenceClaim', 'E_VALIDATION');
  }
  return value;
}

/** Validates a source-facts carrier. */
function requireSourceFacts(value: GitWarpReceiptSourceFacts): GitWarpReceiptSourceFacts {
  if (!(value instanceof GitWarpReceiptSourceFacts)) {
    throw new WarpError('sourceFacts must be GitWarpReceiptSourceFacts', 'E_VALIDATION');
  }
  return value;
}

/** Validates that the evidence descriptor is generated receipt-family authority. */
function requireReceiptFamilyDescriptor(descriptor: ContinuumArtifactDescriptor): ContinuumArtifactDescriptor {
  if (!descriptor.familyId.equals(new ContinuumFamilyId(RECEIPT_FAMILY_ID))) {
    throw new WarpError('receipt-family projection requires a receipt-family descriptor', 'E_VALIDATION');
  }
  if (!descriptor.hasGeneratedAuthority()) {
    throw new WarpError('receipt-family projection requires generated descriptor authority', 'E_VALIDATION');
  }
  if (descriptor.witnessScope !== undefined && descriptor.witnessScope !== RECEIPT_FAMILY_ID) {
    throw new WarpError('receipt-family descriptor witnessScope must be receipt-family', 'E_VALIDATION');
  }
  return descriptor;
}

/** Projects a git-warp TickReceipt into the generated Receipt shape. */
function projectReceipt(receipt: TickReceipt): Readonly<ContinuumReceiptFact> {
  return Object.freeze({
    patchSha: receipt.patchSha,
    writer: receipt.writer,
    lamport: receipt.lamport,
    ops: projectOps(receipt.ops),
  });
}

/** Projects immutable operation outcomes. */
function projectOps(ops: TickReceipt['ops']): readonly Readonly<ContinuumReceiptOpFact>[] {
  const projected: Readonly<ContinuumReceiptOpFact>[] = [];
  for (const op of ops) {
    const fact: ContinuumReceiptOpFact = op.reason !== undefined
      ? { op: op.op, target: op.target, result: op.result, reason: op.reason }
      : { op: op.op, target: op.target, result: op.result };
    projected.push(Object.freeze(fact));
  }
  return Object.freeze(projected);
}

/** Projects a git-warp receipt witness with explicit translated evidence posture. */
function projectWitness(
  evidence: ContinuumEvidenceClaim,
  receipt: TickReceipt,
): Readonly<ContinuumReceiptWitnessFact> {
  return Object.freeze({
    kind: WITNESS_KIND_GIT_WARP_TICK_RECEIPT,
    receiptPatchSha: receipt.patchSha,
    evidencePosture: evidence.posture.toString(),
    descriptorArtifactKind: evidence.descriptor.artifactKind,
  });
}

/** Projects delivery observations into generated-family delivery facts. */
function projectDeliveryObservations(
  observations: readonly DeliveryObservation[],
): readonly Readonly<ContinuumDeliveryObservationFact>[] {
  const projected: Readonly<ContinuumDeliveryObservationFact>[] = [];
  for (const observation of observations) {
    const fact: ContinuumDeliveryObservationFact = observation.reason !== undefined
      ? {
          emissionId: observation.emissionId,
          sinkId: observation.sinkId,
          outcome: observation.outcome,
          timestamp: observation.timestamp,
          reason: observation.reason,
          lens: freezeLens(observation),
        }
      : {
          emissionId: observation.emissionId,
          sinkId: observation.sinkId,
          outcome: observation.outcome,
          timestamp: observation.timestamp,
          lens: freezeLens(observation),
        };
    projected.push(Object.freeze(fact));
  }
  return Object.freeze(projected);
}

/** Freezes the delivery lens as generated-family data. */
function freezeLens(observation: DeliveryObservation): ContinuumDeliveryObservationFact['lens'] {
  return Object.freeze({
    mode: observation.lens.mode,
    suppressExternal: observation.lens.suppressExternal,
  });
}
