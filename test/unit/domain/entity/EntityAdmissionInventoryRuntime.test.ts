import { describe, expect, it } from 'vitest';
import type WarpWorldline from '../../../../src/domain/WarpWorldline.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import {
  bindEntityAdmissionInventoryRuntime,
  captureEntityAdmissionInventoryBasis,
  openEntityAdmissions,
  retainedEntityAdmissionInventoryBases,
} from '../../../../src/domain/entity/EntityAdmissionInventoryRuntime.ts';
import EntityAdmissionInventoryBasis from '../../../../src/domain/entity/EntityAdmissionInventoryBasis.ts';
import ConeAdmissionIndexer from '../../../../src/domain/services/cone/ConeAdmissionIndexer.ts';
import ConeFoldSession from '../../../../src/domain/services/cone/ConeFoldSession.ts';
import ConeRoot from '../../../../src/domain/services/cone/ConeRoot.ts';
import EntityAdmissionBoundary from '../../../../src/domain/types/EntityAdmissionBoundary.ts';
import EntityAdmissionOrigin from '../../../../src/domain/types/EntityAdmissionOrigin.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import { coneLane } from '../../../helpers/coneLane.ts';
import InMemoryConeRecordStore from '../../../helpers/InMemoryConeRecordStore.ts';

/** A worldline stand-in: the binding keys on identity and reads only the name. */
function worldline(name: string): WarpWorldline {
  // @ts-expect-error The inventory binding needs only a keyed object with a worldline name.
  return Object.freeze({ worldlineName: name });
}

describe('entity admission inventory runtime binding (#1039)', () => {
  it('captures the advanced lane basis, retains it on request and lists retained bases', async () => {
    const { cone, store } = coneLane('captures', [['alice', [new NodeAdd('a', new Dot('alice', 1))]]]);
    const runtime = worldline('captures');
    bindEntityAdmissionInventoryRuntime(runtime, cone);
    expect(() => bindEntityAdmissionInventoryRuntime(runtime, cone)).toThrowError(
      expect.objectContaining({ code: 'E_ENTITY_ADMISSION_INVENTORY_UNAVAILABLE' }),
    );
    const captured = await captureEntityAdmissionInventoryBasis(runtime);
    expect(captured.basis.frontierEntries.map(({ writerId }) => writerId)).toEqual(['alice']);
    expect(await retainedEntityAdmissionInventoryBases(runtime)).toEqual([]);
    await captured.retain();
    expect(store.retained('captures')).toHaveLength(1);
    expect((await retainedEntityAdmissionInventoryBases(runtime))[0]?.root.equals(captured.basis.root)).toBe(true);
    const merge = await openEntityAdmissions(runtime, captured.basis, null);
    expect(await merge.next()).toBeNull();
  });

  it('refuses an obstructed cone basis, a foreign basis and an unbound worldline', async () => {
    const { cone, feed } = coneLane('captures', [['alice', [new NodeAdd('a', new Dot('alice', 1))]]]);
    feed.diverged.add('alice');
    const runtime = worldline('captures');
    bindEntityAdmissionInventoryRuntime(runtime, cone);
    await expect(captureEntityAdmissionInventoryBasis(runtime)).rejects.toMatchObject({ code: 'E_OPTIC_CONE_OBSTRUCTED' });
    const foreign = new EntityAdmissionInventoryBasis({ frontier: new Map(), root: ConeRoot.empty(), worldlineName: 'other' });
    await expect(openEntityAdmissions(runtime, foreign, null)).rejects.toMatchObject({ code: 'E_ENTITY_ADMISSION_INVENTORY_UNAVAILABLE' });
    await expect(captureEntityAdmissionInventoryBasis(worldline('unbound'))).rejects.toMatchObject({
      code: 'E_ENTITY_ADMISSION_INVENTORY_UNAVAILABLE',
    });
  });

  it('lets a fault that is not a refusal escape the admission indexer', async () => {
    const session = new ConeFoldSession({ store: new InMemoryConeRecordStore(), root: ConeRoot.empty() });
    const boundary = new EntityAdmissionBoundary({ operationIndex: 0, operationCount: 2, origin: EntityAdmissionOrigin.suppliedSubject() });
    const forged = {
      sha: 'a'.repeat(40),
      patch: { writer: 'alice', lamport: 1, context: {}, entityAdmissions: [boundary], ops: null, writes: undefined, reads: undefined },
    };
    // @ts-expect-error A forged entry whose operations are not a list breaks the reader with a TypeError.
    await expect(ConeAdmissionIndexer.index(session, forged)).rejects.toBeInstanceOf(TypeError);
  });
});
