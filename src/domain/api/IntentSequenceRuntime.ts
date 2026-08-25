import WarpError from '../errors/WarpError.ts';
import type { PatchBuilder } from '../services/PatchBuilder.ts';
import type Patch from '../types/Patch.ts';
import IntentSequence, { type AtomicIntentArray } from './IntentSequence.ts';
import { applyIntentToPatch, intentFromOperation, intentFromPatch } from './IntentRuntime.ts';

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
  try {
    return IntentSequence.from(intentFromPatch(patch));
  } catch (error) {
    if (!(error instanceof WarpError) || !isMultiOperationHydrationFailure(error, patch)) {
      throw error;
    }
  }
  return IntentSequence.from(primitiveIntentArray(patch));
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
    throw new WarpError(
      'Persisted atomic intent patch has no operations',
      'E_DRAFT_INTENT_HYDRATION',
    );
  }
  const first = intentFromOperation(firstOperation);
  const remaining = remainingOperations.map(intentFromOperation);
  return Object.freeze([first, ...remaining]);
}
