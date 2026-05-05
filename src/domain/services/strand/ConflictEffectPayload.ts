/**
 * ConflictEffectPayload — runtime-backed effect identity for conflict hashing.
 *
 * @module domain/services/strand/ConflictEffectPayload
 */

import type ConflictTarget from '../../types/conflict/ConflictTarget.ts';
import type { HashablePayload } from '../../types/conflict/HashablePayload.ts';
import { compareStrings } from '../../types/conflict/validation.ts';
import BlobValue from '../../types/ops/BlobValue.ts';
import EdgeAdd from '../../types/ops/EdgeAdd.ts';
import EdgePropSet from '../../types/ops/EdgePropSet.ts';
import EdgeRemove from '../../types/ops/EdgeRemove.ts';
import NodeAdd from '../../types/ops/NodeAdd.ts';
import NodePropSet from '../../types/ops/NodePropSet.ts';
import NodeRemove from '../../types/ops/NodeRemove.ts';
import { receiptNameForOp, type CanonicalOpBlob } from './CanonicalConflictOp.ts';
import ConflictOpAnchor from './ConflictOpAnchor.ts';
import { normalizeHashableEffectValue } from './conflictHashableEffectValue.ts';

type ConflictEffectPayloadFields = {
  readonly dot?: HashablePayload;
  readonly observedDots?: readonly string[];
  readonly value?: HashablePayload;
  readonly oid?: HashablePayload;
};

const ADD_RECEIPT_NAMES: ReadonlySet<string> = new Set(['NodeAdd', 'EdgeAdd']);
const REMOVE_RECEIPT_NAMES: ReadonlySet<string> = new Set(['NodeTombstone', 'EdgeTombstone']);
const PROPERTY_RECEIPT_NAMES: ReadonlySet<string> = new Set(['PropSet', 'NodePropSet', 'EdgePropSet']);

export function normalizeNoteCodes(noteCodes: string[]): string[] {
  return [...new Set(noteCodes)].sort(compareStrings);
}

export function normalizeObservedDots(observedDots: Iterable<string> | null | undefined): string[] {
  if (observedDots === null || observedDots === undefined) {
    return [];
  }
  return [...observedDots].sort(compareStrings);
}

export default class ConflictEffectPayload {
  readonly dot?: HashablePayload;
  readonly observedDots?: readonly string[];
  readonly value?: HashablePayload;
  readonly oid?: HashablePayload;

  constructor(fields: ConflictEffectPayloadFields) {
    if (fields.dot !== undefined) {
      this.dot = fields.dot;
    }
    if (fields.observedDots !== undefined) {
      this.observedDots = Object.freeze([...fields.observedDots]);
    }
    if (fields.value !== undefined) {
      this.value = fields.value;
    }
    if (fields.oid !== undefined) {
      this.oid = fields.oid;
    }
    Object.freeze(this);
  }

  static forOp(canonOp: CanonicalOpBlob | null, receiptOpType?: string): ConflictEffectPayload | null {
    if (canonOp === null) {
      return null;
    }
    return ConflictEffectPayload.forReceipt(canonOp, receiptOpType ?? receiptNameForOp(canonOp));
  }

  private static forReceipt(canonOp: CanonicalOpBlob, receiptOpType: string): ConflictEffectPayload | null {
    return ConflictEffectPayload.forStructuralReceipt(canonOp, receiptOpType)
      ?? ConflictEffectPayload.forValueReceipt(canonOp, receiptOpType);
  }

  private static forStructuralReceipt(canonOp: CanonicalOpBlob, receiptOpType: string): ConflictEffectPayload | null {
    return ConflictEffectPayload.forAddReceipt(canonOp, receiptOpType)
      ?? ConflictEffectPayload.forRemoveReceipt(canonOp, receiptOpType);
  }

  private static forValueReceipt(canonOp: CanonicalOpBlob, receiptOpType: string): ConflictEffectPayload | null {
    return ConflictEffectPayload.forPropertyReceipt(canonOp, receiptOpType)
      ?? ConflictEffectPayload.forBlobReceipt(canonOp, receiptOpType);
  }

  private static forAddReceipt(canonOp: CanonicalOpBlob, receiptOpType: string): ConflictEffectPayload | null {
    if (!ADD_RECEIPT_NAMES.has(receiptOpType)) {
      return null;
    }
    if (canonOp instanceof NodeAdd || canonOp instanceof EdgeAdd) {
      return new ConflictEffectPayload({ dot: canonOp.dot });
    }
    return canonOp instanceof ConflictOpAnchor ? new ConflictEffectPayload({ dot: canonOp.dot }) : null;
  }

  private static forRemoveReceipt(canonOp: CanonicalOpBlob, receiptOpType: string): ConflictEffectPayload | null {
    if (!REMOVE_RECEIPT_NAMES.has(receiptOpType)) {
      return null;
    }
    if (canonOp instanceof NodeRemove || canonOp instanceof EdgeRemove) {
      return new ConflictEffectPayload({ observedDots: normalizeObservedDots(canonOp.observedDots) });
    }
    return canonOp instanceof ConflictOpAnchor
      ? new ConflictEffectPayload({ observedDots: normalizeObservedDots(canonOp.observedDots) })
      : null;
  }

  private static forPropertyReceipt(canonOp: CanonicalOpBlob, receiptOpType: string): ConflictEffectPayload | null {
    if (!PROPERTY_RECEIPT_NAMES.has(receiptOpType)) {
      return null;
    }
    if (canonOp instanceof NodePropSet || canonOp instanceof EdgePropSet) {
      return new ConflictEffectPayload({ value: normalizeHashableEffectValue(canonOp.value) });
    }
    return canonOp instanceof ConflictOpAnchor ? new ConflictEffectPayload({ value: canonOp.value }) : null;
  }

  private static forBlobReceipt(canonOp: CanonicalOpBlob, receiptOpType: string): ConflictEffectPayload | null {
    if (receiptOpType !== 'BlobValue') {
      return null;
    }
    if (canonOp instanceof BlobValue) {
      return new ConflictEffectPayload({ oid: canonOp.oid });
    }
    return canonOp instanceof ConflictOpAnchor ? new ConflictEffectPayload({ oid: canonOp.oid }) : null;
  }
}

export class ConflictEffectEnvelope {
  readonly targetKind: string;
  readonly targetDigest: string;
  readonly opType: string;
  readonly payload: ConflictEffectPayload;

  constructor({ target, opType, payload }: {
    readonly target: ConflictTarget;
    readonly opType: string;
    readonly payload: ConflictEffectPayload;
  }) {
    this.targetKind = target.targetKind;
    this.targetDigest = target.targetDigest;
    this.opType = opType;
    this.payload = payload;
    Object.freeze(this);
  }
}

export function effectKey(target: ConflictTarget, effectDigest: string): string {
  return `${target.targetDigest}:${effectDigest}`;
}
