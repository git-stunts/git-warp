import { describe, expect, it } from 'vitest';
import { LWWRegister } from '../../src/domain/crdt/LWW.ts';
import { createImmutableWarpStateSnapshot } from '../../src/domain/services/ImmutableSnapshot.ts';
import WarpState from '../../src/domain/services/state/WarpState.ts';
import { EventId } from '../../src/domain/utils/EventId.ts';

function testEvent(lamport: number, patchSha: string): EventId {
  return new EventId(lamport, 'writer-a', patchSha, 0);
}

describe('readonly byte PropValue snapshot contract', () => {
  it('keeps byte PropValue snapshots detached and blocks public byte mutation', () => {
    const key = 'node-a:bytes';
    const sourceBytes = new Uint8Array([1, 2, 3]);
    const state = WarpState.empty();
    state.prop.set(key, LWWRegister.set(testEvent(1, 'aaaa'), sourceBytes));

    const snapshot = createImmutableWarpStateSnapshot(state);
    const snapshotValue = snapshot.prop.get(key)?.value;

    expect(snapshotValue).toBeInstanceOf(Uint8Array);
    if (!(snapshotValue instanceof Uint8Array)) {
      throw new Error('expected byte PropValue snapshot');
    }

    expect(snapshotValue).not.toBe(sourceBytes);
    expect(Array.from(snapshotValue)).toEqual([1, 2, 3]);

    snapshotValue[0] = 9;

    expect(Array.from(sourceBytes)).toEqual([1, 2, 3]);
    expect(Array.from(snapshotValue)).toEqual([1, 2, 3]);
  });
});
