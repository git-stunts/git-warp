/**
 * ConflictParticipant — runtime-backed loser in a conflict trace.
 *
 * @module domain/types/conflict/ConflictParticipant
 */

import ConflictAnchor from './ConflictAnchor.js';
import { requireNonEmptyString, requireBoolean, optionalEnum, freezeStringArray, compareStrings } from './validation.js';

const CTX = 'ConflictParticipant';
const VALID_RELATIONS = new Set(['concurrent', 'ordered', 'replay_equivalent', 'reducer_collapsed']);

const NOTES = Object.freeze({
  RECEIPT_SUPERSEDED: 'receipt_superseded',
  RECEIPT_REDUNDANT: 'receipt_redundant',
  SAME_TARGET: 'same_target',
  DIFFERENT_WRITER: 'different_writer',
  DIGEST_DIFFERS: 'digest_differs',
  EFFECTIVE_THEN_LOST: 'effective_then_lost',
  REPLAY_EQUIVALENT_EFFECT: 'replay_equivalent_effect',
  CONCURRENT_TO_WINNER: 'concurrent_to_winner',
  ORDERED_BEFORE_WINNER: 'ordered_before_winner',
});

/**
 * Builds classification notes for a loser participant at full evidence level.
 *
 * @param {{ writerId: string }} winner - The winning record.
 * @param {{ writerId: string }} loser - The losing record.
 * @param {'supersession'|'eventual_override'|'redundancy'} kind - The conflict kind.
 * @param {string|undefined} relation - The causal relation.
 * @returns {string[]} Sorted deduplicated notes.
 */
const KIND_NOTES = Object.freeze({
  supersession: [NOTES.RECEIPT_SUPERSEDED],
  redundancy: [NOTES.RECEIPT_REDUNDANT, NOTES.REPLAY_EQUIVALENT_EFFECT],
  eventual_override: [NOTES.EFFECTIVE_THEN_LOST, NOTES.DIGEST_DIFFERS],
});

const RELATION_NOTES = Object.freeze({
  concurrent: NOTES.CONCURRENT_TO_WINNER,
  ordered: NOTES.ORDERED_BEFORE_WINNER,
});

/**
 * Builds classification notes for a loser participant at full evidence level.
 *
 * @param {{ winner: { writerId: string }, loser: { writerId: string }, kind: string, relation: string|undefined }} options
 * @returns {string[]} Sorted deduplicated notes.
 */
function buildNotes({ winner, loser, kind, relation }) {
  const notes = [NOTES.SAME_TARGET, ...(KIND_NOTES[kind] ?? [])];
  if (typeof relation === 'string' && RELATION_NOTES[relation] !== undefined) {
    notes.push(RELATION_NOTES[relation]);
  }
  if (loser.writerId !== winner.writerId) {
    notes.push(NOTES.DIFFERENT_WRITER);
  }
  return [...new Set(notes)].sort(compareStrings);
}

/**
 * A runtime-backed loser participant within a conflict trace.
 *
 * Instances are frozen on construction.
 */
export default class ConflictParticipant {
  /**
   * Creates a frozen ConflictParticipant.
   *
   * @param {{
   *   anchor: ConflictAnchor,
   *   effectDigest: string,
   *   causalRelationToWinner?: string,
   *   structurallyDistinctAlternative: boolean,
   *   replayableFromAnchors: boolean,
   *   notes?: string[]
   * }} fields - Participant fields.
   */
  constructor({ anchor, effectDigest, causalRelationToWinner, structurallyDistinctAlternative, replayableFromAnchors, notes }) {
    if (!(anchor instanceof ConflictAnchor)) {
      throw new TypeError(`${CTX}: anchor must be a ConflictAnchor instance`);
    }
    this.anchor = anchor;
    this.effectDigest = requireNonEmptyString(effectDigest, 'effectDigest', CTX);
    this.causalRelationToWinner = optionalEnum(causalRelationToWinner, VALID_RELATIONS, { name: 'causalRelationToWinner', context: CTX });
    this.structurallyDistinctAlternative = requireBoolean(structurallyDistinctAlternative, 'structurallyDistinctAlternative', CTX);
    this.replayableFromAnchors = requireBoolean(replayableFromAnchors, 'replayableFromAnchors', CTX);
    this.notes = notes !== undefined && notes !== null ? freezeStringArray(notes) : undefined;
    Object.freeze(this);
  }

  /**
   * Creates a ConflictParticipant from an OpRecord pair with causal analysis.
   *
   * @param {{
   *   winner: { effectDigest: string, writerId: string, context: Map<string, number>, lamport: number, patchSha: string, opIndex: number, receiptOpIndex: number },
   *   loser: { effectDigest: string, writerId: string, context: Map<string, number>, lamport: number, patchSha: string, opIndex: number, receiptOpIndex: number },
   *   kind: 'supersession'|'eventual_override'|'redundancy',
   *   evidence: 'summary'|'standard'|'full',
   *   inferCausalRelation: Function
   * }} options - Record pair and analysis context.
   * @returns {ConflictParticipant}
   */
  static fromRecord({ winner, loser, kind, evidence, inferCausalRelation }) {
    const relation = inferCausalRelation(winner, loser);
    const notes = evidence === 'full' ? buildNotes({ winner, loser, kind, relation }) : undefined;
    return new ConflictParticipant({
      anchor: ConflictAnchor.fromRecord(loser),
      effectDigest: loser.effectDigest,
      causalRelationToWinner: relation,
      structurallyDistinctAlternative: loser.effectDigest !== winner.effectDigest,
      replayableFromAnchors: true,
      notes,
    });
  }
}
