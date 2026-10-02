import type ContentStagingAuthority from '../services/ContentStagingAuthority.ts';
import { contentIntentFromOperations, CONTENT_INTENT_OPERATION_COUNT } from './ContentIntentRuntime.ts';
import WarpError from '../errors/WarpError.ts';
import type { PatchBuilder } from '../services/PatchBuilder.ts';
import type Patch from '../types/Patch.ts';
import EntityAdmissionOrigin from '../types/EntityAdmissionOrigin.ts';
import { intentFromEntityAdmissionBoundary } from '../entity/EntityAdmissionBoundaryIntent.ts';
import IntentSequence, { type AtomicIntentArray } from './IntentSequence.ts';
import { applyIntentToPatch, intentFromOperation, intentFromPatch } from './IntentRuntime.ts';
import { bindRetainedEntityIntent } from './RetainedEntityIntentRuntime.ts';

export const MAX_ATOMIC_WRITE_OPERATIONS = 50_000;

/** Lowers one validated sequence through one PatchBuilder publication. */
export function applyIntentSequenceToPatch(
  sequence: IntentSequence,
  patch: PatchBuilder,
  authority?: ContentStagingAuthority,
): void {
  for (const intent of sequence.intents) {
    applyIntentToPatch(intent, patch, authority);
  }
  if (sequence.atomic) {
    requireAtomicOperationLimit(patch);
  }
}

/** Recovers one retained write while preserving its one-patch atomic boundary. */
export function intentSequenceFromPatch(patch: Patch): IntentSequence {
  const singular = singularIntentSequenceFromPatch(patch);
  if (singular !== null) {
    return singular;
  }
  return IntentSequence.from(retainedIntentArray(patch));
}

function singularIntentSequenceFromPatch(patch: Patch): IntentSequence | null {
  try {
    const retained = intentFromPatch(patch);
    return IntentSequence.from(patch.entityAdmissions === undefined
      ? retainLegacyOrigin(retained)
      : retained);
  } catch (error) {
    if (!(error instanceof WarpError) || !isAtomicHydrationFailure(error, patch)) {
      throw error;
    }
  }
  return null;
}

function retainedIntentArray(patch: Patch): AtomicIntentArray {
  const boundaries = new Map(
    patch.entityAdmissions?.map((boundary) => [boundary.operationIndex, boundary]),
  );
  const intents: ReturnType<typeof intentFromOperation>[] = [];
  let operationIndex = 0;
  while (operationIndex < patch.ops.length) {
    const boundary = boundaries.get(operationIndex);
    if (boundary === undefined) {
      const recovered = retainedPrimitive(patch, operationIndex);
      intents.push(recovered.intent);
      operationIndex += recovered.count;
      continue;
    }
    intents.push(intentFromEntityAdmissionBoundary(patch, boundary).intent);
    operationIndex += boundary.operationCount;
  }
  const [first, ...remaining] = intents;
  if (first === undefined) {
    throw emptyPatchError();
  }
  return Object.freeze([first, ...remaining]);
}

function retainLegacyOrigin(
  intent: ReturnType<typeof intentFromPatch>,
): ReturnType<typeof intentFromPatch> {
  return intent.kind === 'entity.add'
    ? bindRetainedEntityIntent(intent, EntityAdmissionOrigin.legacyUnrecorded())
    : intent;
}

function requireAtomicOperationLimit(patch: PatchBuilder): void {
  const operationCount = patch.build().ops.length;
  if (operationCount > MAX_ATOMIC_WRITE_OPERATIONS) {
    throw new WarpError(
      `Atomic intent array lowers to more than ${String(MAX_ATOMIC_WRITE_OPERATIONS)} operations`,
      'E_INTENT_SEQUENCE_OPERATIONS',
    );
  }
}

function isAtomicHydrationFailure(error: WarpError, patch: Patch): boolean {
  return error.code === 'E_DRAFT_INTENT_HYDRATION'
    && patch.ops.length !== 1;
}

function emptyPatchError(): WarpError {
  return new WarpError(
    'Persisted atomic intent patch has no operations',
    'E_DRAFT_INTENT_HYDRATION',
  );
}

function retainedPrimitive(patch: Patch, index: number): Readonly<{ intent: ReturnType<typeof intentFromOperation>; count: number }> {
  const content = contentIntentFromOperations(patch.ops, index);
  return content === null
    ? { intent: intentFromOperation(patch.ops[index]!), count: 1 }
    : { intent: content, count: CONTENT_INTENT_OPERATION_COUNT };
}
