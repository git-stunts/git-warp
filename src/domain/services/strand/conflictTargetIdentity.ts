/**
 * conflictTargetIdentity — facade for conflict target and effect identity.
 *
 * The runtime-backed concepts live in adjacent files named after the
 * concepts they own. This module keeps the analyzer import surface small.
 *
 * @module domain/services/strand/conflictTargetIdentity
 */

import ConflictTarget from '../../types/conflict/ConflictTarget.ts';
import {
  normalizeConflictOp,
  receiptNameForOp,
  type CanonicalOpBlob,
} from './CanonicalConflictOp.ts';
import ConflictEffectPayload, {
  ConflictEffectEnvelope,
  effectKey,
  normalizeNoteCodes,
  normalizeObservedDots,
} from './ConflictEffectPayload.ts';
import type { ConflictTargetIdentity } from './ConflictTargetIdentityModels.ts';
import ConflictTargetResolver from './ConflictTargetResolver.ts';
import type ConflictPipelineContext from './ConflictPipelineContext.ts';

export {
  effectKey,
  normalizeConflictOp,
  normalizeNoteCodes,
  normalizeObservedDots,
  receiptNameForOp,
};

export type { CanonicalOpBlob, ConflictEffectPayload, ConflictEffectEnvelope };

export function buildEffectPayload(
  target: ConflictTarget,
  opType: string,
  payload: ConflictEffectPayload,
): ConflictEffectEnvelope {
  return new ConflictEffectEnvelope({ target, opType, payload });
}

export function normalizeEffectPayload(
  canonOp: CanonicalOpBlob | null,
  receiptOpType?: string,
): ConflictEffectPayload | null {
  return ConflictEffectPayload.forOp(canonOp, receiptOpType);
}

export function buildTargetIdentity(canonOp: CanonicalOpBlob, receiptTarget: string): ConflictTargetIdentity | null {
  return ConflictTargetResolver.resolve(canonOp, receiptTarget);
}

export async function buildConflictTarget(
  context: ConflictPipelineContext,
  { canonOp, receiptTarget }: { canonOp: CanonicalOpBlob; receiptTarget: string },
): Promise<ConflictTarget | null> {
  const targetIdentity = buildTargetIdentity(canonOp, receiptTarget);
  if (targetIdentity === null) {
    return null;
  }
  return new ConflictTarget({
    ...targetIdentity,
    targetDigest: await context.hash(targetIdentity),
  });
}

export async function buildEffectDigest(
  context: ConflictPipelineContext,
  {
    target,
    receiptOpType,
    canonOp,
  }: { target: ConflictTarget; receiptOpType: string; canonOp: CanonicalOpBlob },
): Promise<string | null> {
  const effectPayload = normalizeEffectPayload(canonOp, receiptOpType);
  if (effectPayload === null) {
    return null;
  }
  return await context.hash(buildEffectPayload(target, receiptOpType, effectPayload));
}
