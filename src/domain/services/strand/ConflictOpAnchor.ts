/**
 * ConflictOpAnchor — runtime-backed anchor for malformed legacy ops
 * that conflict analysis still needs to diagnose.
 *
 * @module domain/services/strand/ConflictOpAnchor
 */

import { OP_STRATEGIES } from '../JoinReducer.ts';
import type { HashablePayload } from '../../types/conflict/HashablePayload.ts';
import type { OpV2 } from '../../types/ops/unions.ts';
import { normalizeHashableEffectValue } from './conflictHashableEffectValue.ts';

type ConflictOpAnchorFields = {
  readonly type: string;
  readonly receiptName: string;
  readonly node: string | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly label: string | null;
  readonly key: string | null;
  readonly dot: HashablePayload;
  readonly observedDots: Iterable<string> | null;
  readonly value: HashablePayload;
  readonly oid: HashablePayload;
};

export function receiptNameForRawType(opType: string): string | null {
  return OP_STRATEGIES.get(opType)?.receiptName ?? null;
}

function readNode(op: OpV2): string | null {
  return 'node' in op && typeof op.node === 'string' ? op.node : null;
}

function readFrom(op: OpV2): string | null {
  return 'from' in op && typeof op.from === 'string' ? op.from : null;
}

function readTo(op: OpV2): string | null {
  return 'to' in op && typeof op.to === 'string' ? op.to : null;
}

function readLabel(op: OpV2): string | null {
  return 'label' in op && typeof op.label === 'string' ? op.label : null;
}

function readKey(op: OpV2): string | null {
  return 'key' in op && typeof op.key === 'string' ? op.key : null;
}

function readDot(op: OpV2): HashablePayload {
  return 'dot' in op && op.dot !== undefined ? op.dot : null;
}

function readObservedDots(op: OpV2): Iterable<string> | null {
  if (!('observedDots' in op) || op.observedDots === undefined) {
    return null;
  }
  return op.observedDots;
}

function readValue(op: OpV2): HashablePayload {
  return 'value' in op ? normalizeHashableEffectValue(op.value) : null;
}

function readOid(op: OpV2): HashablePayload {
  return 'oid' in op && typeof op.oid === 'string' ? op.oid : null;
}

/**
 * Runtime-backed anchor for known but structurally incomplete legacy
 * op records. It preserves diagnostic behavior without reintroducing
 * erased shape aliases.
 */
export default class ConflictOpAnchor {
  readonly type: string;
  readonly receiptName: string;
  readonly node: string | null;
  readonly from: string | null;
  readonly to: string | null;
  readonly label: string | null;
  readonly key: string | null;
  readonly dot: HashablePayload;
  readonly observedDots: Iterable<string> | null;
  readonly value: HashablePayload;
  readonly oid: HashablePayload;

  constructor(fields: ConflictOpAnchorFields) {
    this.type = fields.type;
    this.receiptName = fields.receiptName;
    this.node = fields.node;
    this.from = fields.from;
    this.to = fields.to;
    this.label = fields.label;
    this.key = fields.key;
    this.dot = fields.dot;
    this.observedDots = fields.observedDots;
    this.value = fields.value;
    this.oid = fields.oid;
    Object.freeze(this);
  }

  static from(rawOp: OpV2): ConflictOpAnchor | null {
    const receiptName = receiptNameForRawType(rawOp.type);
    if (receiptName === null) {
      return null;
    }
    return new ConflictOpAnchor({
      type: rawOp.type,
      receiptName,
      node: readNode(rawOp),
      from: readFrom(rawOp),
      to: readTo(rawOp),
      label: readLabel(rawOp),
      key: readKey(rawOp),
      dot: readDot(rawOp),
      observedDots: readObservedDots(rawOp),
      value: readValue(rawOp),
      oid: readOid(rawOp),
    });
  }
}
