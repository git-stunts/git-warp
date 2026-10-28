import { describe, expect, it } from 'vitest';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import { coneObstructionFailure } from '../../../src/domain/api/ConeObstructionFailure.ts';
import ConeContendedObstruction from '../../../src/domain/services/cone/ConeContendedObstruction.ts';
import ConeSharedDotObstruction from '../../../src/domain/services/cone/ConeSharedDotObstruction.ts';
import ConeWriterDivergedObstruction from '../../../src/domain/services/cone/ConeWriterDivergedObstruction.ts';

describe('coneObstructionFailure', () => {
  it('maps each cone obstruction to a receipt outcome, reason and repair hint', () => {
    const shared = coneObstructionFailure(new ConeSharedDotObstruction({ set: 'node', dot: new Dot('w', 1), elements: ['a', 'b'], patchSha: 'f'.repeat(40) }));
    expect(shared).toMatchObject({ outcome: 'obstructed', reason: 'cone_shared_dot', repairHints: [{ code: 'repair_duplicate_dot' }] });
    const diverged = coneObstructionFailure(new ConeWriterDivergedObstruction({ writerId: 'w', foldedSha: null, tipSha: 'e'.repeat(40) }));
    expect(diverged).toMatchObject({ outcome: 'obstructed', reason: 'cone_writer_diverged', repairHints: [{ code: 'rebuild_cone_basis' }] });
    const contended = coneObstructionFailure(new ConeContendedObstruction('events', 4));
    expect(contended).toMatchObject({ outcome: 'underdetermined', reason: 'cone_contended', repairHints: [{ code: 'retry_cone_advance' }] });
  });
});
