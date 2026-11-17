import { describe, expect, it } from 'vitest';

import { coneObstructionFailure } from '../../../src/domain/api/ConeObstructionFailure.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import ConeContendedObstruction from '../../../src/domain/services/cone/ConeContendedObstruction.ts';
import type ConeObstruction from '../../../src/domain/services/cone/ConeObstruction.ts';
import ConeRecoveryObstruction from '../../../src/domain/services/cone/ConeRecoveryObstruction.ts';
import ConeSharedDotObstruction from '../../../src/domain/services/cone/ConeSharedDotObstruction.ts';
import ConeWriterDivergedObstruction from '../../../src/domain/services/cone/ConeWriterDivergedObstruction.ts';
import { EventId } from '../../../src/domain/utils/EventId.ts';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

const SHARED_DOT = new ConeSharedDotObstruction({ set: 'node', dot: new Dot('alice', 1), elements: ['note:keep', 'note:drop'], patchSha: SHA_A });

// Oracle: the receipt reasons and hint codes are the public receipt contract since #1039.
const CASES: ReadonlyArray<readonly [string, ConeObstruction, string, string, string]> = [
  ['a shared dot', SHARED_DOT, 'obstructed', 'cone_shared_dot', 'repair_duplicate_dot'],
  ['an unrecoverable value', new ConeRecoveryObstruction(new EventId(1, 'bob', SHA_A, 0), 'unavailable'), 'obstructed', 'cone_recovery', 'restore_patch_history'],
  ['contended folds', new ConeContendedObstruction('events', 4), 'underdetermined', 'cone_contended', 'retry_cone_advance'],
  ['a diverged writer chain', new ConeWriterDivergedObstruction({ writerId: 'alice', foldedSha: SHA_A, tipSha: SHA_B }), 'obstructed', 'cone_writer_diverged', 'rebuild_cone_basis'],
];

describe('coneObstructionFailure', () => {
  it.each(CASES)('reports %s with its receipt reason and hint code', (_label, obstruction, outcome, reason, hint) => {
    const failure = coneObstructionFailure(obstruction);

    expect({ outcome: failure.outcome, reason: failure.reason, hints: failure.repairHints.map((entry) => entry.code) })
      .toEqual({ outcome, reason, hints: [hint] });
  });

  // Oracle: the #1154 decision; v21 has no public route to a duplicate-dot repair.
  it('says that no supported duplicate-dot repair exists, so a retry does not help', () => {
    const [hint] = coneObstructionFailure(SHARED_DOT).repairHints;

    expect(hint?.message).toContain('No supported duplicate-dot repair exists; a retry gives the same result.');
  });
});
