import { describe, expect, it } from 'vitest';

import DotCollision from '../../../../src/domain/repair/DotCollision.ts';
import DotRepairRecord from '../../../../src/domain/repair/DotRepairRecord.ts';
import SharedDotRemovalGuard from '../../../../src/domain/services/SharedDotRemovalGuard.ts';
import EdgeRemove from '../../../../src/domain/types/ops/EdgeRemove.ts';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.ts';
import DotRepairStorePort from '../../../../src/ports/DotRepairStorePort.ts';

const STRAND = 'b'.repeat(64);

function store(collisions: DotCollision[], repairs: DotRepairRecord[]): DotRepairStorePort {
  return Object.assign(Object.create(DotRepairStorePort.prototype), {
    collisions: async () => collisions,
    repairs: async () => repairs,
  });
}

const collision = (scope: string, dot: string) => new DotCollision({
  scope, dot, sites: [{ commit: 'c1', target: 'a' }, { commit: 'c2', target: 'b' }],
});

const repaired = (dot: string) => new DotRepairRecord({
  repairId: 'f'.repeat(64), dot, policy: 'separate', targets: ['a', 'b'], repairWriter: 'repair.alice', inputFrontier: {}, commits: ['c3'],
});

describe('SharedDotRemovalGuard (#1022)', () => {
  it('refuses node and edge removes that observe an unresolved shared dot, with a typed reason', () => {
    const guard = new SharedDotRemovalGuard(new Set(['alice:1']));

    expect(() => guard.check(new NodeRemove('a', ['alice:1', 'bob:2']))).toThrow(expect.objectContaining({
      code: 'E_PATCH_REMOVE_SHARED_DOT', context: { target: 'a', dot: 'alice:1' },
    }));
    expect(() => guard.check(new EdgeRemove({ from: 'a', to: 'b', label: 'l', observedDots: ['alice:1'] })))
      .toThrow(expect.objectContaining({ code: 'E_PATCH_REMOVE_SHARED_DOT' }));
    expect(() => guard.check(new NodeRemove('a', ['bob:2']))).not.toThrow();
  });

  it('guards each scope by its own collisions; a lane repair resolves only lane collisions', async () => {
    const recorded = store([collision('lane', 'alice:1'), collision(STRAND, 'alice:1'), collision('lane', 'carol:4')], [repaired('alice:1')]);

    const lane = await SharedDotRemovalGuard.load(recorded, 'lane');
    const strand = await SharedDotRemovalGuard.load(recorded, STRAND);

    expect(() => lane.check(new NodeRemove('a', ['alice:1']))).not.toThrow();
    expect(() => lane.check(new NodeRemove('a', ['carol:4']))).toThrow();
    expect(() => strand.check(new NodeRemove('a', ['alice:1']))).toThrow();
    expect(await SharedDotRemovalGuard.load(null, 'lane')).toBe(SharedDotRemovalGuard.NONE);
  });
});
