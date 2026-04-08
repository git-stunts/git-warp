/**
 * ConflictTrace — runtime-backed record of a single detected conflict.
 *
 * @module domain/types/conflict/ConflictTrace
 */

import ConflictAnchor from './ConflictAnchor.js';
import { requireNonEmptyString, requireEnum, compareStrings } from './validation.js';

const CTX = 'ConflictTrace';
const VALID_KINDS = new Set(['supersession', 'eventual_override', 'redundancy']);
const VALID_EVIDENCE_LEVELS = new Set(['summary', 'standard', 'full']);

/**
 * Deep-freezes the evidence object.
 *
 * @param {{ level: string, patchRefs: string[], receiptRefs: Array<Record<string, unknown>> }} evidence - The evidence to freeze.
 * @returns {Readonly<{ level: string, patchRefs: ReadonlyArray<string>, receiptRefs: ReadonlyArray<Record<string, unknown>> }>} Frozen evidence.
 */
function freezeEvidence(evidence) {
  if (evidence === null || evidence === undefined || typeof evidence !== 'object') {
    throw new TypeError(`${CTX}: evidence must be an object`);
  }
  requireEnum(evidence.level, VALID_EVIDENCE_LEVELS, { name: 'evidence.level', context: CTX });
  return Object.freeze({
    level: evidence.level,
    patchRefs: Object.freeze([...evidence.patchRefs]),
    receiptRefs: Object.freeze(evidence.receiptRefs.map((ref) => Object.freeze({ ...ref }))),
  });
}

/**
 * A runtime-backed record of a single conflict detected by the analyzer.
 *
 * Instances are frozen on construction. Losers, evidence, and classification notes are deep-frozen.
 */
export default class ConflictTrace {
  /**
   * Creates a frozen ConflictTrace.
   *
   * @param {{
   *   conflictId: string,
   *   kind: 'supersession'|'eventual_override'|'redundancy',
   *   target: import('./ConflictTarget.js').default,
   *   winner: import('./ConflictWinner.js').default,
   *   losers: Array<import('./ConflictParticipant.js').default>,
   *   resolution: import('./ConflictResolution.js').default,
   *   whyFingerprint: string,
   *   classificationNotes?: string[],
   *   evidence: { level: string, patchRefs: string[], receiptRefs: Array<Record<string, unknown>> }
   * }} fields - Trace fields.
   */
  constructor({ conflictId, kind, target, winner, losers, resolution, whyFingerprint, classificationNotes, evidence }) {
    this.conflictId = requireNonEmptyString(conflictId, 'conflictId', CTX);
    this.kind = requireEnum(kind, VALID_KINDS, { name: 'kind', context: CTX });
    this.target = target;
    this.winner = winner;
    this.losers = Object.freeze([...losers]);
    this.resolution = resolution;
    this.whyFingerprint = requireNonEmptyString(whyFingerprint, 'whyFingerprint', CTX);
    this.classificationNotes = classificationNotes !== undefined && classificationNotes !== null
      ? Object.freeze([...classificationNotes])
      : undefined;
    this.evidence = freezeEvidence(evidence);
    Object.freeze(this);
  }

  /**
   * Tests whether the specified writer participated as winner or loser.
   *
   * @param {string} writerId - The writer identifier to match.
   * @returns {boolean} True if the writer is involved in this conflict.
   */
  touchesWriter(writerId) {
    if (this.winner.anchor.writerId === writerId) {
      return true;
    }
    return this.losers.some((loser) => loser.anchor.writerId === writerId);
  }

  /**
   * Compares two ConflictTraces for deterministic ordering by kind, target, winner, then id.
   *
   * @param {ConflictTrace} a - First trace.
   * @param {ConflictTrace} b - Second trace.
   * @returns {number} Negative, zero, or positive for ordering.
   */
  static compare(a, b) {
    const kindCmp = compareStrings(a.kind, b.kind);
    if (kindCmp !== 0) {
      return kindCmp;
    }
    const targetCmp = compareStrings(a.target.targetDigest, b.target.targetDigest);
    if (targetCmp !== 0) {
      return targetCmp;
    }
    const winnerCmp = ConflictAnchor.compare(a.winner.anchor, b.winner.anchor);
    return winnerCmp !== 0 ? winnerCmp : compareStrings(a.conflictId, b.conflictId);
  }
}
