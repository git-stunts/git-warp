import type { default as WarpWorldline, WarpWorldlinePatchBuild } from '../WarpWorldline.ts';
import WarpError from '../errors/WarpError.ts';
import WriterError from '../errors/WriterError.ts';
import AdmissionObstructionReason from '../admission/AdmissionObstructionReason.ts';
import AdmissionRetryDisposition from '../admission/AdmissionRetryDisposition.ts';
import {
  readPatchBuilderCausalBasis,
  type PatchBuilderCausalBasis,
} from '../services/admission/PatchBuilderCausalBasis.ts';
import type { ApiRuntimeContext } from './ApiRuntimeContext.ts';
import { projectAdmissionOutcome } from './AdmissionOutcomeRuntime.ts';
import type Evidence from './Evidence.ts';
import { createWriteEvidence, createWriteRecoveryEvidence } from './EvidenceRuntime.ts';
import type Intent from './Intent.ts';
import { applyIntentToPatch } from './IntentRuntime.ts';
import type { RepairHint } from './ReceiptSupport.ts';
import WriteReceipt from './WriteReceipt.ts';
import type { PatchCommitResult } from '../types/PatchCommitResult.ts';
import type AdmissionEvaluation from '../admission/AdmissionEvaluation.ts';
import {
  createDerivedWriteAdmission,
  createObstructedWriteAdmission,
  prepareWriteAdmission,
  type WriteObstruction,
} from './WriteAdmissionRuntime.ts';

type IntentCommit = (build: WarpWorldlinePatchBuild) => Promise<PatchCommitResult>;

type IntentWriteFields = {
  readonly runtime: WarpWorldline;
  readonly context: ApiRuntimeContext;
  readonly intent: Intent;
  readonly commit: IntentCommit;
};

type AcceptedWriteFields = Omit<IntentWriteFields, 'commit'> & {
  readonly publication: PatchCommitResult;
  readonly recoveryEvidence: Evidence;
};

type OperationalWriteFailure = WriteObstruction & {
  readonly repairHints: readonly RepairHint[];
};

type WriteAttempt = {
  basis?: PatchBuilderCausalBasis;
  evaluation?: AdmissionEvaluation;
};

type PreparedWriteAttempt = Required<WriteAttempt>;

type FailedWriteFields = {
  readonly write: IntentWriteFields;
  readonly attempt: WriteAttempt;
  readonly recoveryEvidence: Evidence;
  readonly error: WarpError;
};

type ObstructionReceiptFields = Omit<FailedWriteFields, 'attempt' | 'error'> & {
  readonly prepared: PreparedWriteAttempt;
  readonly obstruction: OperationalWriteFailure;
};

const MATERIALIZE_HINT = Object.freeze([
  Object.freeze({
    code: 'materialize_write_basis',
    message: 'Materialize the timeline before retrying this state-dependent intent.',
  }),
]);
export async function executeIntentWrite(fields: IntentWriteFields): Promise<WriteReceipt> {
  const { runtime, context, intent } = fields;
  const recoveryEvidence = await createWriteRecoveryEvidence(runtime, context);
  const attempt: WriteAttempt = {};
  let publication: PatchCommitResult;
  try {
    publication = await publishIntentWrite(fields, attempt);
  } catch (error) {
    if (!(error instanceof WarpError)) {
      throw error;
    }
    return await obstructedWriteReceipt({ write: fields, attempt, recoveryEvidence, error });
  }
  const prepared = requirePreparedWriteAttempt(attempt, missingPublishedBasisError());
  return await derivedWriteReceipt({
    runtime,
    context,
    intent,
    publication,
    recoveryEvidence,
    ...prepared,
  });
}

async function publishIntentWrite(
  fields: IntentWriteFields,
  attempt: WriteAttempt
): Promise<PatchCommitResult> {
  return await fields.commit(async (patch) => {
    attempt.basis = readPatchBuilderCausalBasis(patch);
    attempt.evaluation = await prepareWriteAdmission({ ...fields, basis: attempt.basis });
    applyIntentToPatch(fields.intent, patch);
  });
}

async function obstructedWriteReceipt(fields: FailedWriteFields): Promise<WriteReceipt> {
  const { write, attempt, recoveryEvidence, error } = fields;
  const failure = operationalWriteFailure(error);
  if (failure === null) {
    throw error;
  }
  const prepared = requirePreparedWriteAttempt(attempt, error);
  const receipt = await createObstructionReceipt({
    write,
    prepared,
    recoveryEvidence,
    obstruction: failure,
  });
  write.context.bindReceipt(receipt, { operation: 'write', patchSha: undefined });
  return receipt;
}

async function createObstructionReceipt(fields: ObstructionReceiptFields): Promise<WriteReceipt> {
  const { write, prepared, recoveryEvidence, obstruction } = fields;
  const { runtime, context, intent } = write;
  return new WriteReceipt({
    timeline: runtime.worldlineName,
    writer: runtime.writerId,
    intent,
    outcome: projectAdmissionOutcome(
      await createObstructedWriteAdmission({
        runtime,
        context,
        intent,
        recoveryEvidence,
        obstruction,
        ...prepared,
      }),
      recoveryEvidence.basis
    ),
    evidence: recoveryEvidence,
    repairHints: obstruction.repairHints,
  });
}

function requirePreparedWriteAttempt(
  attempt: WriteAttempt,
  error: WarpError
): PreparedWriteAttempt {
  if (attempt.basis === undefined) {
    throw error;
  }
  if (attempt.evaluation === undefined) {
    throw error;
  }
  return { basis: attempt.basis, evaluation: attempt.evaluation };
}

function missingPublishedBasisError(): WarpError {
  return new WarpError('Published write is missing its admission basis', 'E_WRITE_ADMISSION_BASIS');
}

async function derivedWriteReceipt(
  fields: AcceptedWriteFields & {
    readonly basis: PatchBuilderCausalBasis;
    readonly evaluation: AdmissionEvaluation;
  }
): Promise<WriteReceipt> {
  const { runtime, context, intent, publication } = fields;
  const evidence = await committedWriteEvidence(fields);
  const receipt = new WriteReceipt({
    timeline: runtime.worldlineName,
    writer: runtime.writerId,
    intent,
    outcome: projectAdmissionOutcome(createDerivedWriteAdmission(fields), evidence.basis),
    evidence,
  });
  context.bindReceipt(receipt, { operation: 'write', patchSha: publication.sha });
  return receipt;
}

async function committedWriteEvidence(fields: AcceptedWriteFields): Promise<Evidence> {
  try {
    return await createWriteEvidence({
      runtime: fields.runtime,
      context: fields.context,
      patchSha: fields.publication.sha,
      retentionWitness: fields.publication.retention,
    });
  } catch {
    // The patch is durable; return an honest basis without claiming correlated support.
    return fields.recoveryEvidence;
  }
}

function operationalWriteFailure(error: WarpError): OperationalWriteFailure | null {
  if (error.code === 'E_PATCH_NO_STATE') {
    return missingWriteBasisFailure();
  }
  if (error.code === 'E_PATCH_DELETE_WITH_DATA') {
    return attachedDataFailure();
  }
  if (error.code === 'E_PATCH_ENTITY_NOT_FOUND') {
    return missingEntityFailure();
  }
  return writerCasFailure(error);
}

function missingWriteBasisFailure(): OperationalWriteFailure {
  return {
    reason: AdmissionObstructionReason.unsupportedEvidence('git-warp.write.missing-bounded-basis'),
    retry: AdmissionRetryDisposition.afterChange(),
    condition: 'missing-bounded-write-basis',
    requiredEvidence: 'bounded-write-basis',
    repairHints: MATERIALIZE_HINT,
  };
}

function attachedDataFailure(): OperationalWriteFailure {
  return {
    reason: AdmissionObstructionReason.lawViolation('git-warp.write.delete-with-attached-data'),
    retry: AdmissionRetryDisposition.afterChange(),
    condition: 'delete-target-has-attached-data',
    requiredEvidence: 'detached-write-target',
    repairHints: [],
  };
}

function missingEntityFailure(): OperationalWriteFailure {
  return {
    reason: AdmissionObstructionReason.lawViolation('git-warp.write.entity-not-found'),
    retry: AdmissionRetryDisposition.afterChange(),
    condition: 'write-target-does-not-exist',
    requiredEvidence: 'existing-write-target',
    repairHints: [],
  };
}

function writerCasFailure(error: WarpError): OperationalWriteFailure | null {
  if (!(error instanceof WriterError) || error.code !== 'WRITER_CAS_CONFLICT') {
    return null;
  }
  if (error.actualSha === undefined) {
    return null;
  }
  return {
    reason: AdmissionObstructionReason.staleBasis('git-warp.write.writer-frontier-advanced'),
    retry: AdmissionRetryDisposition.afterChange(),
    condition: 'writer-frontier-advanced',
    requiredEvidence: 'current-writer-basis',
    destinationHeadSha: error.actualSha,
    repairHints: MATERIALIZE_HINT,
  };
}
