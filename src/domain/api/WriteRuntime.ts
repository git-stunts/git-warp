import { isContentIntentDescriptor, type default as Intent } from './Intent.ts';
import type { default as WarpWorldline, WarpWorldlinePatchBuild } from '../WarpWorldline.ts';
import WarpError from '../errors/WarpError.ts';
import ConeObstructedError from '../errors/ConeObstructedError.ts';
import PatchEntry from '../artifacts/PatchEntry.ts';
import type ConeLaneBasis from '../services/cone/ConeLaneBasis.ts';
import ConeWriteTargets, { type ConeWriteEdgeTarget } from '../services/cone/ConeWriteTargets.ts';
import { coneObstructionFailure } from './ConeObstructionFailure.ts';
import WriterError from '../errors/WriterError.ts';
import PatchError from '../errors/PatchError.ts';
import MessageCodecError from '../errors/MessageCodecError.ts';
import CrdtError from '../errors/CrdtError.ts';
import SyncError from '../errors/SyncError.ts';
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
import IntentSequence, { type WriteIntentInput } from './IntentSequence.ts';
import { applyIntentSequenceToPatch } from './IntentSequenceRuntime.ts';
import {
  inspectPublishedIntentSequence,
  type PublishedEntityCoordinate,
} from './PublishedIntentSequence.ts';
import type { RepairHint } from './ReceiptSupport.ts';
import WriteReceipt from './WriteReceipt.ts';
import type { PatchCommitResult } from '../types/PatchCommitResult.ts';
import type AdmissionEvaluation from '../admission/AdmissionEvaluation.ts';
import type EntityOccurrence from './EntityOccurrence.ts';
import { createEntityOccurrence } from './EntityOccurrenceRuntime.ts';
import { EventId } from '../utils/EventId.ts';
import {
  createDerivedWriteAdmission,
  createObstructedWriteAdmission,
  prepareWriteAdmission,
  type WriteObstruction,
} from './WriteAdmissionRuntime.ts';

type IntentCommit = (build: WarpWorldlinePatchBuild) => Promise<PatchCommitResult>;

type IntentWriteRequestFields = {
  readonly runtime: WarpWorldline;
  readonly context: ApiRuntimeContext;
  readonly intent: WriteIntentInput;
  readonly commit: IntentCommit;
  /** The cone basis of the Lane the write publishes to: its read-before-write and its fold (#1039). */
  readonly cone: ConeLaneBasis;
};

type IntentWriteFields = Omit<IntentWriteRequestFields, 'intent'> & {
  readonly sequence: IntentSequence;
};

type PublishedWriteFields = Omit<IntentWriteFields, 'commit' | 'cone'> & {
  readonly publication: PatchCommitResult;
  readonly recoveryEvidence: Evidence;
};

type OperationalWriteFailure = WriteObstruction & {
  readonly repairHints: readonly RepairHint[];
};

type WriteAttempt = {
  basis?: PatchBuilderCausalBasis;
  evaluation?: AdmissionEvaluation;
  publishedEntities?: readonly PublishedEntityCoordinate[];
};

type PreparedWriteAttempt = Readonly<{
  readonly basis: PatchBuilderCausalBasis;
  readonly evaluation: AdmissionEvaluation;
}>;

type PublishedWriteAttempt = PreparedWriteAttempt & Readonly<{
  readonly publishedEntities: readonly PublishedEntityCoordinate[];
}>;

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
    message: 'Retry with a supported bounded write basis; requests exceeding its profile are refused.',
  }),
]);
export async function executeIntentWrite(
  request: IntentWriteRequestFields,
): Promise<WriteReceipt<WriteIntentInput>> {
  const fields = normalizeIntentWrite(request);
  const { runtime, context, sequence } = fields;
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
  const prepared = requirePublishedWriteAttempt(attempt, missingPublishedBasisError());
  return await derivedWriteReceipt({
    runtime,
    context,
    sequence,
    publication,
    recoveryEvidence,
    ...prepared,
  });
}

function normalizeIntentWrite(request: IntentWriteRequestFields): IntentWriteFields {
  return Object.freeze({
    runtime: request.runtime,
    context: request.context,
    commit: request.commit,
    cone: request.cone,
    sequence: IntentSequence.from(request.intent),
  });
}

async function publishIntentWrite(
  fields: IntentWriteFields,
  attempt: WriteAttempt
): Promise<PatchCommitResult> {
  const { cone } = fields;
  const publication = await fields.commit(async (patch) => {
    try {
      await patch.prepareConeWriteBasis(coneWriteTargets(fields.sequence), cone);
    } finally {
      attempt.basis = readPatchBuilderCausalBasis(patch);
      attempt.evaluation = await prepareWriteAdmission({ ...fields, basis: attempt.basis });
    }
    applyIntentSequenceToPatch(fields.sequence, patch, fields.context.content);
    attempt.publishedEntities = inspectPublishedIntentSequence(fields.sequence, patch.build());
  });
  await foldPublishedWrite(cone, publication, attempt.basis?.expectedParentSha ?? null);
  return publication;
}

/**
 * Commits one already-admitted sequence onto a Lane through its cone basis
 * (#1039): the sequence's targets are observed from cone records before it
 * lowers, and the published patch is folded. Settlement uses this to
 * replay a strand's sequences onto its target.
 */
export async function commitSequenceOnCone(fields: {
  readonly commit: IntentCommit;
  readonly cone: ConeLaneBasis;
  readonly sequence: IntentSequence;
}): Promise<string> {
  let parentSha: string | null = null;
  const publication = await fields.commit(async (patch) => {
    await patch.prepareConeWriteBasis(coneWriteTargets(fields.sequence), fields.cone);
    parentSha = readPatchBuilderCausalBasis(patch).expectedParentSha;
    applyIntentSequenceToPatch(fields.sequence, patch);
  });
  await foldPublishedWrite(fields.cone, publication, parentSha);
  return publication.sha;
}

/**
 * Folds the write this clone just published into the lane's cone basis, so
 * the next read or write costs only what it touches (#1039). The patch is
 * already durable and the basis is derived, so a fold that cannot finish
 * here is left to the next advance, which folds it from the writer chain.
 */
async function foldPublishedWrite(
  cone: ConeLaneBasis,
  publication: PatchCommitResult,
  parentSha: string | null,
): Promise<void> {
  try {
    await cone.foldCommitted(new PatchEntry({ patch: publication.patch, sha: publication.sha }), parentSha);
  } catch {
    // The basis is derived: the next advance folds this patch from the writer chain.
  }
}

async function obstructedWriteReceipt(
  fields: FailedWriteFields,
): Promise<WriteReceipt<WriteIntentInput>> {
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

async function createObstructionReceipt(
  fields: ObstructionReceiptFields,
): Promise<WriteReceipt<WriteIntentInput>> {
  const { write, prepared, recoveryEvidence, obstruction } = fields;
  const { runtime, context, sequence } = write;
  return new WriteReceipt({
    lane: runtime.worldlineName,
    writer: runtime.writerId,
    intent: sequence.input,
    outcome: projectAdmissionOutcome(
      await createObstructedWriteAdmission({
        runtime,
        context,
        sequence,
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

function requirePublishedWriteAttempt(
  attempt: WriteAttempt,
  error: WarpError,
): PublishedWriteAttempt {
  const prepared = requirePreparedWriteAttempt(attempt, error);
  if (attempt.publishedEntities === undefined) {
    throw error;
  }
  return { ...prepared, publishedEntities: attempt.publishedEntities };
}

function missingPublishedBasisError(): WarpError {
  return new WarpError('Published write is missing its admission basis', 'E_WRITE_ADMISSION_BASIS');
}

async function derivedWriteReceipt(
  fields: PublishedWriteFields & PublishedWriteAttempt,
): Promise<WriteReceipt<WriteIntentInput>> {
  const { runtime, context, sequence, publication } = fields;
  const evidence = await committedWriteEvidence(fields);
  const occurrences = publishedEntityOccurrences(fields, evidence);
  const receipt = new WriteReceipt({
    lane: runtime.worldlineName,
    writer: runtime.writerId,
    intent: sequence.input,
    outcome: projectAdmissionOutcome(createDerivedWriteAdmission(fields), evidence.basis),
    evidence,
    ...(occurrences.length === 0 ? {} : { occurrences }),
  });
  context.bindReceipt(receipt, { operation: 'write', patchSha: publication.sha });
  return receipt;
}

function publishedEntityOccurrences(
  fields: PublishedWriteFields & PublishedWriteAttempt,
  evidence: Evidence,
): readonly EntityOccurrence[] {
  const { patch, sha } = fields.publication;
  return Object.freeze(
    fields.publishedEntities.map((coordinate) =>
      createEntityOccurrence({
        context: patch.context,
        dot: coordinate.dot,
        evidence,
        eventId: new EventId(patch.lamport, patch.writer, sha, coordinate.opIndex),
        intent: coordinate.intent,
        receiptWriter: fields.runtime.writerId,
        subject: coordinate.subject,
        worldline: fields.runtime.worldlineName,
      }),
    ),
  );
}

async function committedWriteEvidence(fields: PublishedWriteFields): Promise<Evidence> {
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
  return error instanceof ConeObstructedError ? coneWriteFailure(error) : lawfulWriteFailure(error);
}

function lawfulWriteFailure(error: WarpError): OperationalWriteFailure | null {
  if (error.code === 'E_PATCH_NO_STATE' || invalidObservationMetadata(error)) {
    return missingWriteBasisFailure();
  }
  if (error.code === 'E_PATCH_DELETE_WITH_DATA') {
    return attachedDataFailure();
  }
  if (isMissingOwner(error)) {
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

function coneWriteFailure(error: ConeObstructedError): OperationalWriteFailure {
  const failure = coneObstructionFailure(error.obstruction);
  return {
    reason: AdmissionObstructionReason.unsupportedEvidence(`git-warp.write.${failure.reason}`),
    retry: AdmissionRetryDisposition.afterChange(),
    condition: 'cone-basis-obstructed',
    requiredEvidence: 'bounded-write-basis',
    repairHints: failure.repairHints,
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

/** The entities a write must observe before lowering, read from cone records (#1039). */
function coneWriteTargets(sequence: IntentSequence): ConeWriteTargets {
  const targets = sequence.intents.map(coneWriteTarget);
  return new ConeWriteTargets({
    nodes: targets.flatMap((target) => (typeof target === 'string' ? [target] : [])),
    edges: targets.flatMap((target) => (target === null || typeof target === 'string' ? [] : [target])),
  });
}

/** The node or edge one intent must observe, or null for a blind intent. */
function coneWriteTarget({ descriptor }: Intent): string | ConeWriteEdgeTarget | null {
  if (descriptor.kind === 'node.remove') { return descriptor.subject; }
  if (descriptor.kind === 'edge.remove') { return descriptor; }
  if (!isContentIntentDescriptor(descriptor)) { return null; }
  return 'subject' in descriptor ? descriptor.subject : descriptor;
}

function isMissingOwner(error: WarpError): boolean {
  return error.code === 'E_PATCH_ENTITY_NOT_FOUND' || error.code === 'E_PATCH_CONTENT_UNKNOWN_NODE'
    || error.code === 'E_PATCH_EDGE_PROP_UNKNOWN_EDGE';
}

const INVALID_PATCH_METADATA_CODES: ReadonlySet<string> = new Set([
  'E_PATCH_MALFORMED', 'E_PATCH_SCHEMA', 'E_PATCH_WRITER', 'E_PATCH_LAMPORT',
  'E_PATCH_OPS', 'E_PATCH_METADATA_ENTRY', 'E_PATCH_METADATA_TYPE',
]);

function invalidObservationMetadata(error: WarpError): boolean {
  if (error instanceof MessageCodecError || error instanceof CrdtError) { return true; }
  if (error instanceof SyncError) { return error.code === 'E_SYNC_PATCH_HISTORY'; }
  return error instanceof PatchError && INVALID_PATCH_METADATA_CODES.has(error.code);
}
