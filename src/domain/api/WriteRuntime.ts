import type { default as WarpWorldline, WarpWorldlinePatchBuild } from '../WarpWorldline.ts';
import WarpError from '../errors/WarpError.ts';
import type { ApiRuntimeContext } from './ApiRuntimeContext.ts';
import { createWriteEvidence } from './EvidenceRuntime.ts';
import type Intent from './Intent.ts';
import { applyIntentToPatch } from './IntentRuntime.ts';
import type { WriteOutcome } from './ReceiptOutcome.ts';
import type { RepairHint } from './ReceiptSupport.ts';
import WriteReceipt from './WriteReceipt.ts';

type IntentCommit = (build: WarpWorldlinePatchBuild) => Promise<string>;

type IntentWriteFields = {
  readonly runtime: WarpWorldline;
  readonly context: ApiRuntimeContext;
  readonly intent: Intent;
  readonly commit: IntentCommit;
};

type AcceptedWriteFields = Omit<IntentWriteFields, 'commit'> & {
  readonly patchSha: string;
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
  try {
    const patchSha = await commit((patch) => {
      applyIntentToPatch(intent, patch);
    });
    return await acceptedWriteReceipt({ runtime, context, intent, patchSha });
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
}

async function acceptedWriteReceipt(fields: AcceptedWriteFields): Promise<WriteReceipt> {
  const { runtime, context, intent, patchSha } = fields;
  const receipt = new WriteReceipt({
    timeline: runtime.worldlineName,
    writer: runtime.writerId,
    intent,
    outcome: 'accepted',
    evidence: await createWriteEvidence(runtime, context, patchSha),
  });
  context.bindReceipt(receipt, { operation: 'write', patchSha });
  return receipt;
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
