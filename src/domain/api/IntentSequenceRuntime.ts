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
): void {
  for (const intent of sequence.intents) {
    applyIntentToPatch(intent, patch);
  }
  if (sequence.atomic) {
    requireAtomicOperationLimit(patch);
  }
}

/** Recovers one retained write while preserving its one-patch atomic boundary. */
export function intentSequenceFromPatch(patch: Patch): IntentSequence {
  if (patch.entityAdmissions !== undefined) {
    return markedIntentSequence(patch);
  }
  try {
    return IntentSequence.from(retainLegacyOrigin(intentFromPatch(patch)));
  } catch (error) {
    if (!(error instanceof WarpError) || !isMultiOperationHydrationFailure(error, patch)) {
      throw error;
    }
  }
  return IntentSequence.from(primitiveIntentArray(patch));
}

function markedIntentSequence(patch: Patch): IntentSequence {
  const intents = markedIntentArray(patch);
  const first = intents[0];
  if (first === undefined) {
    throw emptyPatchError();
  }
  return intents.length === 1
    ? IntentSequence.from(first)
    : IntentSequence.from(Object.freeze([first, ...intents.slice(1)]));
}

function markedIntentArray(patch: Patch): readonly ReturnType<typeof intentFromOperation>[] {
  const boundaries = new Map(
    patch.entityAdmissions?.map((boundary) => [boundary.operationIndex, boundary]),
  );
  const intents: ReturnType<typeof intentFromOperation>[] = [];
  let operationIndex = 0;
  while (operationIndex < patch.ops.length) {
    const boundary = boundaries.get(operationIndex);
    if (boundary === undefined) {
      intents.push(intentFromOperation(patch.ops[operationIndex]!));
      operationIndex += 1;
      continue;
    }
    intents.push(intentFromEntityAdmissionBoundary(patch, boundary).intent);
    operationIndex += boundary.operationCount;
  }
  return Object.freeze(intents);
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

function isMultiOperationHydrationFailure(error: WarpError, patch: Patch): boolean {
  return (
    error instanceof WarpError &&
    error.code === 'E_DRAFT_INTENT_HYDRATION' &&
    patch.ops.length > 1
  );
}

function primitiveIntentArray(patch: Patch): AtomicIntentArray {
  const [firstOperation, ...remainingOperations] = patch.ops;
  if (firstOperation === undefined) {
    throw emptyPatchError();
  }
  const first = intentFromOperation(firstOperation);
  const remaining = remainingOperations.map(intentFromOperation);
  return Object.freeze([first, ...remaining]);
}

function emptyPatchError(): WarpError {
  return new WarpError(
    'Persisted atomic intent patch has no operations',
    'E_DRAFT_INTENT_HYDRATION',
  );
}
