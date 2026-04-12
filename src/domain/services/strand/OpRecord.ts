/**
 * OpRecord — runtime-backed analyzed operation within a patch frame.
 *
 * Carries the target identity, receipt outcome, effect digest, event ID,
 * and causal context for a single operation after analysis.
 *
 * @module domain/services/strand/OpRecord
 */

import ConflictTarget from '../../types/conflict/ConflictTarget.ts';
import { requireNonEmptyString, requireEnum, requireNonNegativeInt } from '../../types/conflict/validation.ts';
import StrandError from '../../errors/StrandError.ts';
import type { EventId } from '../../utils/EventId.ts';

const CTX = 'OpRecord';
const VALID_RESULTS = new Set(['applied', 'superseded', 'redundant']);

type ReceiptResult = 'applied' | 'superseded' | 'redundant';

type OpRecordFields = {
  target: ConflictTarget;
  patchSha: string;
  writerId: string;
  lamport: number;
  opIndex: number;
  receiptOpIndex: number;
  opType: string;
  receiptResult: ReceiptResult;
  receiptReason?: string;
  effectDigest: string;
  eventId: EventId;
  context: Map<string, number>;
  patchOrder: number;
};

/**
 * A runtime-backed record of a single analyzed operation within a patch frame.
 *
 * Instances are frozen on construction.
 */
export default class OpRecord {
  readonly target: ConflictTarget;
  readonly targetKey: string;
  readonly patchSha: string;
  readonly writerId: string;
  readonly lamport: number;
  readonly opIndex: number;
  readonly receiptOpIndex: number;
  readonly opType: string;
  readonly receiptResult: string;
  readonly receiptReason: string | undefined;
  readonly effectDigest: string;
  readonly eventId: EventId;
  readonly context: Map<string, number>;
  readonly patchOrder: number;

  constructor({
    target,
    patchSha,
    writerId,
    lamport,
    opIndex,
    receiptOpIndex,
    opType,
    receiptResult,
    receiptReason,
    effectDigest,
    eventId,
    context,
    patchOrder,
  }: OpRecordFields) {
    if (!(target instanceof ConflictTarget)) {
      throw new StrandError(
        `${CTX}: target must be a ConflictTarget instance`,
        { code: 'E_OP_RECORD_INVALID_TARGET' },
      );
    }
    this.target = target;
    this.targetKey = target.targetDigest;
    this.patchSha = requireNonEmptyString(patchSha, 'patchSha', CTX);
    this.writerId = requireNonEmptyString(writerId, 'writerId', CTX);
    this.lamport = requireNonNegativeInt(lamport, 'lamport', CTX);
    this.opIndex = requireNonNegativeInt(opIndex, 'opIndex', CTX);
    this.receiptOpIndex = requireNonNegativeInt(receiptOpIndex, 'receiptOpIndex', CTX);
    this.opType = requireNonEmptyString(opType, 'opType', CTX);
    this.receiptResult = requireEnum(receiptResult, VALID_RESULTS, { name: 'receiptResult', context: CTX });
    this.receiptReason = typeof receiptReason === 'string' ? receiptReason : undefined;
    this.effectDigest = requireNonEmptyString(effectDigest, 'effectDigest', CTX);
    this.eventId = eventId;
    this.context = context;
    this.patchOrder = requireNonNegativeInt(patchOrder, 'patchOrder', CTX);
    Object.freeze(this);
  }

  /**
   * Checks whether this record refers to the same patch and operation index as another.
   */
  equals(other: OpRecord): boolean {
    return this.patchSha === other.patchSha && this.opIndex === other.opIndex;
  }

  /**
   * Checks whether this record is a property-set type (NodePropSet or EdgePropSet).
   */
  isPropertySet(): boolean {
    return this.opType === 'NodePropSet' || this.opType === 'EdgePropSet';
  }
}
