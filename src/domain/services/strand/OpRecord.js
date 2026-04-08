/**
 * OpRecord — runtime-backed analyzed operation within a patch frame.
 *
 * Carries the target identity, receipt outcome, effect digest, event ID,
 * and causal context for a single operation after analysis.
 *
 * @module domain/services/strand/OpRecord
 */

import ConflictTarget from '../../types/conflict/ConflictTarget.js';
import { requireNonEmptyString, requireEnum, requireNonNegativeInt } from '../../types/conflict/validation.js';

const CTX = 'OpRecord';
const VALID_RESULTS = new Set(['applied', 'superseded', 'redundant']);

/**
 * A runtime-backed record of a single analyzed operation within a patch frame.
 *
 * Instances are frozen on construction.
 */
export default class OpRecord {
  /**
   * Creates a frozen OpRecord.
   *
   * @param {{
   *   target: ConflictTarget,
   *   patchSha: string,
   *   writerId: string,
   *   lamport: number,
   *   opIndex: number,
   *   receiptOpIndex: number,
   *   opType: string,
   *   receiptResult: 'applied'|'superseded'|'redundant',
   *   receiptReason?: string,
   *   effectDigest: string,
   *   eventId: import('../../utils/EventId.js').EventId,
   *   context: Map<string, number>,
   *   patchOrder: number
   * }} fields - Operation record fields.
   */
  constructor({ target, patchSha, writerId, lamport, opIndex, receiptOpIndex, opType, receiptResult, receiptReason, effectDigest, eventId, context, patchOrder }) {
    if (!(target instanceof ConflictTarget)) {
      throw new TypeError(`${CTX}: target must be a ConflictTarget instance`);
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
   *
   * @param {OpRecord} other - The other record.
   * @returns {boolean} True if they are the same record.
   */
  equals(other) {
    return this.patchSha === other.patchSha && this.opIndex === other.opIndex;
  }

  /**
   * Checks whether this record is a property-set type (NodePropSet or EdgePropSet).
   *
   * @returns {boolean} True if this is a property-set operation.
   */
  isPropertySet() {
    return this.opType === 'NodePropSet' || this.opType === 'EdgePropSet';
  }
}
