/**
 * ConflictTrace — runtime-backed record of a single detected conflict.
 *
 * @module domain/types/conflict/ConflictTrace
 */

import WarpError from '../../errors/WarpError.ts';
import ConflictAnchor from './ConflictAnchor.ts';
import type ConflictTarget from './ConflictTarget.ts';
import type ConflictWinner from './ConflictWinner.ts';
import type ConflictParticipant from './ConflictParticipant.ts';
import type ConflictResolution from './ConflictResolution.ts';
import { requireNonEmptyString, requireEnum, compareStrings } from './validation.ts';

const CTX = 'ConflictTrace';
const VALID_KINDS = new Set(['supersession', 'eventual_override', 'redundancy']);
const VALID_EVIDENCE_LEVELS = new Set(['summary', 'standard', 'full']);

type EvidencePayload = {
  level: string;
  patchRefs: readonly string[];
  receiptRefs: ReadonlyArray<Readonly<Record<string, unknown>>>;
};

/**
 * Deep-freezes the evidence object.
 */
function freezeEvidence(evidence: {
  level: string;
  patchRefs: string[];
  receiptRefs: Array<Record<string, unknown>>;
}): Readonly<EvidencePayload> {
  if (evidence === null || evidence === undefined || typeof evidence !== 'object') {
    throw new WarpError(`${CTX}: evidence must be an object`, 'E_VALIDATION');
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
  readonly conflictId: string;
  readonly kind: string;
  readonly target: ConflictTarget;
  readonly winner: ConflictWinner;
  readonly losers: readonly ConflictParticipant[];
  readonly resolution: ConflictResolution;
  readonly whyFingerprint: string;
  readonly classificationNotes: readonly string[] | undefined;
  readonly evidence: Readonly<EvidencePayload>;

  /**
   * Creates a frozen ConflictTrace.
   */
  constructor({ conflictId, kind, target, winner, losers, resolution, whyFingerprint, classificationNotes, evidence }: {
    conflictId: string;
    kind: 'supersession' | 'eventual_override' | 'redundancy';
    target: ConflictTarget;
    winner: ConflictWinner;
    losers: ConflictParticipant[];
    resolution: ConflictResolution;
    whyFingerprint: string;
    classificationNotes?: string[];
    evidence: { level: string; patchRefs: string[]; receiptRefs: Array<Record<string, unknown>> };
  }) {
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
   */
  touchesWriter(writerId: string): boolean {
    if (this.winner.anchor.writerId === writerId) {
      return true;
    }
    return this.losers.some((loser) => loser.anchor.writerId === writerId);
  }

  /**
   * Compares two ConflictTraces for deterministic ordering by kind, target, winner, then id.
   */
  static compare(a: ConflictTrace, b: ConflictTrace): number {
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
