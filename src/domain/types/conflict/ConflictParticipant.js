/**
 * ConflictParticipant — runtime-backed loser in a conflict trace.
 *
 * @module domain/types/conflict/ConflictParticipant
 */

import ConflictAnchor from './ConflictAnchor.js';
import { requireNonEmptyString, requireBoolean, optionalEnum, freezeStringArray } from './validation.js';

const CTX = 'ConflictParticipant';
const VALID_RELATIONS = new Set(['concurrent', 'ordered', 'replay_equivalent', 'reducer_collapsed']);

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
}
