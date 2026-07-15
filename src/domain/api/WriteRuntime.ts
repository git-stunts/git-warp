import type { default as WarpWorldline, WarpWorldlinePatchBuild } from '../WarpWorldline.ts';
import WarpError from '../errors/WarpError.ts';
import type { ApiRuntimeContext } from './ApiRuntimeContext.ts';
import type Evidence from './Evidence.ts';
import { createWriteEvidence, createWriteRecoveryEvidence } from './EvidenceRuntime.ts';
import type Intent from './Intent.ts';
import { applyIntentToPatch } from './IntentRuntime.ts';
import type { WriteOutcome } from './ReceiptOutcome.ts';
import type { RepairHint } from './ReceiptSupport.ts';
import WriteReceipt from './WriteReceipt.ts';
import type { PatchCommitResult } from '../types/PatchCommitResult.ts';

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

type OperationalWriteFailure = {
  readonly outcome: Exclude<WriteOutcome, 'accepted' | 'underdetermined'>;
  readonly reason: string;
  readonly repairHints: readonly RepairHint[];
};

const MATERIALIZE_HINT = Object.freeze([
  Object.freeze({
    code: 'materialize_write_basis',
    message: 'Materialize the timeline before retrying this state-dependent intent.',
  }),
]);
export async function executeIntentWrite(fields: IntentWriteFields): Promise<WriteReceipt> {
  const { runtime, context, intent, commit } = fields;
  const recoveryEvidence = await createWriteRecoveryEvidence(runtime, context);
  let publication: PatchCommitResult;
  try {
    publication = await commit((patch) => {
      applyIntentToPatch(intent, patch);
    });
  } catch (error) {
    if (!(error instanceof WarpError)) {
      throw error;
    }
    const failure = operationalWriteFailure(error);
    if (failure === null) {
      throw error;
    }
    const receipt = new WriteReceipt({
      timeline: runtime.worldlineName,
      writer: runtime.writerId,
      intent,
      ...failure,
    });
    context.bindReceipt(receipt, { operation: 'write', patchSha: undefined });
    return receipt;
  }
  return await acceptedWriteReceipt({ runtime, context, intent, publication, recoveryEvidence });
}

async function acceptedWriteReceipt(fields: AcceptedWriteFields): Promise<WriteReceipt> {
  const { runtime, context, intent, publication } = fields;
  const receipt = new WriteReceipt({
    timeline: runtime.worldlineName,
    writer: runtime.writerId,
    intent,
    outcome: 'accepted',
    evidence: await committedWriteEvidence(fields),
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
    return {
      outcome: 'obstructed',
      reason: 'missing_write_basis',
      repairHints: MATERIALIZE_HINT,
    };
  }
  if (error.code === 'E_PATCH_DELETE_WITH_DATA') {
    return { outcome: 'conflicted', reason: 'attached_data', repairHints: [] };
  }
  if (error.code === 'E_PATCH_ENTITY_NOT_FOUND') {
    return { outcome: 'rejected', reason: 'entity_not_found', repairHints: [] };
  }
  return null;
}
