/**
 * conflictTargetIdentity — target identity building for conflict analysis.
 *
 * Determines WHAT a conflict is about: builds target identities, effect
 * payloads, and digests from canonical ops and receipt metadata.
 *
 * @module domain/services/strand/conflictTargetIdentity
 */

import { OP_STRATEGIES } from '../JoinReducer.ts';
import { decodeEdgeKey } from '../KeyCodec.ts';
import ConflictTarget from '../../types/conflict/ConflictTarget.ts';
import type { HashablePayload } from '../../types/conflict/HashablePayload.ts';
import { compareStrings } from '../../types/conflict/validation.ts';

// ── Shared helpers ──────────────────────────────────────────────────

/**
 * Resolves a canonical op type to its TickReceipt-compatible name.
 */
export function receiptNameForOp(opType: string): string | undefined {
  const strategy = OP_STRATEGIES.get(opType);
  return strategy !== undefined ? strategy.receiptName : undefined;
}

/**
 * Shallow-clones a raw object.
 */
export function cloneObject(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw };
}

/**
 * Composite key from target digest and effect digest.
 */
export function effectKey(target: ConflictTarget, effectDigest: string): string {
  return `${target.targetDigest}:${effectDigest}`;
}

/**
 * Wraps a normalized effect payload with target and op-type metadata for hashing.
 */
export function buildEffectPayload(
  target: ConflictTarget,
  opType: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return { targetKind: target.targetKind, targetDigest: target.targetDigest, opType, payload };
}

/**
 * Deduplicates and sorts classification note codes.
 */
export function normalizeNoteCodes(noteCodes: string[]): string[] {
  return [...new Set(noteCodes)].sort(compareStrings);
}

// ── Effect normalization ────────────────────────────────────────────

/**
 * Normalizes observed dots into a sorted array of strings.
 */
export function normalizeObservedDots(observedDots: unknown): string[] {
  if (observedDots === null || observedDots === undefined) {
    return [];
  }
  return [...(observedDots as Iterable<string>)].sort(compareStrings);
}

/**
 * Extracts the normalized effect payload for a given op type.
 */
export function normalizeEffectPayload(
  _target: ConflictTarget,
  opType: string,
  canonOp: Record<string, unknown>,
): Record<string, unknown> | null {
  const effectFactories: Record<string, () => Record<string, unknown>> = {
    NodeAdd: () => ({ dot: canonOp['dot'] ?? null }),
    NodeTombstone: () => ({ observedDots: normalizeObservedDots(canonOp['observedDots']) }),
    EdgeAdd: () => ({ dot: canonOp['dot'] ?? null }),
    EdgeTombstone: () => ({ observedDots: normalizeObservedDots(canonOp['observedDots']) }),
    PropSet: () => ({ value: canonOp['value'] ?? null }),
    NodePropSet: () => ({ value: canonOp['value'] ?? null }),
    EdgePropSet: () => ({ value: canonOp['value'] ?? null }),
    BlobValue: () => ({ oid: canonOp['oid'] ?? null }),
  };
  const factory = effectFactories[opType];
  return factory !== undefined ? factory() : null;
}

// ── Target identity ─────────────────────────────────────────────────

interface NodeTargetIdentity {
  targetKind: 'node';
  entityId: string;
}

interface EdgeTargetIdentity {
  targetKind: 'edge';
  from: string;
  to: string;
  label: string;
  edgeKey: string;
}

interface NodePropertyTargetIdentity {
  targetKind: 'node_property';
  entityId: string;
  propertyKey: string;
}

interface EdgePropertyTargetIdentity {
  targetKind: 'edge_property';
  from: string;
  to: string;
  label: string;
  edgeKey: string;
  propertyKey: string;
}

type TargetIdentity =
  | NodeTargetIdentity
  | EdgeTargetIdentity
  | NodePropertyTargetIdentity
  | EdgePropertyTargetIdentity;

/**
 * Builds a node-level target identity.
 */
export function buildNodeTargetIdentity(
  canonOp: Record<string, unknown>,
  receiptTarget: string,
): NodeTargetIdentity | null {
  const nodeVal = canonOp['node'];
  const entityId =
    typeof nodeVal === 'string' && nodeVal.length > 0
      ? nodeVal
      : receiptTarget !== '*'
        ? receiptTarget
        : null;
  return entityId !== null ? { targetKind: 'node', entityId } : null;
}

/**
 * Builds an edge target from canonical op fields.
 */
export function buildEdgeTargetFromOp(canonOp: Record<string, unknown>): EdgeTargetIdentity | null {
  const fromVal = canonOp['from'];
  const toVal = canonOp['to'];
  const labelVal = canonOp['label'];
  if (typeof fromVal === 'string' && typeof toVal === 'string' && typeof labelVal === 'string') {
    return {
      targetKind: 'edge',
      from: fromVal,
      to: toVal,
      label: labelVal,
      edgeKey: `${fromVal}\0${toVal}\0${labelVal}`,
    };
  }
  return null;
}

/**
 * Builds an edge target by decoding the receipt target string.
 */
export function buildEdgeTargetFromReceipt(receiptTarget: string): EdgeTargetIdentity | null {
  if (receiptTarget === '*') {
    return null;
  }
  const decoded = decodeEdgeKey(receiptTarget) as { from: string; to: string; label: string };
  if (!decoded.from || !decoded.to || !decoded.label) {
    return null;
  }
  return {
    targetKind: 'edge',
    from: decoded.from,
    to: decoded.to,
    label: decoded.label,
    edgeKey: receiptTarget,
  };
}

/**
 * Builds an edge-level target identity.
 */
export function buildEdgeTargetIdentity(
  canonOp: Record<string, unknown>,
  receiptTarget: string,
): EdgeTargetIdentity | null {
  return buildEdgeTargetFromOp(canonOp) ?? buildEdgeTargetFromReceipt(receiptTarget);
}

/**
 * Builds a node-property target identity.
 */
export function buildNodePropertyTargetIdentity(
  canonOp: Record<string, unknown>,
): NodePropertyTargetIdentity | null {
  const nodeVal = canonOp['node'];
  const keyVal = canonOp['key'];
  if (typeof nodeVal !== 'string' || typeof keyVal !== 'string') {
    return null;
  }
  return { targetKind: 'node_property', entityId: nodeVal, propertyKey: keyVal };
}

/**
 * Builds an edge-property target identity.
 */
export function buildEdgePropertyTargetIdentity(
  canonOp: Record<string, unknown>,
): EdgePropertyTargetIdentity | null {
  const fromVal = canonOp['from'];
  const toVal = canonOp['to'];
  const labelVal = canonOp['label'];
  const keyVal = canonOp['key'];
  if (
    typeof fromVal !== 'string' ||
    typeof toVal !== 'string' ||
    typeof labelVal !== 'string' ||
    typeof keyVal !== 'string'
  ) {
    return null;
  }
  return {
    targetKind: 'edge_property',
    from: fromVal,
    to: toVal,
    label: labelVal,
    edgeKey: `${fromVal}\0${toVal}\0${labelVal}`,
    propertyKey: keyVal,
  };
}

/**
 * Dispatches to the appropriate target identity builder.
 */
export function buildTargetIdentity(
  canonOp: Record<string, unknown>,
  receiptTarget: string,
): TargetIdentity | null {
  const opType = canonOp['type'] as string;
  const targetBuilders: Record<string, () => TargetIdentity | null> = {
    NodeAdd: () => buildNodeTargetIdentity(canonOp, receiptTarget),
    NodeRemove: () => buildNodeTargetIdentity(canonOp, receiptTarget),
    EdgeAdd: () => buildEdgeTargetIdentity(canonOp, receiptTarget),
    EdgeRemove: () => buildEdgeTargetIdentity(canonOp, receiptTarget),
    PropSet: () => buildNodePropertyTargetIdentity(canonOp),
    NodePropSet: () => buildNodePropertyTargetIdentity(canonOp),
    EdgePropSet: () => buildEdgePropertyTargetIdentity(canonOp),
  };
  const builder = targetBuilders[opType];
  return builder !== undefined ? builder() : null;
}

// ── Record building ─────────────────────────────────────────────────

interface HashingService {
  _hash(payload: HashablePayload): Promise<string>;
}

/**
 * Builds a ConflictTarget by computing a target identity and hashing it.
 */
export async function buildConflictTarget(
  service: HashingService,
  { canonOp, receiptTarget }: { canonOp: Record<string, unknown>; receiptTarget: string },
): Promise<ConflictTarget | null> {
  const targetIdentity = buildTargetIdentity(canonOp, receiptTarget);
  if (targetIdentity === null || targetIdentity === undefined) {
    return null;
  }
  return new ConflictTarget({
    ...targetIdentity,
    targetDigest: await service._hash(targetIdentity),
  });
}

/**
 * Computes the effect digest by normalizing the effect payload and hashing it.
 */
export async function buildEffectDigest(
  service: HashingService,
  {
    target,
    receiptOpType,
    canonOp,
  }: { target: ConflictTarget; receiptOpType: string; canonOp: Record<string, unknown> },
): Promise<string | null> {
  const effectPayload = normalizeEffectPayload(target, receiptOpType, canonOp);
  if (effectPayload === null || effectPayload === undefined) {
    return null;
  }
  return await service._hash(buildEffectPayload(target, receiptOpType, effectPayload));
}
