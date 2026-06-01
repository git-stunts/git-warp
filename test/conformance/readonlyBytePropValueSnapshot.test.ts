import { describe, expect, it } from 'vitest';
import { LWWRegister } from '../../src/domain/crdt/LWW.ts';
import { createImmutableWarpStateSnapshot } from '../../src/domain/services/ImmutableSnapshot.ts';
import ImmutableBytes from '../../src/domain/services/snapshot/ImmutableBytes.ts';
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
    state.mutatePropLWW(key, testEvent(1, 'aaaa'), sourceBytes);

    const snapshot = createImmutableWarpStateSnapshot(state);
    const snapshotValue = snapshot.prop.get(key)?.value;

    expect(snapshotValue).toBeDefined();
    expect(snapshotValue).toBeInstanceOf(ImmutableBytes);

    if (!(snapshotValue instanceof ImmutableBytes)) {
      return;
    }

    expect([...snapshotValue]).toEqual([1, 2, 3]);
    expect(snapshotValue.at(0)).toBe(1);

    const copy = snapshotValue.toUint8Array();
    expect(copy).not.toBe(sourceBytes);
    copy[0] = 9;

    expect(Array.from(sourceBytes)).toEqual([1, 2, 3]);
    expect([...snapshotValue]).toEqual([1, 2, 3]);
  });
});
